"""Cross-language, side-effect-free verification for the formal BC corpus protocol."""

from __future__ import annotations

import copy
import base64
import gzip
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PYTHON_SOURCE = ROOT / "src" / "game" / "stage8" / "python"
sys.path.insert(0, str(PYTHON_SOURCE))

from stage8_bc.contracts import Stage8BcContractError, bytes_sha256, identity_sha256  # noqa: E402
from stage8_bc.dataset import (  # noqa: E402
    Stage8BcFormalCorpusDataset,
    Stage8BcShardDataset,
    _read_shard,
    validate_stage8_bc_corpus_manifest,
    validate_stage8_bc_corpus_training_binding,
)


def _strict_file(candidate: Path, root: Path) -> bool:
    try:
        resolved = candidate.resolve(strict=True)
        parent = root.resolve(strict=True)
        return resolved != parent and resolved.is_file() and resolved.is_relative_to(parent)
    except Exception:
        return False


def _empty_coverage() -> dict[str, dict[str, int]]:
    from stage8_bc.dataset import CORPUS_ACTION_TYPES
    return {name: {"legalOpportunities": 0, "positiveProbability": 0, "selected": 0}
            for name in CORPUS_ACTION_TYPES}


def _verify_formal_shard(shard: dict[str, object], descriptor: dict[str, object]) -> dict[str, dict[str, int]]:
    manifest = shard["manifest"]
    records = shard["records"]
    expected = {
        "runId": descriptor["runId"], "batchId": descriptor["batchId"], "shardId": descriptor["shardId"],
        "artifactControlManifestSha256": descriptor["artifactControlManifestSha256"],
        "bcControlManifestSha256": descriptor["bcControlManifestSha256"],
        "sampleSchemaSha256": descriptor["sampleSchemaSha256"],
        "tensorContractSha256": descriptor["tensorContractSha256"],
        "sampleCount": descriptor["sampleCount"], "episodeCount": descriptor["episodeCount"],
        "sampleIds": descriptor["sampleIds"], "payloadSha256": descriptor["payloadSha256"],
    }
    if any(manifest.get(key) != value for key, value in expected.items()):
        raise Stage8BcContractError("stage8-bc-corpus-directory-shard-identity-mismatch")
    rewards: dict[str, tuple[str, tuple[float, float, float, float]]] = {}
    for item in manifest["episodeRewardReferences"]:
        delta = item["terminalDelta"]
        expected_reference = identity_sha256({
            "protocolVersion": "stage8-bc-terminal-reward-v1",
            "episodeId": item["episodeId"], "terminalDelta": delta,
        })
        if (item["terminalRewardReferenceSha256"] != expected_reference or len(delta) != 4
                or abs(sum(delta)) > 1e-9):
            raise Stage8BcContractError("stage8-bc-corpus-directory-terminal-reward-invalid")
        rewards[item["episodeId"]] = (expected_reference, tuple(delta))
    validator = Stage8BcShardDataset.__new__(Stage8BcShardDataset)
    record_identities = []
    coverage = _empty_coverage()
    for record in records:
        validator._validate_record(record, rewards, manifest["batchId"], manifest["bcControlManifestSha256"], manifest["runId"])
        sample = record["sample"]
        keys = sample["teacherEvidence"]["legalActionKeys"]
        selected = sample["teacherEvidence"]["selectedActionKey"]
        distribution = sample["teacherEvidence"]["teacherDistribution"]
        actions = sample["canonicalActions"]
        if len(actions) != len(keys):
            raise Stage8BcContractError("stage8-bc-corpus-directory-action-set-invalid")
        for index, action in enumerate(actions):
            action_type = action.get("actionType")
            if action_type not in coverage:
                raise Stage8BcContractError("stage8-bc-corpus-directory-action-type-invalid")
            counter = coverage[action_type]
            counter["legalOpportunities"] += 1
            if distribution.get(keys[index], 0) > 0:
                counter["positiveProbability"] += 1
            if keys[index] == selected:
                counter["selected"] += 1
        record_identities.append({
            "sampleId": sample["sampleId"], "sampleSha256": sample["sampleSha256"],
            "tensorRecordSha256": record["tensors"]["tensorRecordSha256"],
        })
    manifest_identity = dict(manifest)
    payload_sha256 = manifest_identity.pop("payloadSha256")
    manifest_identity["episodeRewardReferences"] = [
        {"episodeId": item["episodeId"], "terminalRewardReferenceSha256": item["terminalRewardReferenceSha256"]}
        for item in manifest["episodeRewardReferences"]
    ]
    expected_payload = identity_sha256({
        "protocolVersion": shard["protocolVersion"], "manifest": manifest_identity,
        "recordIdentities": record_identities,
    })
    if payload_sha256 != expected_payload or coverage != descriptor["actionCoverage"]:
        raise Stage8BcContractError("stage8-bc-corpus-directory-payload-or-coverage-mismatch")
    return coverage


def verify_directory(manifest_path: str, artifact_root: str, staged_run_directory: str | None = None) -> dict[str, object]:
    manifest_file = Path(manifest_path)
    root = Path(artifact_root)
    if not _strict_file(manifest_file, root) or not root.is_dir():
        raise Stage8BcContractError("stage8-bc-corpus-directory-path-invalid")
    try:
        corpus = json.loads(manifest_file.read_text(encoding="utf-8"))
    except Exception as error:
        raise Stage8BcContractError("stage8-bc-corpus-directory-manifest-read-failed") from error
    validate_stage8_bc_corpus_manifest(corpus)
    staged_root = Path(staged_run_directory).resolve(strict=True) if staged_run_directory else None
    if staged_root is not None and (not staged_root.is_dir() or not staged_root.is_relative_to(root.resolve(strict=True))
                                    or staged_root == root.resolve(strict=True)):
        raise Stage8BcContractError("stage8-bc-corpus-directory-staging-path-invalid")
    file_hashes: list[str] = []
    sample_count = 0
    split_counts = {"train": 0, "validation": 0, "finalTest": 0}
    for descriptor in corpus["shards"]:
        relative = Path(descriptor["relativePath"])
        if staged_root is not None:
            parts = relative.parts
            if len(parts) < 2 or parts[0] != corpus["runId"]:
                raise Stage8BcContractError("stage8-bc-corpus-directory-staging-identity-invalid")
            shard_path = staged_root.joinpath(*parts[1:])
        else:
            shard_path = root / relative
        if not _strict_file(shard_path, root):
            raise Stage8BcContractError("stage8-bc-corpus-directory-shard-path-invalid")
        compressed = shard_path.read_bytes()
        if bytes_sha256(compressed) != descriptor["fileSha256"]:
            raise Stage8BcContractError("stage8-bc-corpus-shard-file-hash-mismatch")
        shard = _read_shard(shard_path)
        _verify_formal_shard(shard, descriptor)
        file_hashes.append(descriptor["fileSha256"])
        sample_count += descriptor["sampleCount"]
        split_key = "finalTest" if descriptor["split"] == "final-test" else descriptor["split"]
        split_counts[split_key] += 1
    if sample_count != corpus["totals"]["sampleCount"]:
        raise Stage8BcContractError("stage8-bc-corpus-directory-sample-count-mismatch")
    return {
        "ok": True, "corpusManifestSha256": corpus["manifestSha256"], "shardCount": len(file_hashes),
        "sampleCount": sample_count, "splitCounts": split_counts,
        "fileSetSha256": identity_sha256(sorted(file_hashes)), "torchImported": "torch" in sys.modules,
    }


def _expect_failure(label: str, expected: str, callback: object) -> None:
    try:
        callback()  # type: ignore[operator]
    except Stage8BcContractError as error:
        if str(error) != expected:
            raise AssertionError(f"{label}: expected {expected}, got {error}") from error
        return
    raise AssertionError(f"{label}: expected failure {expected}")


def _rehash(value: dict[str, object], hash_key: str) -> dict[str, object]:
    result = copy.deepcopy(value)
    result.pop(hash_key, None)
    result[hash_key] = identity_sha256(result)
    return result


def _load_node_fixture() -> dict[str, object]:
    environment = dict(os.environ)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    environment["STAGE8_BC_CORPUS_EMIT_FIXTURE"] = "1"
    result = subprocess.run(
        ["node", "scripts/stage8-bc-corpus-regression.mjs"],
        cwd=ROOT,
        env=environment,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"stage8-bc-corpus-node-fixture-failed:{result.stderr.strip()}")
    payload = json.loads(result.stdout.strip().splitlines()[-1])
    if payload.get("passed") is not True or not isinstance(payload.get("fixture"), dict):
        raise RuntimeError("stage8-bc-corpus-node-fixture-invalid")
    return payload["fixture"]


def _rehash_corpus_with_files(corpus: dict[str, object], root: Path) -> dict[str, object]:
    result = copy.deepcopy(corpus)
    for shard in result["shards"]:  # type: ignore[index]
        relative_path = Path(shard["relativePath"])
        target = root / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        selected_type = next(name for name, counter in shard["actionCoverage"].items() if counter["selected"] == 1)
        action_key = f"formal-action-key-{shard['gameIndex']:06d}"
        visible_hash = identity_sha256({"gameIndex": shard["gameIndex"]})
        legal_hash = identity_sha256([action_key])
        reward_reference = identity_sha256({
            "protocolVersion": "stage8-bc-terminal-reward-v1", "episodeId": shard["episodeId"],
            "terminalDelta": shard["terminalDelta"],
        })
        sample_payload = {
            "protocolVersion": "stage8-bc-sample-protocol-v1", "sampleId": shard["sampleIds"][0],
            "batchId": shard["batchId"],
            "control": {"identity": {"runId": shard["runId"]}, "manifestSha256": shard["bcControlManifestSha256"]},
            "visibleState": {"gameIndex": shard["gameIndex"]}, "canonicalActions": [{"actionType": selected_type}],
            "completeLegalActionSetSha256": legal_hash,
            "teacherEvidence": {"visibleStateSha256": visible_hash, "legalActionSetSha256": legal_hash,
                                "legalActionKeys": [action_key], "selectedActionKey": action_key,
                                "teacherDistribution": {action_key: 1.0}},
            "replay": {"episodeId": shard["episodeId"], "episodeReward": {
                "terminal": True, "terminalDelta": shard["terminalDelta"],
                "terminalRewardReferenceSha256": reward_reference,
            }},
        }
        sample = {**sample_payload, "sampleSha256": identity_sha256(sample_payload)}
        encode_f32 = lambda values: base64.b64encode(struct.pack(f"<{len(values)}f", *values)).decode("ascii")
        encode_f64 = lambda values: base64.b64encode(struct.pack(f"<{len(values)}d", *values)).decode("ascii")
        tensor_payload = {
            "tensorContractSha256": shard["tensorContractSha256"], "visibleStateSha256": visible_hash,
            "legalActionSetSha256": legal_hash, "legalActionKeys": [action_key], "encoding": "little-endian-base64",
            "visibleStateFloat32Base64": encode_f32([0.0] * 5577),
            "canonicalActionFeaturesFloat32Base64": encode_f32([0.0] * 181),
            "legalActionMaskFloat32Base64": encode_f32([1.0]), "visibleStateDimensions": [1, 5577],
            "canonicalActionDimensions": [1, 1, 181], "legalActionMaskDimensions": [1, 1],
            "teacherDistributionFloat64Base64": encode_f64([1.0]), "selectedActionIndex": 0,
            "resolvedTerminalDeltaFloat32Base64": encode_f32(shard["terminalDelta"]),
            "terminalRewardReferenceSha256": reward_reference,
        }
        tensors = {**tensor_payload, "tensorRecordSha256": identity_sha256(tensor_payload)}
        manifest_base = {
            "runId": shard["runId"], "batchId": shard["batchId"], "shardId": shard["shardId"],
            "artifactControlManifestSha256": shard["artifactControlManifestSha256"],
            "bcControlManifestSha256": shard["bcControlManifestSha256"],
            "sampleSchemaSha256": shard["sampleSchemaSha256"], "tensorContractSha256": shard["tensorContractSha256"],
            "writerDefinitionSha256": result["control"]["identity"]["writerDefinitionSha256"],
            "sampleCount": 1, "episodeCount": 1, "sampleIds": shard["sampleIds"],
            "episodeRewardReferences": [{"episodeId": shard["episodeId"], "terminalDelta": shard["terminalDelta"],
                                          "terminalRewardReferenceSha256": reward_reference}],
        }
        payload_sha = identity_sha256({
            "protocolVersion": "stage8-bc-artifact-shard-v1",
            "manifest": {**manifest_base, "episodeRewardReferences": [{
                "episodeId": shard["episodeId"], "terminalRewardReferenceSha256": reward_reference,
            }]},
            "recordIdentities": [{"sampleId": sample["sampleId"], "sampleSha256": sample["sampleSha256"],
                                  "tensorRecordSha256": tensors["tensorRecordSha256"]}],
        })
        payload = {"protocolVersion": "stage8-bc-artifact-shard-v1",
                   "manifest": {**manifest_base, "payloadSha256": payload_sha},
                   "records": [{"sample": sample, "tensors": tensors}]}
        compressed = gzip.compress((json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8"), mtime=0)
        target.write_bytes(compressed)
        shard["payloadSha256"] = payload_sha
        shard["fileSha256"] = bytes_sha256(compressed)
    for key, split_name in (("train", "train"), ("validation", "validation"), ("finalTest", "final-test")):
        split_shards = [item for item in result["shards"] if item["split"] == split_name]
        split = result["splits"][key]
        split["payloadSetSha256"] = identity_sha256(sorted(item["payloadSha256"] for item in split_shards))
        split["splitSha256"] = identity_sha256({"split": split_name, **{name: value for name, value in split.items() if name != "splitSha256"}})
    result["totals"]["datasetPayloadSetSha256"] = identity_sha256(sorted(item["payloadSha256"] for item in result["shards"]))
    result["totals"]["trainingDatasetPayloadSetSha256"] = result["splits"]["train"]["payloadSetSha256"]
    return _rehash(result, "manifestSha256")


def _formal_dataset_path_test(
    corpus: dict[str, object], binding: dict[str, object], ticket: dict[str, object]
) -> None:
    with tempfile.TemporaryDirectory(prefix="stage8-bc-corpus-") as temporary:
        root = Path(temporary).resolve()
        file_corpus = _rehash_corpus_with_files(corpus, root)
        manifest_path = root / "corpus-manifest.pending.json"
        manifest_path.write_text(json.dumps(file_corpus, ensure_ascii=False), encoding="utf-8")
        directory_evidence = verify_directory(str(manifest_path), str(root))
        if directory_evidence["shardCount"] != 64 or directory_evidence["splitCounts"] != {"train": 48, "validation": 8, "finalTest": 8}:
            raise AssertionError("formal corpus directory verification did not inspect all splits")
        staged_root = root / ".formal-corpus.partial"
        staged_corpus = copy.deepcopy(file_corpus)
        for descriptor in staged_corpus["shards"]:
            original = root / descriptor["relativePath"]
            relative = Path(descriptor["relativePath"])
            staged_target = staged_root / relative
            staged_target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(original, staged_target)
            descriptor["relativePath"] = f"{staged_corpus['runId']}/{relative.as_posix()}"
        staged_corpus = _rehash(staged_corpus, "manifestSha256")
        staged_manifest_path = staged_root / "corpus-manifest.pending.json"
        staged_manifest_path.write_text(json.dumps(staged_corpus, ensure_ascii=False), encoding="utf-8")
        staged_evidence = verify_directory(str(staged_manifest_path), str(root), str(staged_root))
        if staged_evidence["fileSetSha256"] != directory_evidence["fileSetSha256"]:
            raise AssertionError("staging verification changed the verified shard identity")
        file_ticket = copy.deepcopy(ticket)
        file_ticket["datasetPayloadSetSha256"] = file_corpus["splits"]["train"]["payloadSetSha256"]
        file_ticket = _rehash(file_ticket, "ticketSha256")
        file_binding = copy.deepcopy(binding)
        file_binding["corpusManifestSha256"] = file_corpus["manifestSha256"]
        file_binding["trainingDatasetPayloadSetSha256"] = file_ticket["datasetPayloadSetSha256"]
        file_binding["trainSplitSha256"] = file_corpus["splits"]["train"]["splitSha256"]
        file_binding["trainShardIdsSha256"] = identity_sha256(file_corpus["splits"]["train"]["shardIds"])
        file_binding = _rehash(file_binding, "bindingSha256")
        expected_train_shards = set(file_corpus["splits"]["train"]["shardIds"])  # type: ignore[index]
        expected_train_samples = {
            sample_id
            for shard in file_corpus["shards"]  # type: ignore[index]
            if shard["shardId"] in expected_train_shards
            for sample_id in shard["sampleIds"]
        }
        observed_paths: list[str] = []
        original_init = Stage8BcShardDataset.__init__

        def fake_init(self: object, validated_ticket: object, shard_paths: object, **kwargs: object) -> None:
            del validated_ticket
            observed_paths.extend(str(path) for path in shard_paths)  # type: ignore[arg-type]
            if kwargs.get("expected_source_run_id") != file_corpus["runId"]:
                raise AssertionError("formal corpus source run identity was not forwarded")
            self.records = [{"sample_id": sample_id} for sample_id in sorted(expected_train_samples)]  # type: ignore[attr-defined]

        Stage8BcShardDataset.__init__ = fake_init  # type: ignore[method-assign]
        try:
            Stage8BcFormalCorpusDataset(file_ticket, file_corpus, file_binding, str(root))
        finally:
            Stage8BcShardDataset.__init__ = original_init  # type: ignore[method-assign]
        observed_shards = {Path(path).name for path in observed_paths}
        expected_names = {
            Path(shard["relativePath"]).name
            for shard in file_corpus["shards"]  # type: ignore[index]
            if shard["shardId"] in expected_train_shards
        }
        if len(observed_paths) != 48 or observed_shards != expected_names:
            raise AssertionError("formal corpus dataset did not select exactly the train split")

        tampered = next(
            shard for shard in file_corpus["shards"]  # type: ignore[index]
            if shard["shardId"] in expected_train_shards
        )
        (root / tampered["relativePath"]).write_bytes(b"tampered")
        _expect_failure(
            "tampered-train-shard",
            "stage8-bc-corpus-shard-file-hash-mismatch",
            lambda: Stage8BcFormalCorpusDataset(file_ticket, file_corpus, file_binding, str(root)),
        )


def self_test() -> dict[str, object]:
    fixture = _load_node_fixture()
    corpus = fixture["corpus"]
    binding = fixture["binding"]
    ticket = fixture["trainingTicket"]
    validated = validate_stage8_bc_corpus_manifest(corpus)  # type: ignore[arg-type]
    validate_stage8_bc_corpus_training_binding(corpus, binding, ticket)  # type: ignore[arg-type]
    _formal_dataset_path_test(corpus, binding, ticket)  # type: ignore[arg-type]

    cross_run = copy.deepcopy(corpus)
    cross_run["sourceRunIds"] = [corpus["runId"], "forged-run"]  # type: ignore[index]
    cross_run = _rehash(cross_run, "manifestSha256")
    _expect_failure(
        "cross-run",
        "stage8-bc-corpus-cross-run-forbidden",
        lambda: validate_stage8_bc_corpus_manifest(cross_run),
    )

    duplicate_sample = copy.deepcopy(corpus)
    duplicate_sample["shards"][1]["sampleIds"] = list(duplicate_sample["shards"][0]["sampleIds"])
    duplicate_sample["shards"][1]["episodeSha256"] = identity_sha256({
        "episodeId": duplicate_sample["shards"][1]["episodeId"],
        "fixedSeed": duplicate_sample["shards"][1]["fixedSeed"],
        "sampleIds": duplicate_sample["shards"][1]["sampleIds"],
        "terminalDelta": duplicate_sample["shards"][1]["terminalDelta"],
    })
    duplicate_sample = _rehash(duplicate_sample, "manifestSha256")
    _expect_failure(
        "duplicate-sample",
        "stage8-bc-corpus-sample-duplicate",
        lambda: validate_stage8_bc_corpus_manifest(duplicate_sample),
    )

    leaked_binding = copy.deepcopy(binding)
    leaked_binding["allowValidationSplit"] = True
    leaked_binding = _rehash(leaked_binding, "bindingSha256")
    _expect_failure(
        "validation-training-leak",
        "stage8-bc-corpus-training-binding-identity-invalid",
        lambda: validate_stage8_bc_corpus_training_binding(corpus, leaked_binding, ticket),
    )

    wrong_ticket = copy.deepcopy(ticket)
    wrong_ticket["datasetPayloadSetSha256"] = corpus["splits"]["validation"]["payloadSetSha256"]
    wrong_ticket = _rehash(wrong_ticket, "ticketSha256")
    _expect_failure(
        "wrong-training-payload-set",
        "stage8-bc-corpus-training-binding-identity-invalid",
        lambda: validate_stage8_bc_corpus_training_binding(corpus, binding, wrong_ticket),
    )

    return {
        "passed": True,
        "corpusManifestSha256": validated["manifestSha256"],
        "controls": [
            "node-python-canonical-hash-parity",
            "single-run-only",
            "global-sample-episode-dedup",
            "train-ticket-cross-binding",
            "validation-final-test-not-training",
            "train-only-path-and-file-hash-verification",
            "real-directory-all-split-shard-payload-and-reward-verification",
            "staging-to-final-relative-identity-verification",
        ],
        "torchImported": "torch" in sys.modules,
        "pilotGamesExecuted": 0,
        "trainingStarted": False,
        "artifactsWritten": False,
    }


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        result = self_test()
    elif len(sys.argv) in {4, 5} and sys.argv[1] == "--verify-directory":
        result = verify_directory(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) == 5 else None)
    else:
        raise SystemExit("usage: stage8-bc-corpus-verify.py --self-test | --verify-directory MANIFEST ROOT [STAGED_RUN]")
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
