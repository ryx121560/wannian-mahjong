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

    def __init__(self, ticket: Mapping[str, Any], shard_paths: Iterable[str]):
        self.ticket = validate_execution_ticket(ticket)
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
                    or manifest.get("runId") != self.ticket["runId"]
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
                or control_identity.get("runId") != self.ticket["runId"]
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
