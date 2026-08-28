"""Deterministic BC training and last-complete checkpoint implementation."""

from __future__ import annotations

import io
import math
from typing import Any, Mapping, Sequence

from .contracts import (
    CHECKPOINT_EVIDENCE_VERSION,
    Stage8BcContractError,
    atomic_write_verified,
    bytes_sha256,
    checkpoint_definition_sha256,
    decimal_string,
    ensure_existing_artifact_file,
    identity_sha256,
    is_sha256,
    require_dependency,
    valid_id,
    validate_checkpoint_evidence,
    validate_execution_ticket,
)
from .dataset import Stage8BcShardDataset, collate_stage8_bc
from .model import build_stage8_bc_model, model_definition_sha256

TRAINING_VERSION = "stage8-bc-training-v1"


def training_definition_sha256() -> str:
    return identity_sha256({
        "version": TRAINING_VERSION,
        "policyLoss": "full-teacher-distribution-cross-entropy",
        "valueLoss": "smooth-l1-real-terminal-four-seat-delta",
        "rewards": "terminal-only-no-process-reward",
        "determinism": "fixed-seed-deterministic-algorithms-fail-closed",
        "finiteChecks": "input-output-gradient-loss",
    })


def _serialize(torch: Any, value: Any) -> bytes:
    buffer = io.BytesIO()
    torch.save(value, buffer)
    return buffer.getvalue()


def _finite_tensor(torch: Any, value: Any) -> bool:
    return bool(torch.isfinite(value).all().item())


def run_stage8_bc_training(
    ticket: Mapping[str, Any],
    shard_paths: Sequence[str],
    checkpoint_id: str,
    *,
    torch_module: Any | None = None,
    device: str = "cuda",
) -> tuple[dict[str, Any], Any]:
    validated = validate_execution_ticket(ticket, "bc-training")
    if not valid_id(checkpoint_id):
        raise Stage8BcContractError("stage8-bc-checkpoint-id-invalid")
    if (validated["modelDefinitionSha256"] != model_definition_sha256(validated["modelConfig"])
            or validated["trainingDefinitionSha256"] != training_definition_sha256()
            or validated["checkpointDefinitionSha256"] != checkpoint_definition_sha256()):
        raise Stage8BcContractError("stage8-bc-training-source-identity-mismatch")
    if device != "cuda":
        raise Stage8BcContractError("stage8-bc-training-cuda-required")
    torch = torch_module or require_dependency("torch")
    if not bool(torch.cuda.is_available()):
        raise Stage8BcContractError("stage8-bc-training-cuda-required")
    dataset = Stage8BcShardDataset(validated, shard_paths)
    if not len(dataset):
        raise Stage8BcContractError("stage8-bc-training-dataset-empty")
    plan = validated["trainingPlan"]
    torch.manual_seed(plan["fixedSeed"])
    torch.cuda.manual_seed_all(plan["fixedSeed"])
    torch.use_deterministic_algorithms(True)
    model = build_stage8_bc_model(torch, validated["modelConfig"]).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=plan["learningRate"])
    functional = torch.nn.functional
    step = 0
    final_policy_loss = final_value_loss = final_total_loss = None
    for _epoch in range(plan["epochs"]):
        generator = torch.Generator(device="cpu")
        generator.manual_seed(plan["fixedSeed"] + _epoch)
        order = torch.randperm(len(dataset), generator=generator).tolist()
        for offset in range(0, len(order), plan["batchSize"]):
            if step >= plan["maxSteps"]:
                break
            records = [dataset[index] for index in order[offset:offset + plan["batchSize"]]]
            batch = collate_stage8_bc(records, torch).copy()
            for key in ("visible_state", "canonical_actions", "legal_action_mask", "teacher_distribution", "terminal_delta"):
                batch[key] = batch[key].to(device)
                if not _finite_tensor(torch, batch[key]):
                    raise Stage8BcContractError("stage8-bc-training-input-non-finite")
            optimizer.zero_grad(set_to_none=True)
            policy_logits, value_delta = model(batch["visible_state"], batch["canonical_actions"], batch["legal_action_mask"])
            if not _finite_tensor(torch, policy_logits) or not _finite_tensor(torch, value_delta):
                raise Stage8BcContractError("stage8-bc-training-output-non-finite")
            log_probabilities = functional.log_softmax(policy_logits, dim=-1)
            policy_loss = -(batch["teacher_distribution"] * log_probabilities).sum(dim=-1).mean()
            value_loss = functional.smooth_l1_loss(value_delta, batch["terminal_delta"])
            total_loss = plan["policyLossWeight"] * policy_loss + plan["valueLossWeight"] * value_loss
            if not _finite_tensor(torch, total_loss):
                raise Stage8BcContractError("stage8-bc-training-loss-non-finite")
            total_loss.backward()
            if any(parameter.grad is not None and not _finite_tensor(torch, parameter.grad) for parameter in model.parameters()):
                raise Stage8BcContractError("stage8-bc-training-gradient-non-finite")
            optimizer.step()
            step += 1
            final_policy_loss = float(policy_loss.detach().cpu().item())
            final_value_loss = float(value_loss.detach().cpu().item())
            final_total_loss = float(total_loss.detach().cpu().item())
        if step >= plan["maxSteps"]:
            break
    if step < 1 or any(value is None or not math.isfinite(value) for value in (final_policy_loss, final_value_loss, final_total_loss)):
        raise Stage8BcContractError("stage8-bc-training-no-complete-step")
    model_state_bytes = _serialize(torch, model.state_dict())
    optimizer_state_bytes = _serialize(torch, optimizer.state_dict())
    checkpoint_payload = {
        "protocolVersion": CHECKPOINT_EVIDENCE_VERSION,
        "runId": validated["runId"],
        "checkpointId": checkpoint_id,
        "checkpointStep": step,
        "lifecycleManifestSha256": validated["lifecycleManifestSha256"],
        "datasetPayloadSetSha256": validated["datasetPayloadSetSha256"],
        "modelDefinitionSha256": validated["modelDefinitionSha256"],
        "trainingDefinitionSha256": validated["trainingDefinitionSha256"],
        "checkpointDefinitionSha256": validated["checkpointDefinitionSha256"],
        "modelStateSha256": bytes_sha256(model_state_bytes),
        "optimizerStateSha256": bytes_sha256(optimizer_state_bytes),
        "modelState": model.state_dict(),
        "optimizerState": optimizer.state_dict(),
    }
    checkpoint_bytes = _serialize(torch, checkpoint_payload)
    _path, checkpoint_sha256 = atomic_write_verified(validated, f"{checkpoint_id}.pt", checkpoint_bytes)
    evidence_payload = {
        "protocolVersion": CHECKPOINT_EVIDENCE_VERSION,
        "runId": validated["runId"],
        "checkpointId": checkpoint_id,
        "lifecycleManifestSha256": validated["lifecycleManifestSha256"],
        "datasetPayloadSetSha256": validated["datasetPayloadSetSha256"],
        "modelDefinitionSha256": validated["modelDefinitionSha256"],
        "trainingDefinitionSha256": validated["trainingDefinitionSha256"],
        "checkpointDefinitionSha256": validated["checkpointDefinitionSha256"],
        "checkpointStep": step,
        "checkpointFileSha256": checkpoint_sha256,
        "modelStateSha256": bytes_sha256(model_state_bytes),
        "optimizerStateSha256": bytes_sha256(optimizer_state_bytes),
        "policyLossDecimal": decimal_string(final_policy_loss),
        "valueLossDecimal": decimal_string(final_value_loss),
        "totalLossDecimal": decimal_string(final_total_loss),
        "hardAnomalies": 0,
        "lastComplete": True,
    }
    evidence = {**evidence_payload, "evidenceSha256": identity_sha256(evidence_payload)}
    return evidence, model


def load_last_complete_checkpoint(
    ticket: Mapping[str, Any],
    checkpoint_path: str,
    evidence: Mapping[str, Any],
    *,
    torch_module: Any | None = None,
    device: str = "cpu",
) -> tuple[Any, dict[str, Any]]:
    validated = validate_execution_ticket(ticket, "bc-training")
    validated_evidence = validate_checkpoint_evidence(
        validated, evidence, require_lifecycle_manifest_match=True,
    )
    candidate = ensure_existing_artifact_file(validated, checkpoint_path)
    content = candidate.read_bytes()
    if bytes_sha256(content) != validated_evidence["checkpointFileSha256"]:
        raise Stage8BcContractError("stage8-bc-checkpoint-file-hash-mismatch")
    torch = torch_module or require_dependency("torch")
    try:
        payload = torch.load(io.BytesIO(content), map_location=device, weights_only=True)
    except Exception as error:
        raise Stage8BcContractError("stage8-bc-checkpoint-load-failed") from error
    if (not isinstance(payload, Mapping)
            or payload.get("protocolVersion") != CHECKPOINT_EVIDENCE_VERSION
            or payload.get("runId") != validated["runId"]
            or payload.get("checkpointId") != validated_evidence["checkpointId"]
            or payload.get("checkpointStep") != validated_evidence["checkpointStep"]
            or payload.get("lifecycleManifestSha256") != validated["lifecycleManifestSha256"]
            or payload.get("datasetPayloadSetSha256") != validated["datasetPayloadSetSha256"]
            or payload.get("modelDefinitionSha256") != validated["modelDefinitionSha256"]
            or payload.get("trainingDefinitionSha256") != validated["trainingDefinitionSha256"]
            or payload.get("checkpointDefinitionSha256") != validated["checkpointDefinitionSha256"]
            or payload.get("modelStateSha256") != validated_evidence["modelStateSha256"]
            or payload.get("optimizerStateSha256") != validated_evidence["optimizerStateSha256"]
            or not isinstance(payload.get("modelState"), Mapping)
            or not isinstance(payload.get("optimizerState"), Mapping)):
        raise Stage8BcContractError("stage8-bc-checkpoint-content-identity-mismatch")
    model = build_stage8_bc_model(torch, validated["modelConfig"]).to(device)
    model.load_state_dict(payload["modelState"], strict=True)
    return model, payload
