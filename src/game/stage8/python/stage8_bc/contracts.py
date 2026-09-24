"""Shared, side-effect-free Stage8 BC identity and path contracts."""

from __future__ import annotations

import hashlib
import importlib
import json
import math
import ntpath
import os
import re
from pathlib import Path
from typing import Any, Mapping, Sequence

PYTHON_TICKET_VERSION = "stage8-bc-python-ticket-v1"
CHECKPOINT_EVIDENCE_VERSION = "stage8-bc-checkpoint-evidence-v1"
ONNX_EXPORT_EVIDENCE_VERSION = "stage8-bc-onnx-export-evidence-v1"
PARITY_EVIDENCE_VERSION = "stage8-bc-python-node-parity-v1"
ARTIFACT_SHARD_VERSION = "stage8-bc-artifact-shard-v1"
VISIBLE_FEATURE_COUNT = 5577
ACTION_FEATURE_COUNT = 181
MODEL_MAX_FILE_BYTES = 10 * 1024 * 1024


class Stage8BcContractError(RuntimeError):
    """Raised before a side effect whenever an identity boundary is invalid."""


def _number(value: float) -> str:
    if not math.isfinite(value):
        raise Stage8BcContractError("stage8-bc-non-finite-number")
    if value == 0:
        return "0"
    if value.is_integer() and abs(value) < 1e21:
        return str(int(value))
    text = repr(value).lower()
    absolute = abs(value)
    if 1e-6 <= absolute < 1e21 and "e" in text:
        mantissa, exponent_text = text.split("e", 1)
        exponent = int(exponent_text)
        sign = "-" if mantissa.startswith("-") else ""
        unsigned = mantissa.lstrip("+-")
        integer_digits, _, fractional_digits = unsigned.partition(".")
        digits = integer_digits + fractional_digits
        decimal_index = len(integer_digits) + exponent
        if decimal_index <= 0:
            return sign + "0." + "0" * (-decimal_index) + digits
        if decimal_index >= len(digits):
            return sign + digits + "0" * (decimal_index - len(digits))
        return sign + digits[:decimal_index] + "." + digits[decimal_index:]
    if "e" in text:
        mantissa, exponent = text.split("e", 1)
        sign = ""
        if exponent.startswith(("+", "-")):
            sign, exponent = exponent[0], exponent[1:]
        exponent = exponent.lstrip("0") or "0"
        return f"{mantissa}e{sign}{exponent}"
    return text


def canonical_json(value: Any) -> str:
    """Matches the project's canonical JSON for the supported protocol values."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return _number(value)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if isinstance(value, Mapping):
        return "{" + ",".join(
            f"{json.dumps(str(key), ensure_ascii=False)}:{canonical_json(value[key])}"
            for key in sorted(value)
        ) + "}"
    raise Stage8BcContractError("stage8-bc-unsupported-canonical-value")


def identity_sha256(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def bytes_sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def checkpoint_definition_sha256() -> str:
    return identity_sha256({
        "version": CHECKPOINT_EVIDENCE_VERSION,
        "commit": "in-memory-serialization-exclusive-partial-write-readback-atomic-rename",
        "resume": "last-complete-only-full-run-dataset-model-optimizer-identity",
        "failure": "no-partial-checkpoint-commit",
    })


def parity_definition_sha256() -> str:
    return identity_sha256({
        "version": PARITY_EVIDENCE_VERSION,
        "inputs": "same-visible-state-and-complete-canonical-legal-action-tensors",
        "outputs": "python-and-node-policy-logits-and-four-seat-value",
        "comparison": "finite-elementwise-absolute-tolerance",
        "identity": "same-onnx-model-manifest-tensor-visible-and-action-set",
    })


def is_sha256(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(char in "0123456789abcdefABCDEF" for char in value)


def valid_id(value: Any) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9-]{2,127}", value) is not None


def exact_keys(value: Any, keys: set[str]) -> bool:
    return isinstance(value, dict) and set(value) == keys


def _normalize_windows(value: str) -> str:
    return ntpath.normpath(value).rstrip("\\/").lower()


def _strict_child(candidate: str, root: str) -> bool:
    normalized_candidate = _normalize_windows(candidate)
    normalized_root = _normalize_windows(root)
    return normalized_candidate != normalized_root and normalized_candidate.startswith(normalized_root + "\\")


TICKET_KEYS = {
    "protocolVersion", "phase", "runId", "approvalId", "artifactRoot", "runDirectory",
    "lifecycleManifestSha256", "lifecycleIdentitySha256", "datasetPayloadSetSha256", "rulesSha256",
    "actionSpaceSha256", "legalActionMaskSha256", "featureSha256", "visibleInformationSha256",
    "sampleSchemaSha256", "tensorContractSha256", "pythonEnvironmentLockSha256", "pythonSourceBundleSha256",
    "modelDefinitionSha256", "trainingDefinitionSha256", "checkpointDefinitionSha256",
    "onnxExportDefinitionSha256", "parityDefinitionSha256", "inferenceContractSha256",
    "onnxRuntimePackage", "onnxRuntimeVersion", "onnxExecutionProvider", "onnxSessionOptionsSha256",
    "trainingPlan", "modelConfig", "allowTraining", "allowCheckpointWrite", "allowOnnxExport", "ticketSha256",
}

TRAINING_PLAN_KEYS = {
    "fixedSeed", "maxSteps", "epochs", "batchSize", "learningRate", "policyLossWeight",
    "valueLossWeight", "deterministicAlgorithms", "valueTarget",
}
MODEL_CONFIG_KEYS = {
    "visibleFeatureCount", "actionFeatureCount", "stateHiddenSize", "stateEmbeddingSize",
    "actionEmbeddingSize", "valueSeats", "zeroSumValueHead",
}
CHECKPOINT_EVIDENCE_KEYS = {
    "protocolVersion", "runId", "checkpointId", "lifecycleManifestSha256", "datasetPayloadSetSha256",
    "modelDefinitionSha256", "trainingDefinitionSha256", "checkpointDefinitionSha256", "checkpointStep",
    "checkpointFileSha256", "modelStateSha256", "optimizerStateSha256", "policyLossDecimal",
    "valueLossDecimal", "totalLossDecimal", "hardAnomalies", "lastComplete", "evidenceSha256",
}


def validate_execution_ticket(ticket: Mapping[str, Any], expected_phase: str | None = None) -> dict[str, Any]:
    if not exact_keys(ticket, TICKET_KEYS):
        raise Stage8BcContractError("stage8-bc-python-ticket-schema-invalid")
    phase = ticket["phase"]
    if ticket["protocolVersion"] != PYTHON_TICKET_VERSION or phase not in {"bc-training", "bc-onnx-export", "bc-parity-verify"}:
        raise Stage8BcContractError("stage8-bc-python-ticket-version-or-phase-invalid")
    if expected_phase is not None and phase != expected_phase:
        raise Stage8BcContractError("stage8-bc-python-ticket-phase-mismatch")
    if not valid_id(ticket["runId"]) or not valid_id(ticket["approvalId"]):
        raise Stage8BcContractError("stage8-bc-python-ticket-authorization-invalid")
    hash_keys = [key for key in TICKET_KEYS if key.endswith("Sha256")]
    if any(not is_sha256(ticket[key]) for key in hash_keys):
        raise Stage8BcContractError("stage8-bc-python-ticket-hash-invalid")
    if ticket["legalActionMaskSha256"] != ticket["actionSpaceSha256"] or ticket["visibleInformationSha256"] != ticket["featureSha256"]:
        raise Stage8BcContractError("stage8-bc-python-ticket-visible-or-mask-unbound")
    if not ntpath.isabs(ticket["artifactRoot"]) or not ntpath.isabs(ticket["runDirectory"]) or not _strict_child(ticket["runDirectory"], ticket["artifactRoot"]):
        raise Stage8BcContractError("stage8-bc-python-ticket-path-invalid")
    expected_flags = {
        "bc-training": (True, True, False),
        "bc-onnx-export": (False, False, True),
        "bc-parity-verify": (False, False, False),
    }[phase]
    if (ticket["allowTraining"], ticket["allowCheckpointWrite"], ticket["allowOnnxExport"]) != expected_flags:
        raise Stage8BcContractError("stage8-bc-python-ticket-side-effect-boundary-invalid")
    plan = ticket["trainingPlan"]
    if not exact_keys(plan, TRAINING_PLAN_KEYS) or plan.get("deterministicAlgorithms") is not True or plan.get("valueTarget") != "terminal-four-seat-zero-sum-delta":
        raise Stage8BcContractError("stage8-bc-python-ticket-training-plan-invalid")
    if (type(plan.get("fixedSeed")) is not int or not 0 <= plan["fixedSeed"] <= 0xFFFFFFFF
            or type(plan.get("maxSteps")) is not int or not 1 <= plan["maxSteps"] <= 315
            or type(plan.get("epochs")) is not int or not 1 <= plan["epochs"] <= 1000
            or type(plan.get("batchSize")) is not int or not 1 <= plan["batchSize"] <= 4096
            or not isinstance(plan.get("learningRate"), (int, float)) or isinstance(plan.get("learningRate"), bool)
            or not math.isfinite(plan["learningRate"]) or not 0 < plan["learningRate"] <= 1
            or any(not isinstance(plan.get(key), (int, float)) or isinstance(plan.get(key), bool)
                   or not math.isfinite(plan[key]) or plan[key] <= 0
                   for key in ("policyLossWeight", "valueLossWeight"))):
        raise Stage8BcContractError("stage8-bc-python-ticket-step-limit-invalid")
    config = ticket["modelConfig"]
    if (not exact_keys(config, MODEL_CONFIG_KEYS)
            or config != {"visibleFeatureCount": VISIBLE_FEATURE_COUNT, "actionFeatureCount": ACTION_FEATURE_COUNT,
                          "stateHiddenSize": 256, "stateEmbeddingSize": 128, "actionEmbeddingSize": 64,
                          "valueSeats": 4, "zeroSumValueHead": True}):
        raise Stage8BcContractError("stage8-bc-python-ticket-model-config-invalid")
    if ticket["onnxRuntimePackage"] != "onnxruntime-node" or ticket["onnxRuntimeVersion"] != "1.27.0" or ticket["onnxExecutionProvider"] != "cpu":
        raise Stage8BcContractError("stage8-bc-python-ticket-onnx-runtime-invalid")
    payload = dict(ticket)
    actual_hash = payload.pop("ticketSha256")
    if identity_sha256(payload) != actual_hash:
        raise Stage8BcContractError("stage8-bc-python-ticket-hash-mismatch")
    return dict(ticket)


def _finite_decimal(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        return math.isfinite(float(value))
    except Exception:
        return False


def validate_checkpoint_evidence(
    ticket: Mapping[str, Any],
    evidence: Mapping[str, Any],
    *,
    require_lifecycle_manifest_match: bool,
) -> dict[str, Any]:
    validated = validate_execution_ticket(ticket)
    if not exact_keys(evidence, CHECKPOINT_EVIDENCE_KEYS):
        raise Stage8BcContractError("stage8-bc-checkpoint-evidence-schema-invalid")
    hashes = [
        evidence.get("lifecycleManifestSha256"), evidence.get("datasetPayloadSetSha256"),
        evidence.get("modelDefinitionSha256"), evidence.get("trainingDefinitionSha256"),
        evidence.get("checkpointDefinitionSha256"), evidence.get("checkpointFileSha256"),
        evidence.get("modelStateSha256"), evidence.get("optimizerStateSha256"), evidence.get("evidenceSha256"),
    ]
    if (evidence.get("protocolVersion") != CHECKPOINT_EVIDENCE_VERSION
            or evidence.get("runId") != validated["runId"] or not valid_id(evidence.get("checkpointId"))
            or any(not is_sha256(value) for value in hashes)
            or require_lifecycle_manifest_match and evidence.get("lifecycleManifestSha256") != validated["lifecycleManifestSha256"]
            or evidence.get("datasetPayloadSetSha256") != validated["datasetPayloadSetSha256"]
            or evidence.get("modelDefinitionSha256") != validated["modelDefinitionSha256"]
            or evidence.get("trainingDefinitionSha256") != validated["trainingDefinitionSha256"]
            or evidence.get("checkpointDefinitionSha256") != validated["checkpointDefinitionSha256"]
            or type(evidence.get("checkpointStep")) is not int
            or not 1 <= evidence["checkpointStep"] <= validated["trainingPlan"]["maxSteps"]
            or any(not _finite_decimal(evidence.get(key)) for key in ("policyLossDecimal", "valueLossDecimal", "totalLossDecimal"))
            or evidence.get("hardAnomalies") != 0 or evidence.get("lastComplete") is not True):
        raise Stage8BcContractError("stage8-bc-checkpoint-evidence-invalid")
    payload = dict(evidence)
    actual_hash = payload.pop("evidenceSha256")
    if identity_sha256(payload) != actual_hash:
        raise Stage8BcContractError("stage8-bc-checkpoint-evidence-hash-mismatch")
    return dict(evidence)


def require_dependency(name: str) -> Any:
    try:
        return importlib.import_module(name)
    except Exception as error:
        raise Stage8BcContractError(f"stage8-bc-python-dependency-required:{name}") from error


def ensure_existing_run_directory(ticket: Mapping[str, Any]) -> Path:
    validated = validate_execution_ticket(ticket)
    directory = Path(validated["runDirectory"])
    if not directory.exists() or not directory.is_dir():
        raise Stage8BcContractError("stage8-bc-python-run-directory-missing")
    return directory


def ensure_existing_artifact_file(ticket: Mapping[str, Any], candidate: str) -> Path:
    """Accept an existing regular file only beneath the approved artifact root."""
    validated = validate_execution_ticket(ticket)
    if not isinstance(candidate, str) or not ntpath.isabs(candidate) or not _strict_child(candidate, validated["artifactRoot"]):
        raise Stage8BcContractError("stage8-bc-python-artifact-file-path-invalid")
    root = Path(validated["artifactRoot"])
    path = Path(candidate)
    try:
        resolved_root = root.resolve(strict=True)
        resolved_path = path.resolve(strict=True)
        resolved_path.relative_to(resolved_root)
    except Exception as error:
        raise Stage8BcContractError("stage8-bc-python-artifact-file-path-invalid") from error
    if resolved_path == resolved_root or not resolved_path.is_file():
        raise Stage8BcContractError("stage8-bc-python-artifact-file-path-invalid")
    return resolved_path


def _remove_or_quarantine(candidate: Path, quarantine: Path) -> bool:
    try:
        if not candidate.exists():
            return True
        try:
            candidate.unlink()
        except Exception:
            if quarantine.exists():
                return False
            os.replace(candidate, quarantine)
        return not candidate.exists()
    except Exception:
        return False


def atomic_write_verified(ticket: Mapping[str, Any], file_name: str, content: bytes) -> tuple[Path, str]:
    validated = validate_execution_ticket(ticket)
    if not file_name or Path(file_name).name != file_name or file_name.endswith((".partial", ".quarantine")):
        raise Stage8BcContractError("stage8-bc-python-artifact-name-invalid")
    directory = ensure_existing_run_directory(validated)
    target = directory / file_name
    partial = directory / f"{file_name}.partial"
    quarantine = directory / f"{file_name}.{validated['runId']}-isolation.quarantine"
    if target.exists() or partial.exists() or quarantine.exists():
        raise Stage8BcContractError("stage8-bc-python-artifact-target-exists")
    digest = bytes_sha256(content)
    try:
        with partial.open("xb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        if bytes_sha256(partial.read_bytes()) != digest:
            raise Stage8BcContractError("stage8-bc-python-artifact-readback-mismatch")
        os.replace(partial, target)
        if bytes_sha256(target.read_bytes()) != digest:
            raise Stage8BcContractError("stage8-bc-python-artifact-final-mismatch")
    except Exception as error:
        partial_cleanup_ok = _remove_or_quarantine(partial, quarantine)
        target_cleanup_ok = _remove_or_quarantine(target, quarantine)
        cleanup_ok = partial_cleanup_ok and target_cleanup_ok
        if not cleanup_ok:
            raise Stage8BcContractError("stage8-bc-python-artifact-cleanup-failed") from error
        raise
    return target, digest


def atomic_write_package_verified(ticket: Mapping[str, Any], files: Sequence[tuple[str, bytes]]) -> dict[str, tuple[Path, str]]:
    validated = validate_execution_ticket(ticket)
    directory = ensure_existing_run_directory(validated)
    if not files or len({name for name, _ in files}) != len(files):
        raise Stage8BcContractError("stage8-bc-python-package-files-invalid")
    targets: list[tuple[Path, Path, Path, bytes, str]] = []
    for file_name, content in files:
        if not file_name or Path(file_name).name != file_name or file_name.endswith((".partial", ".quarantine")):
            raise Stage8BcContractError("stage8-bc-python-artifact-name-invalid")
        target = directory / file_name
        partial = directory / f"{file_name}.partial"
        quarantine = directory / f"{file_name}.{validated['runId']}-isolation.quarantine"
        if target.exists() or partial.exists() or quarantine.exists():
            raise Stage8BcContractError("stage8-bc-python-artifact-target-exists")
        targets.append((target, partial, quarantine, content, bytes_sha256(content)))
    committed: list[Path] = []
    try:
        for _, partial, _, content, digest in targets:
            with partial.open("xb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            if bytes_sha256(partial.read_bytes()) != digest:
                raise Stage8BcContractError("stage8-bc-python-package-readback-mismatch")
        for target, partial, _, _, digest in targets:
            os.replace(partial, target)
            committed.append(target)
            if bytes_sha256(target.read_bytes()) != digest:
                raise Stage8BcContractError("stage8-bc-python-package-final-mismatch")
    except Exception as error:
        cleanup_ok = True
        for target, partial, quarantine, _, _ in targets:
            cleanup_ok = _remove_or_quarantine(partial, quarantine) and cleanup_ok
            cleanup_ok = _remove_or_quarantine(target, quarantine) and cleanup_ok
        if not cleanup_ok:
            raise Stage8BcContractError("stage8-bc-python-package-cleanup-failed") from error
        raise
    return {target.name: (target, digest) for target, _, _, _, digest in targets}


def decimal_string(value: float) -> str:
    if not math.isfinite(value):
        raise Stage8BcContractError("stage8-bc-non-finite-decimal")
    return format(value, ".17g")
