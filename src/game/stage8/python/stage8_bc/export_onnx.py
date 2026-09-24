"""In-memory ONNX export and immutable three-file package commit."""

from __future__ import annotations

import io
from typing import Any, Mapping
from urllib.parse import urlparse

from .contracts import (
    MODEL_MAX_FILE_BYTES,
    ONNX_EXPORT_EVIDENCE_VERSION,
    Stage8BcContractError,
    atomic_write_package_verified,
    bytes_sha256,
    canonical_json,
    ensure_existing_artifact_file,
    identity_sha256,
    is_sha256,
    require_dependency,
    valid_id,
    validate_checkpoint_evidence,
    validate_execution_ticket,
)
from .model import build_stage8_bc_model, model_definition_sha256

MODEL_PACKAGE_VERSION = "stage8-model-package-v3"
INPUT_SCHEMA_VERSION = "stage8-visible-canonical-onnx-tensors-v1"
POLICY_OUTPUT_VERSION = "stage8-complete-canonical-policy-logits-v1"
VALUE_OUTPUT_VERSION = "stage8-four-seat-zero-sum-value-v1"


def onnx_export_definition_sha256() -> str:
    return identity_sha256({
        "version": ONNX_EXPORT_EVIDENCE_VERSION,
        "exporter": "torch.onnx.export-dynamo-true-in-memory",
        "dynamicDimension": "canonical-legal-action-count",
        "checker": "onnx.checker.check_model-before-write",
        "inputs": INPUT_SCHEMA_VERSION,
        "policy": POLICY_OUTPUT_VERSION,
        "value": VALUE_OUTPUT_VERSION,
    })


def _versioned_uri(value: str) -> bool:
    try:
        parsed = urlparse(value)
    except Exception:
        return False
    return bool(parsed.scheme and parsed.netloc and ("/v" in parsed.path.lower() or "version=" in parsed.query.lower()))


def _serialize_model_state(torch: Any, state: Any) -> bytes:
    buffer = io.BytesIO()
    torch.save(state, buffer)
    return buffer.getvalue()


def export_stage8_bc_onnx_package(
    ticket: Mapping[str, Any],
    checkpoint_path: str,
    checkpoint_evidence: Mapping[str, Any],
    model_id: str,
    versioned_model_uri: str,
    *,
    torch_module: Any | None = None,
    onnx_module: Any | None = None,
) -> tuple[dict[str, Any], dict[str, bytes]]:
    validated = validate_execution_ticket(ticket, "bc-onnx-export")
    if validated["modelDefinitionSha256"] != model_definition_sha256(validated["modelConfig"]) or validated["onnxExportDefinitionSha256"] != onnx_export_definition_sha256():
        raise Stage8BcContractError("stage8-bc-onnx-source-identity-mismatch")
    if not valid_id(model_id) or not _versioned_uri(versioned_model_uri):
        raise Stage8BcContractError("stage8-bc-onnx-model-identity-invalid")
    validated_checkpoint = validate_checkpoint_evidence(
        validated, checkpoint_evidence, require_lifecycle_manifest_match=False,
    )
    checkpoint_bytes = ensure_existing_artifact_file(validated, checkpoint_path).read_bytes()
    if bytes_sha256(checkpoint_bytes) != validated_checkpoint["checkpointFileSha256"]:
        raise Stage8BcContractError("stage8-bc-onnx-checkpoint-hash-mismatch")
    torch = torch_module or require_dependency("torch")
    onnx = onnx_module or require_dependency("onnx")
    try:
        checkpoint = torch.load(io.BytesIO(checkpoint_bytes), map_location="cpu", weights_only=True)
    except Exception as error:
        raise Stage8BcContractError("stage8-bc-onnx-checkpoint-load-failed") from error
    if (not isinstance(checkpoint, Mapping)
            or checkpoint.get("protocolVersion") != validated_checkpoint["protocolVersion"]
            or checkpoint.get("runId") != validated["runId"]
            or checkpoint.get("checkpointId") != validated_checkpoint["checkpointId"]
            or checkpoint.get("checkpointStep") != validated_checkpoint["checkpointStep"]
            or checkpoint.get("datasetPayloadSetSha256") != validated["datasetPayloadSetSha256"]
            or checkpoint.get("modelDefinitionSha256") != validated["modelDefinitionSha256"]
            or checkpoint.get("trainingDefinitionSha256") != validated["trainingDefinitionSha256"]
            or checkpoint.get("checkpointDefinitionSha256") != validated["checkpointDefinitionSha256"]
            or checkpoint.get("modelStateSha256") != validated_checkpoint["modelStateSha256"]
            or checkpoint.get("optimizerStateSha256") != validated_checkpoint["optimizerStateSha256"]
            or not isinstance(checkpoint.get("modelState"), Mapping)):
        raise Stage8BcContractError("stage8-bc-onnx-checkpoint-content-identity-mismatch")
    model = build_stage8_bc_model(torch, validated["modelConfig"])
    model.load_state_dict(checkpoint["modelState"], strict=True)
    model.eval()
    visible = torch.zeros((1, validated["modelConfig"]["visibleFeatureCount"]), dtype=torch.float32)
    actions = torch.zeros((1, 2, validated["modelConfig"]["actionFeatureCount"]), dtype=torch.float32)
    mask = torch.ones((1, 2), dtype=torch.float32)
    try:
        dynamic_n = torch.export.Dim("legal_action_count", min=1, max=256)
        program = torch.onnx.export(
            model,
            (visible, actions, mask),
            f=None,
            input_names=["visible_state", "canonical_actions", "legal_action_mask"],
            output_names=["policy_logits", "value_delta"],
            dynamo=True,
            dynamic_shapes={
                "visible_state": {},
                "canonical_actions": {1: dynamic_n},
                "legal_action_mask": {1: dynamic_n},
            },
        )
        model_proto = program.model_proto
        onnx.checker.check_model(model_proto)
        onnx_bytes = model_proto.SerializeToString()
    except Exception as error:
        raise Stage8BcContractError("stage8-bc-onnx-export-or-check-failed") from error
    model_bytes = _serialize_model_state(torch, model.state_dict())
    if not model_bytes or not onnx_bytes or len(model_bytes) >= MODEL_MAX_FILE_BYTES or len(onnx_bytes) >= MODEL_MAX_FILE_BYTES:
        raise Stage8BcContractError("stage8-bc-onnx-model-size-limit-exceeded")
    model_sha256 = bytes_sha256(model_bytes)
    onnx_sha256 = bytes_sha256(onnx_bytes)
    package = {
        "protocolVersion": MODEL_PACKAGE_VERSION,
        "modelId": model_id,
        "modelFileSha256": model_sha256,
        "onnxBinarySha256": onnx_sha256,
        "rulesSha256": validated["rulesSha256"],
        "actionSpaceSha256": validated["actionSpaceSha256"],
        "legalActionMaskSha256": validated["legalActionMaskSha256"],
        "featureSha256": validated["featureSha256"],
        "visibleInformationSha256": validated["visibleInformationSha256"],
        "versionedModelUri": versioned_model_uri,
        "inputSchemaVersion": INPUT_SCHEMA_VERSION,
        "policyOutputVersion": POLICY_OUTPUT_VERSION,
        "valueOutputVersion": VALUE_OUTPUT_VERSION,
        "tensorContractSha256": validated["tensorContractSha256"],
        "onnxRuntimePackage": validated["onnxRuntimePackage"],
        "onnxRuntimeVersion": validated["onnxRuntimeVersion"],
        "onnxExecutionProvider": validated["onnxExecutionProvider"],
        "onnxSessionOptionsSha256": validated["onnxSessionOptionsSha256"],
        "inferenceContractSha256": validated["inferenceContractSha256"],
    }
    manifest_bytes = (canonical_json(package) + "\n").encode("utf-8")
    manifest_sha256 = bytes_sha256(manifest_bytes)
    frozen_identity = {**package, "modelManifestSha256": manifest_sha256}
    checkpoint_evidence_sha256 = validated_checkpoint.get("evidenceSha256")
    if not is_sha256(checkpoint_evidence_sha256):
        raise Stage8BcContractError("stage8-bc-onnx-checkpoint-evidence-hash-invalid")
    evidence_payload = {
        "protocolVersion": ONNX_EXPORT_EVIDENCE_VERSION,
        "runId": validated["runId"],
        "modelId": model_id,
        "lifecycleManifestSha256": validated["lifecycleManifestSha256"],
        "checkpointEvidenceSha256": checkpoint_evidence_sha256,
        "checkpointFileSha256": validated_checkpoint["checkpointFileSha256"],
        "onnxBinarySha256": onnx_sha256,
        "modelManifestSha256": manifest_sha256,
        "modelFileBytes": len(model_bytes),
        "onnxFileBytes": len(onnx_bytes),
        "dynamicLegalActionDimension": True,
        "onnxCheckerPassed": True,
        "frozenModelIdentity": frozen_identity,
    }
    evidence = {**evidence_payload, "evidenceSha256": identity_sha256(evidence_payload)}
    files = {
        f"{model_id}.model.pt": model_bytes,
        f"{model_id}.onnx": onnx_bytes,
        f"{model_id}.manifest.json": manifest_bytes,
    }
    atomic_write_package_verified(validated, list(files.items()))
    return evidence, files
