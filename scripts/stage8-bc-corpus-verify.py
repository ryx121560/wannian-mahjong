"""Cross-language, side-effect-free verification for the formal BC corpus protocol."""

from __future__ import annotations

import copy
import json
import os
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
    validate_stage8_bc_corpus_manifest,
    validate_stage8_bc_corpus_training_binding,
)


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
        target.write_bytes(f"formal-corpus-test:{shard['shardId']}".encode("utf-8"))
        shard["fileSha256"] = bytes_sha256(target.read_bytes())
    return _rehash(result, "manifestSha256")


def _formal_dataset_path_test(
    corpus: dict[str, object], binding: dict[str, object], ticket: dict[str, object]
) -> None:
    with tempfile.TemporaryDirectory(prefix="stage8-bc-corpus-") as temporary:
        root = Path(temporary).resolve()
        file_corpus = _rehash_corpus_with_files(corpus, root)
        file_binding = copy.deepcopy(binding)
        file_binding["corpusManifestSha256"] = file_corpus["manifestSha256"]
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
            Stage8BcFormalCorpusDataset(ticket, file_corpus, file_binding, str(root))
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
            lambda: Stage8BcFormalCorpusDataset(ticket, file_corpus, file_binding, str(root)),
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
        ],
        "torchImported": "torch" in sys.modules,
        "pilotGamesExecuted": 0,
        "trainingStarted": False,
        "artifactsWritten": False,
    }


if __name__ == "__main__":
    if sys.argv[1:] != ["--self-test"]:
        raise SystemExit("usage: stage8-bc-corpus-verify.py --self-test")
    print(json.dumps(self_test(), ensure_ascii=False, separators=(",", ":")))
