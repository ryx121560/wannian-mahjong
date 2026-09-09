"""Validated Stage8 BC shard loading and dynamic-action collation."""

from __future__ import annotations

import base64
import gzip
import json
import math
import struct
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from .contracts import (
    ACTION_FEATURE_COUNT,
ARTIFACT_SHARD_VERSION,
    VISIBLE_FEATURE_COUNT,
    Stage8BcContractError,
    bytes_sha256,
    exact_keys,
    identity_sha256,
    is_sha256,
    require_dependency,
    valid_id,
    validate_execution_ticket,
)

MAX_UNCOMPRESSED_SHARD_BYTES = 64 * 1024 * 1024
SAMPLE_PROTOCOL_VERSION = "stage8-bc-sample-protocol-v1"
TERMINAL_REWARD_VERSION = "stage8-bc-terminal-reward-v1"
SHARD_MANIFEST_KEYS = {
    "runId", "batchId", "shardId", "artifactControlManifestSha256", "bcControlManifestSha256",
    "sampleSchemaSha256", "tensorContractSha256", "writerDefinitionSha256", "sampleCount",
    "episodeCount", "sampleIds", "episodeRewardReferences", "payloadSha256",
}
SAMPLE_KEYS = {
    "protocolVersion", "sampleId", "batchId", "control", "visibleState", "canonicalActions",
    "completeLegalActionSetSha256", "teacherEvidence", "replay", "sampleSha256",
}
TENSOR_KEYS = {
    "tensorContractSha256", "visibleStateSha256", "legalActionSetSha256", "legalActionKeys", "encoding",
    "visibleStateFloat32Base64", "canonicalActionFeaturesFloat32Base64", "legalActionMaskFloat32Base64",
    "visibleStateDimensions", "canonicalActionDimensions", "legalActionMaskDimensions",
    "teacherDistributionFloat64Base64", "selectedActionIndex", "resolvedTerminalDeltaFloat32Base64",
    "terminalRewardReferenceSha256", "tensorRecordSha256",
}


def _decode_floats(value: Any, width: int, count: int, label: str) -> tuple[float, ...]:
    if not isinstance(value, str):
        raise Stage8BcContractError(f"stage8-bc-dataset-{label}-encoding-invalid")
    try:
        raw = base64.b64decode(value, validate=True)
    except Exception as error:
        raise Stage8BcContractError(f"stage8-bc-dataset-{label}-encoding-invalid") from error
    if len(raw) != width * count:
        raise Stage8BcContractError(f"stage8-bc-dataset-{label}-shape-invalid")
    code = "f" if width == 4 else "d"
    values = struct.unpack(f"<{count}{code}", raw)
    if not all(math.isfinite(item) for item in values):
        raise Stage8BcContractError(f"stage8-bc-dataset-{label}-non-finite")
    return values


def _is_strict_child(candidate: Path, root: Path) -> bool:
    try:
        candidate.resolve(strict=True).relative_to(root.resolve(strict=True))
        return candidate.resolve(strict=True) != root.resolve(strict=True)
    except Exception:
        return False


def _read_shard(path: Path) -> dict[str, Any]:
    try:
        with gzip.open(path, "rb") as handle:
            raw = handle.read(MAX_UNCOMPRESSED_SHARD_BYTES + 1)
    except Exception as error:
        raise Stage8BcContractError("stage8-bc-dataset-shard-read-failed") from error
    if not raw or len(raw) > MAX_UNCOMPRESSED_SHARD_BYTES:
        raise Stage8BcContractError("stage8-bc-dataset-shard-size-invalid")
    try:
        value = json.loads(raw.decode("utf-8"))
    except Exception as error:
        raise Stage8BcContractError("stage8-bc-dataset-shard-json-invalid") from error
    if not exact_keys(value, {"protocolVersion", "manifest", "records"}) or value["protocolVersion"] != ARTIFACT_SHARD_VERSION:
        raise Stage8BcContractError("stage8-bc-dataset-shard-schema-invalid")
    return value


class Stage8BcShardDataset:
    """Loads only hash-bound, terminal-resolved records from approved shard paths."""

    def __init__(
        self,
        ticket: Mapping[str, Any],
        shard_paths: Iterable[str],
        *,
        expected_source_run_id: str | None = None,
    ):
        self.ticket = validate_execution_ticket(ticket)
        source_run_id = expected_source_run_id or self.ticket["runId"]
        if not valid_id(source_run_id):
            raise Stage8BcContractError("stage8-bc-dataset-source-run-id-invalid")
        root = Path(self.ticket["artifactRoot"])
        paths = [Path(item) for item in shard_paths]
        if not paths or any(not path.is_file() or not _is_strict_child(path, root) for path in paths):
            raise Stage8BcContractError("stage8-bc-dataset-shard-path-invalid")
        self.records: list[dict[str, Any]] = []
        payload_hashes: list[str] = []
        for shard_path in paths:
            shard = _read_shard(shard_path)
            manifest = shard["manifest"]
            if (not exact_keys(manifest, SHARD_MANIFEST_KEYS) or not is_sha256(manifest.get("payloadSha256"))
                    or manifest.get("runId") != source_run_id
                    or manifest.get("sampleSchemaSha256") != self.ticket["sampleSchemaSha256"]
                    or manifest.get("tensorContractSha256") != self.ticket["tensorContractSha256"]):
                raise Stage8BcContractError("stage8-bc-dataset-manifest-identity-invalid")
            reward_references: dict[str, tuple[str, tuple[float, float, float, float]]] = {}
            for item in manifest["episodeRewardReferences"]:
                if not exact_keys(item, {"episodeId", "terminalDelta", "terminalRewardReferenceSha256"}):
                    raise Stage8BcContractError("stage8-bc-dataset-terminal-reference-invalid")
                episode_id = item["episodeId"]
                delta = item["terminalDelta"]
                reference = item["terminalRewardReferenceSha256"]
                if (not isinstance(episode_id, str) or episode_id in reward_references
                        or not isinstance(delta, list) or len(delta) != 4
                        or any(not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) for value in delta)
                        or abs(sum(delta)) > 1e-9
                        or reference != identity_sha256({"protocolVersion": TERMINAL_REWARD_VERSION, "episodeId": episode_id, "terminalDelta": delta})):
                    raise Stage8BcContractError("stage8-bc-dataset-terminal-reference-invalid")
                reward_references[episode_id] = (reference, tuple(delta))
            record_identities: list[dict[str, str]] = []
            for record in shard["records"]:
                normalized = self._validate_record(
                    record,
                    reward_references,
                    manifest["batchId"],
                    manifest["bcControlManifestSha256"],
                    source_run_id,
                )
                self.records.append(normalized)
                record_identities.append({
                    "sampleId": record["sample"]["sampleId"],
                    "sampleSha256": record["sample"]["sampleSha256"],
                    "tensorRecordSha256": record["tensors"]["tensorRecordSha256"],
                })
            if (manifest["sampleCount"] != len(record_identities)
                    or manifest["episodeCount"] != len(reward_references)
                    or manifest["sampleIds"] != [item["sampleId"] for item in record_identities]):
                raise Stage8BcContractError("stage8-bc-dataset-manifest-count-or-order-invalid")
            manifest_identity = dict(manifest)
            payload_sha256 = manifest_identity.pop("payloadSha256")
            manifest_identity["episodeRewardReferences"] = [
                {"episodeId": item["episodeId"], "terminalRewardReferenceSha256": item["terminalRewardReferenceSha256"]}
                for item in manifest["episodeRewardReferences"]
            ]
            expected_payload = identity_sha256({
                "protocolVersion": ARTIFACT_SHARD_VERSION,
                "manifest": manifest_identity,
                "recordIdentities": record_identities,
            })
            if payload_sha256 != expected_payload or manifest.get("sampleCount") != len(record_identities):
                raise Stage8BcContractError("stage8-bc-dataset-payload-identity-mismatch")
            payload_hashes.append(payload_sha256)
        if identity_sha256(sorted(payload_hashes)) != self.ticket["datasetPayloadSetSha256"]:
            raise Stage8BcContractError("stage8-bc-dataset-payload-set-mismatch")

    def _validate_record(
        self,
        record: Any,
        reward_references: Mapping[str, tuple[str, tuple[float, float, float, float]]],
        batch_id: str,
        bc_control_manifest_sha256: str,
        source_run_id: str,
    ) -> dict[str, Any]:
        if not exact_keys(record, {"sample", "tensors"}) or not isinstance(record["sample"], dict) or not isinstance(record["tensors"], dict):
            raise Stage8BcContractError("stage8-bc-dataset-record-schema-invalid")
        sample = record["sample"]
        tensors = record["tensors"]
        if (not exact_keys(sample, SAMPLE_KEYS) or sample.get("protocolVersion") != SAMPLE_PROTOCOL_VERSION
                or not is_sha256(sample.get("sampleSha256")) or not valid_id(sample.get("sampleId"))):
            raise Stage8BcContractError("stage8-bc-dataset-sample-identity-invalid")
        sample_payload = dict(sample)
        sample_sha256 = sample_payload.pop("sampleSha256")
        if identity_sha256(sample_payload) != sample_sha256:
            raise Stage8BcContractError("stage8-bc-dataset-sample-hash-mismatch")
        control = sample.get("control")
        control_identity = control.get("identity") if isinstance(control, dict) else None
        if (sample.get("batchId") != batch_id
                or not isinstance(control_identity, dict)
                or control_identity.get("runId") != source_run_id
                or control.get("manifestSha256") != bc_control_manifest_sha256):
            raise Stage8BcContractError("stage8-bc-dataset-sample-control-invalid")
        if not exact_keys(tensors, TENSOR_KEYS):
            raise Stage8BcContractError("stage8-bc-dataset-tensor-schema-invalid")
        expected_tensor_hash = tensors.get("tensorRecordSha256")
        tensor_payload = dict(tensors)
        tensor_payload.pop("tensorRecordSha256", None)
        if not is_sha256(expected_tensor_hash) or identity_sha256(tensor_payload) != expected_tensor_hash:
            raise Stage8BcContractError("stage8-bc-dataset-tensor-hash-mismatch")
        keys = tensors.get("legalActionKeys")
        if not isinstance(keys, list) or not keys or keys != sorted(keys) or len(keys) != len(set(keys)):
            raise Stage8BcContractError("stage8-bc-dataset-legal-actions-invalid")
        action_count = len(keys)
        if tensors.get("encoding") != "little-endian-base64" or tensors.get("visibleStateDimensions") != [1, VISIBLE_FEATURE_COUNT] or tensors.get("canonicalActionDimensions") != [1, action_count, ACTION_FEATURE_COUNT] or tensors.get("legalActionMaskDimensions") != [1, action_count]:
            raise Stage8BcContractError("stage8-bc-dataset-tensor-contract-invalid")
        visible = _decode_floats(tensors.get("visibleStateFloat32Base64"), 4, VISIBLE_FEATURE_COUNT, "visible")
        actions = _decode_floats(tensors.get("canonicalActionFeaturesFloat32Base64"), 4, action_count * ACTION_FEATURE_COUNT, "actions")
        mask = _decode_floats(tensors.get("legalActionMaskFloat32Base64"), 4, action_count, "mask")
        teacher = _decode_floats(tensors.get("teacherDistributionFloat64Base64"), 8, action_count, "teacher")
        terminal = _decode_floats(tensors.get("resolvedTerminalDeltaFloat32Base64"), 4, 4, "terminal")
        if any(item != 1.0 for item in mask) or any(item < 0 or item > 1 for item in teacher) or abs(sum(teacher) - 1) > 1e-9:
            raise Stage8BcContractError("stage8-bc-dataset-probability-or-mask-invalid")
        if abs(sum(terminal)) > 1e-6:
            raise Stage8BcContractError("stage8-bc-dataset-terminal-reward-not-zero-sum")
        selected = tensors.get("selectedActionIndex")
        if not isinstance(selected, int) or not 0 <= selected < action_count:
            raise Stage8BcContractError("stage8-bc-dataset-selected-action-invalid")
        replay = sample.get("replay")
        episode_id = replay.get("episodeId") if isinstance(replay, dict) else None
        reference = tensors.get("terminalRewardReferenceSha256")
        reward = replay.get("episodeReward") if isinstance(replay, dict) else None
        expected_reward = reward_references.get(episode_id) if isinstance(episode_id, str) else None
        if not expected_reward or expected_reward[0] != reference or not isinstance(reward, dict):
            raise Stage8BcContractError("stage8-bc-dataset-terminal-reference-invalid")
        if reward.get("terminal") is True:
            if (reward.get("terminalDelta") != list(expected_reward[1])
                    or any(abs(value - expected) > 1e-6 for value, expected in zip(terminal, expected_reward[1]))):
                raise Stage8BcContractError("stage8-bc-dataset-terminal-reward-mismatch")
        elif reward != {"terminal": False, "episodeId": episode_id, "terminalRewardReferenceSha256": expected_reward[0]}:
            raise Stage8BcContractError("stage8-bc-dataset-terminal-reference-invalid")
        teacher_evidence = sample.get("teacherEvidence")
        teacher_distribution = teacher_evidence.get("teacherDistribution") if isinstance(teacher_evidence, dict) else None
        if (not isinstance(teacher_evidence, dict)
                or not isinstance(teacher_distribution, dict)
                or teacher_evidence.get("visibleStateSha256") != tensors.get("visibleStateSha256")
                or teacher_evidence.get("legalActionSetSha256") != tensors.get("legalActionSetSha256")
                or teacher_evidence.get("legalActionKeys") != keys
                or sample.get("completeLegalActionSetSha256") != tensors.get("legalActionSetSha256")
                or teacher_evidence.get("selectedActionKey") != keys[selected]
                or [teacher_distribution.get(key) for key in keys] != list(teacher)):
            raise Stage8BcContractError("stage8-bc-dataset-teacher-evidence-mismatch")
        return {
            "sample_id": sample["sampleId"],
            "legal_action_keys": tuple(keys),
            "visible_state": visible,
            "canonical_actions": actions,
            "legal_action_mask": mask,
            "teacher_distribution": teacher,
            "selected_action_index": selected,
            "terminal_delta": terminal,
            "tensor_record_sha256": expected_tensor_hash,
        }

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> dict[str, Any]:
        return self.records[index]


def collate_stage8_bc(records: Sequence[Mapping[str, Any]], torch_module: Any | None = None) -> dict[str, Any]:
    if not records:
        raise Stage8BcContractError("stage8-bc-collate-empty")
    torch = torch_module or require_dependency("torch")
    maximum_actions = max(len(record["legal_action_keys"]) for record in records)
    batch_size = len(records)
    visible = torch.zeros((batch_size, VISIBLE_FEATURE_COUNT), dtype=torch.float32)
    actions = torch.zeros((batch_size, maximum_actions, ACTION_FEATURE_COUNT), dtype=torch.float32)
    mask = torch.zeros((batch_size, maximum_actions), dtype=torch.float32)
    teacher = torch.zeros((batch_size, maximum_actions), dtype=torch.float32)
    value = torch.zeros((batch_size, 4), dtype=torch.float32)
    for row, record in enumerate(records):
        action_count = len(record["legal_action_keys"])
        visible[row] = torch.tensor(record["visible_state"], dtype=torch.float32)
        actions[row, :action_count] = torch.tensor(record["canonical_actions"], dtype=torch.float32).reshape(action_count, ACTION_FEATURE_COUNT)
        mask[row, :action_count] = torch.tensor(record["legal_action_mask"], dtype=torch.float32)
        teacher[row, :action_count] = torch.tensor(record["teacher_distribution"], dtype=torch.float32)
        value[row] = torch.tensor(record["terminal_delta"], dtype=torch.float32)
    return {
        "visible_state": visible,
        "canonical_actions": actions,
        "legal_action_mask": mask,
        "teacher_distribution": teacher,
        "terminal_delta": value,
        "sample_ids": tuple(record["sample_id"] for record in records),
    }


CORPUS_MANIFEST_VERSION = "stage8-bc-corpus-manifest-v1"
CORPUS_CONTROL_VERSION = "stage8-bc-corpus-control-v1"
CORPUS_CONTROL_SCOPE = "bc-formal-corpus-pilot"
CORPUS_TRAINING_BINDING_VERSION = "stage8-bc-corpus-training-binding-v1"
CORPUS_TRAINING_BINDING_SCOPE = "bc-corpus-training-input-binding"
CORPUS_ACTION_TYPES = tuple(sorted((
    "pass", "discard", "pong", "win", "directChisel", "forcedRunImmediate", "forcedRunDeferred",
    "addedKong", "chainKong", "normalConcealedKong", "forcedRunConcealed",
    "postPongCandidateConcealedKong", "doublePongForcedRun", "declineKong",
)))


def _corpus_fail(reason: str) -> None:
    raise Stage8BcContractError(reason)


def _valid_counter(value: Any) -> bool:
    return (exact_keys(value, {"legalOpportunities", "positiveProbability", "selected"})
            and all(type(value[key]) is int and value[key] >= 0
                    for key in ("legalOpportunities", "positiveProbability", "selected"))
            and value["selected"] <= value["positiveProbability"] <= value["legalOpportunities"])


def _valid_coverage(value: Any) -> bool:
    return exact_keys(value, set(CORPUS_ACTION_TYPES)) and all(_valid_counter(value[key]) for key in CORPUS_ACTION_TYPES)


def _valid_relative_path(value: Any) -> bool:
    if not isinstance(value, str) or not value or value.startswith(("/", "\\")) or "\\" in value:
        return False
    parts = value.split("/")
    return all(part not in {"", ".", ".."} and all(char.isalnum() or char in "._-" for char in part) for part in parts)


def _manifest_without_hash(value: Mapping[str, Any], key: str) -> dict[str, Any]:
    payload = dict(value)
    payload.pop(key, None)
    return payload


def _corpus_manifest_definition_sha256() -> str:
    return identity_sha256({
        "version": CORPUS_MANIFEST_VERSION,
        "source": "single-run-only-explicit-shard-file-payload-control-and-episode-identities",
        "split": "episode-seed-group-fixed-48-8-8-no-cross-split-leak",
        "uniqueness": "global-sample-id-and-episode-id",
        "coverage": "all-canonical-action-types-legal-positive-selected-report-only",
        "training": "separate-explicit-lifecycle-binding-train-split-only",
        "failure": "fused-zero-side-effect",
    })


def _validate_corpus_control(control: Mapping[str, Any]) -> None:
    if not exact_keys(control, {
        "protocolVersion", "identity", "authorization", "plan", "capacity", "allowCorpusPilotExecution",
        "allowArtifactWrite", "allowCrossRun", "allowTraining", "allowValidationSamplingForTraining",
        "allowFinalTestSamplingForTraining", "allowModelLoading", "allowExploration", "allowSmoke",
        "allowSelfplay", "allowOnnxExport", "allowRuntime", "manifestSha256",
    }):
        _corpus_fail("stage8-bc-corpus-control-schema-invalid")
    identity = control.get("identity")
    authorization = control.get("authorization")
    plan = control.get("plan")
    capacity = control.get("capacity")
    identity_keys = {
        "runId", "sourceBundleSha256", "artifactControlManifestSha256", "bcControlManifestSha256", "rulesSha256", "browserRulesSha256", "actionSpaceSha256",
        "legalActionMaskSha256", "featureSha256", "visibleInformationSha256", "tensorContractSha256",
        "teacherDefinitionSha256", "sampleSchemaSha256", "writerDefinitionSha256", "trajectoryDefinitionSha256",
        "pythonDatasetDefinitionSha256", "corpusManifestDefinitionSha256", "capacityPreflightSha256",
    }
    if (not exact_keys(identity, identity_keys)
            or not exact_keys(authorization, {"approvalId", "granted", "scope"})
            or not exact_keys(plan, {
                "baseSeed", "seedDerivation", "gameCount", "candidateSeatDerivation", "candidateSeatGames",
                "workers", "curriculum", "exploration", "modelLoading", "recordAllSeats",
                "maxSuccessfulTransitionsPerGame", "splitUnit", "splitCounts", "splitAssignment", "crossRunPolicy",
            })
            or not exact_keys(plan.get("splitCounts"), {"train", "validation", "finalTest"})
            or not exact_keys(capacity, {
                "maxRunBytes", "rootHardLimitBytes", "rootFusePercent", "preflightBeforeRun",
                "preflightBeforeEachBatchCommit",
            })):
        _corpus_fail("stage8-bc-corpus-control-nested-schema-invalid")
    if (control["protocolVersion"] != CORPUS_CONTROL_VERSION or not valid_id(identity["runId"])
            or authorization != {"approvalId": authorization.get("approvalId"), "granted": True, "scope": CORPUS_CONTROL_SCOPE}
            or not valid_id(authorization["approvalId"])):
        _corpus_fail("stage8-bc-corpus-control-authorization-or-identity-invalid")
    if any(not is_sha256(value) for key, value in identity.items() if key != "runId"):
        _corpus_fail("stage8-bc-corpus-control-hash-invalid")
    if identity["legalActionMaskSha256"] != identity["actionSpaceSha256"] or identity["visibleInformationSha256"] != identity["featureSha256"]:
        _corpus_fail("stage8-bc-corpus-control-visible-or-mask-identity-unbound")
    if identity["corpusManifestDefinitionSha256"] != _corpus_manifest_definition_sha256():
        _corpus_fail("stage8-bc-corpus-control-definition-mismatch")
    if plan != {
        "baseSeed": 2026090800, "seedDerivation": "base-plus-game-index-v1", "gameCount": 64,
        "candidateSeatDerivation": "game-index-modulo-four-v1", "candidateSeatGames": [16, 16, 16, 16],
        "workers": 1, "curriculum": "normal-full-rules", "exploration": False, "modelLoading": False,
        "recordAllSeats": True, "maxSuccessfulTransitionsPerGame": 600, "splitUnit": "episode-seed-group",
        "splitCounts": {"train": 48, "validation": 8, "finalTest": 8},
        "splitAssignment": "game-index-ranges-v1", "crossRunPolicy": "single-run-only",
    }:
        _corpus_fail("stage8-bc-corpus-control-plan-invalid")
    if capacity != {
        "maxRunBytes": 5 * 1024 * 1024 * 1024, "rootHardLimitBytes": 68719476736,
        "rootFusePercent": 80, "preflightBeforeRun": True, "preflightBeforeEachBatchCommit": True,
    }:
        _corpus_fail("stage8-bc-corpus-control-capacity-invalid")
    if (control["allowCorpusPilotExecution"] is not True or control["allowArtifactWrite"] is not True
            or any(control[key] is not False for key in (
                "allowCrossRun", "allowTraining", "allowValidationSamplingForTraining",
                "allowFinalTestSamplingForTraining", "allowModelLoading", "allowExploration", "allowSmoke",
                "allowSelfplay", "allowOnnxExport", "allowRuntime",
            ))):
        _corpus_fail("stage8-bc-corpus-control-side-effect-boundary-invalid")
    if identity_sha256(_manifest_without_hash(control, "manifestSha256")) != control["manifestSha256"]:
        _corpus_fail("stage8-bc-corpus-control-manifest-hash-mismatch")


def _split_for_index(index: int) -> str:
    if index < 48:
        return "train"
    return "validation" if index < 56 else "final-test"


def validate_stage8_bc_corpus_manifest(corpus: Mapping[str, Any]) -> dict[str, Any]:
    if not exact_keys(corpus, {
        "protocolVersion", "corpusId", "runId", "control", "sourceRunPolicy", "sourceRunIds", "shards",
        "splits", "totals", "actionCoverage", "anomalies", "manifestSha256",
    }):
        _corpus_fail("stage8-bc-corpus-manifest-schema-invalid")
    if (corpus["protocolVersion"] != CORPUS_MANIFEST_VERSION or not valid_id(corpus["corpusId"])
            or not valid_id(corpus["runId"])):
        _corpus_fail("stage8-bc-corpus-manifest-identity-invalid")
    _validate_corpus_control(corpus["control"])
    if corpus["control"]["identity"]["runId"] != corpus["runId"]:
        _corpus_fail("stage8-bc-corpus-manifest-control-identity-mismatch")
    if corpus["sourceRunPolicy"] != "single-run-only" or corpus["sourceRunIds"] != [corpus["runId"]]:
        _corpus_fail("stage8-bc-corpus-cross-run-forbidden")
    shards = corpus["shards"]
    if not isinstance(shards, list) or len(shards) != 64:
        _corpus_fail("stage8-bc-corpus-shard-count-invalid")
    sample_ids: set[str] = set()
    episode_ids: set[str] = set()
    relative_paths: set[str] = set()
    file_hashes: set[str] = set()
    payload_hashes: set[str] = set()
    aggregate = {key: {"legalOpportunities": 0, "positiveProbability": 0, "selected": 0} for key in CORPUS_ACTION_TYPES}
    shard_keys = {
        "relativePath", "fileSha256", "payloadSha256", "runId", "batchId", "shardId", "gameIndex",
        "fixedSeed", "candidateSeat", "split", "artifactControlManifestSha256", "bcControlManifestSha256",
        "sourceBundleSha256", "sampleSchemaSha256", "tensorContractSha256", "teacherDefinitionSha256",
        "sampleCount", "episodeCount", "episodeId", "episodeSha256", "sampleIds", "terminalDelta", "actionCoverage",
    }
    for index, shard in enumerate(shards):
        if not exact_keys(shard, shard_keys):
            _corpus_fail("stage8-bc-corpus-shard-schema-invalid")
        hashes = [shard[key] for key in (
            "fileSha256", "payloadSha256", "artifactControlManifestSha256", "bcControlManifestSha256",
            "sourceBundleSha256", "sampleSchemaSha256", "tensorContractSha256", "teacherDefinitionSha256", "episodeSha256",
        )]
        delta = shard["terminalDelta"]
        if (not _valid_relative_path(shard["relativePath"]) or any(not is_sha256(value) for value in hashes)
                or shard["runId"] != corpus["runId"] or not valid_id(shard["batchId"]) or not valid_id(shard["shardId"])
                or shard["gameIndex"] != index or shard["fixedSeed"] != 2026090800 + index
                or shard["candidateSeat"] != index % 4 or shard["split"] != _split_for_index(index)
                or shard["sourceBundleSha256"] != corpus["control"]["identity"]["sourceBundleSha256"]
                or shard["artifactControlManifestSha256"] != corpus["control"]["identity"]["artifactControlManifestSha256"]
                or shard["bcControlManifestSha256"] != corpus["control"]["identity"]["bcControlManifestSha256"]
                or shard["sampleSchemaSha256"] != corpus["control"]["identity"]["sampleSchemaSha256"]
                or shard["tensorContractSha256"] != corpus["control"]["identity"]["tensorContractSha256"]
                or shard["teacherDefinitionSha256"] != corpus["control"]["identity"]["teacherDefinitionSha256"]
                or type(shard["sampleCount"]) is not int or shard["sampleCount"] < 1
                or shard["episodeCount"] != 1 or not valid_id(shard["episodeId"])
                or shard["episodeSha256"] != identity_sha256({
                    "episodeId": shard["episodeId"], "fixedSeed": shard["fixedSeed"],
                    "sampleIds": shard["sampleIds"], "terminalDelta": shard["terminalDelta"],
                })
                or not isinstance(shard["sampleIds"], list) or len(shard["sampleIds"]) != shard["sampleCount"]
                or any(not valid_id(value) for value in shard["sampleIds"])
                or not isinstance(delta, list) or len(delta) != 4
                or any(not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) for value in delta)
                or abs(sum(delta)) > 1e-12 or not _valid_coverage(shard["actionCoverage"])
                or sum(shard["actionCoverage"][key]["selected"] for key in CORPUS_ACTION_TYPES) != shard["sampleCount"]):
            _corpus_fail("stage8-bc-corpus-shard-identity-or-result-invalid")
        if (shard["relativePath"] in relative_paths or shard["fileSha256"] in file_hashes
                or shard["payloadSha256"] in payload_hashes):
            _corpus_fail("stage8-bc-corpus-shard-duplicate")
        relative_paths.add(shard["relativePath"]); file_hashes.add(shard["fileSha256"]); payload_hashes.add(shard["payloadSha256"])
        if shard["episodeId"] in episode_ids:
            _corpus_fail("stage8-bc-corpus-episode-duplicate")
        episode_ids.add(shard["episodeId"])
        for sample_id in shard["sampleIds"]:
            if sample_id in sample_ids:
                _corpus_fail("stage8-bc-corpus-sample-duplicate")
            sample_ids.add(sample_id)
        for action_type in CORPUS_ACTION_TYPES:
            for counter in aggregate[action_type]:
                aggregate[action_type][counter] += shard["actionCoverage"][action_type][counter]
    if not exact_keys(corpus["splits"], {"train", "validation", "finalTest"}):
        _corpus_fail("stage8-bc-corpus-split-invalid")
    split_names = (("train", "train"), ("validation", "validation"), ("finalTest", "final-test"))
    all_split_episodes: list[str] = []
    for manifest_key, descriptor_split in split_names:
        split = corpus["splits"][manifest_key]
        expected = [shard for shard in shards if shard["split"] == descriptor_split]
        if not exact_keys(split, {"gameIndexes", "shardIds", "episodeIds", "payloadSetSha256", "splitSha256"}):
            _corpus_fail("stage8-bc-corpus-split-invalid")
        split_payload = _manifest_without_hash(split, "splitSha256")
        if (split["gameIndexes"] != [shard["gameIndex"] for shard in expected]
                or split["shardIds"] != [shard["shardId"] for shard in expected]
                or split["episodeIds"] != [shard["episodeId"] for shard in expected]
                or split["payloadSetSha256"] != identity_sha256(sorted(shard["payloadSha256"] for shard in expected))
                or split["splitSha256"] != identity_sha256({"split": descriptor_split, **split_payload})):
            _corpus_fail("stage8-bc-corpus-split-invalid")
        all_split_episodes.extend(split["episodeIds"])
    if len(all_split_episodes) != 64 or len(set(all_split_episodes)) != 64:
        _corpus_fail("stage8-bc-corpus-split-leak")
    if not _valid_coverage(corpus["actionCoverage"]) or corpus["actionCoverage"] != aggregate:
        _corpus_fail("stage8-bc-corpus-action-coverage-invalid")
    if (not exact_keys(corpus["anomalies"], {
        "illegalActions", "hiddenInformationLeaks", "nonFiniteValues", "nonZeroSumSettlements",
        "replayMismatches", "duplicateSamples", "duplicateEpisodes", "splitLeaks", "incompatibleIdentities",
    }) or any(value != 0 for value in corpus["anomalies"].values())):
        _corpus_fail("stage8-bc-corpus-hard-anomaly")
    totals = corpus["totals"]
    if not exact_keys(totals, {"shardCount", "episodeCount", "sampleCount", "datasetPayloadSetSha256", "trainingDatasetPayloadSetSha256"}):
        _corpus_fail("stage8-bc-corpus-total-identity-invalid")
    all_payload_set = identity_sha256(sorted(payload_hashes))
    if (totals["shardCount"] != 64 or totals["episodeCount"] != 64
            or totals["sampleCount"] != sum(shard["sampleCount"] for shard in shards)
            or totals["datasetPayloadSetSha256"] != all_payload_set
            or totals["trainingDatasetPayloadSetSha256"] != corpus["splits"]["train"]["payloadSetSha256"]):
        _corpus_fail("stage8-bc-corpus-total-identity-invalid")
    if identity_sha256(_manifest_without_hash(corpus, "manifestSha256")) != corpus["manifestSha256"]:
        _corpus_fail("stage8-bc-corpus-manifest-hash-mismatch")
    return dict(corpus)


def validate_stage8_bc_corpus_training_binding(
    corpus: Mapping[str, Any],
    binding: Mapping[str, Any],
    training_ticket: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    validated_corpus = validate_stage8_bc_corpus_manifest(corpus)
    ticket = validate_execution_ticket(training_ticket, "bc-training")
    if not exact_keys(binding, {
        "protocolVersion", "corpusId", "corpusManifestSha256", "corpusRunId", "trainingRunId",
        "trainingLifecycleManifestSha256", "trainingDatasetPayloadSetSha256", "trainSplitSha256",
        "trainShardIdsSha256", "authorization", "allowTrainSplit", "allowValidationSplit",
        "allowFinalTestSplit", "bindingSha256",
    }) or not exact_keys(binding.get("authorization"), {"approvalId", "granted", "scope"}):
        _corpus_fail("stage8-bc-corpus-training-binding-schema-invalid")
    authorization = binding["authorization"]
    train_split = validated_corpus["splits"]["train"]
    if (binding["protocolVersion"] != CORPUS_TRAINING_BINDING_VERSION
            or not valid_id(binding["trainingRunId"]) or not valid_id(authorization["approvalId"])
            or authorization["granted"] is not True or authorization["scope"] != CORPUS_TRAINING_BINDING_SCOPE
            or binding["corpusId"] != validated_corpus["corpusId"]
            or binding["corpusManifestSha256"] != validated_corpus["manifestSha256"]
            or binding["corpusRunId"] != validated_corpus["runId"]
            or binding["trainingRunId"] != ticket["runId"]
            or binding["trainingLifecycleManifestSha256"] != ticket["lifecycleManifestSha256"]
            or binding["trainingDatasetPayloadSetSha256"] != ticket["datasetPayloadSetSha256"]
            or binding["trainingDatasetPayloadSetSha256"] != train_split["payloadSetSha256"]
            or binding["trainSplitSha256"] != train_split["splitSha256"]
            or binding["trainShardIdsSha256"] != identity_sha256(train_split["shardIds"])
            or binding["allowTrainSplit"] is not True or binding["allowValidationSplit"] is not False
            or binding["allowFinalTestSplit"] is not False):
        _corpus_fail("stage8-bc-corpus-training-binding-identity-invalid")
    if identity_sha256(_manifest_without_hash(binding, "bindingSha256")) != binding["bindingSha256"]:
        _corpus_fail("stage8-bc-corpus-training-binding-hash-mismatch")
    return validated_corpus, ticket


class Stage8BcFormalCorpusDataset(Stage8BcShardDataset):
    """Loads exactly the hash-bound train split from an admitted formal corpus."""

    def __init__(
        self,
        ticket: Mapping[str, Any],
        corpus: Mapping[str, Any],
        training_binding: Mapping[str, Any],
        artifact_root: str,
    ):
        validated_corpus, validated_ticket = validate_stage8_bc_corpus_training_binding(corpus, training_binding, ticket)
        root = Path(artifact_root).resolve(strict=True)
        train_ids = set(validated_corpus["splits"]["train"]["shardIds"])
        train_shards = [shard for shard in validated_corpus["shards"] if shard["shardId"] in train_ids]
        if len(train_shards) != 48:
            _corpus_fail("stage8-bc-corpus-train-split-invalid")
        paths: list[str] = []
        for shard in train_shards:
            candidate = (root / Path(shard["relativePath"])).resolve(strict=True)
            if not _is_strict_child(candidate, root) or not candidate.is_file():
                _corpus_fail("stage8-bc-corpus-shard-path-invalid")
            if bytes_sha256(candidate.read_bytes()) != shard["fileSha256"]:
                _corpus_fail("stage8-bc-corpus-shard-file-hash-mismatch")
            paths.append(str(candidate))
        super().__init__(
            validated_ticket,
            paths,
            expected_source_run_id=validated_corpus["runId"],
        )
        expected_sample_ids = {
            sample_id for shard in train_shards for sample_id in shard["sampleIds"]
        }
        actual_sample_ids = {record["sample_id"] for record in self.records}
        if actual_sample_ids != expected_sample_ids or len(actual_sample_ids) != len(self.records):
            _corpus_fail("stage8-bc-corpus-train-sample-identity-mismatch")
