"""Lightweight dynamic-action Stage8 BC policy/value model definition."""

from __future__ import annotations

from typing import Any, Mapping

from .contracts import ACTION_FEATURE_COUNT, VISIBLE_FEATURE_COUNT, Stage8BcContractError, identity_sha256, require_dependency

MODEL_VERSION = "stage8-bc-dual-head-model-v1"
DEFAULT_MODEL_CONFIG = {
    "visibleFeatureCount": VISIBLE_FEATURE_COUNT,
    "actionFeatureCount": ACTION_FEATURE_COUNT,
    "stateHiddenSize": 256,
    "stateEmbeddingSize": 128,
    "actionEmbeddingSize": 64,
    "valueSeats": 4,
    "zeroSumValueHead": True,
}


def model_definition_payload(config: Mapping[str, Any] | None = None) -> dict[str, Any]:
    candidate = dict(config or DEFAULT_MODEL_CONFIG)
    if candidate != DEFAULT_MODEL_CONFIG:
        raise Stage8BcContractError("stage8-bc-model-config-invalid")
    return {
        "version": MODEL_VERSION,
        "config": candidate,
        "policy": "masked-dynamic-canonical-action-logits",
        "value": "four-seat-terminal-delta-minus-seat-mean",
        "parameterTarget": "float32-under-10MiB",
    }


def model_definition_sha256(config: Mapping[str, Any] | None = None) -> str:
    return identity_sha256(model_definition_payload(config))


def expected_parameter_count(config: Mapping[str, Any] | None = None) -> int:
    candidate = model_definition_payload(config)["config"]
    state_hidden = candidate["stateHiddenSize"]
    state_embedding = candidate["stateEmbeddingSize"]
    action_embedding = candidate["actionEmbeddingSize"]
    return (
        candidate["visibleFeatureCount"] * state_hidden + state_hidden
        + state_hidden * state_embedding + state_embedding
        + candidate["actionFeatureCount"] * action_embedding + action_embedding
        + (state_embedding + action_embedding) + 1
        + state_embedding * candidate["valueSeats"] + candidate["valueSeats"]
    )


def build_stage8_bc_model(torch_module: Any | None = None, config: Mapping[str, Any] | None = None) -> Any:
    candidate = model_definition_payload(config)["config"]
    torch = torch_module or require_dependency("torch")
    nn = torch.nn

    class Stage8BcDualHead(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.state_encoder = nn.Sequential(
                nn.Linear(candidate["visibleFeatureCount"], candidate["stateHiddenSize"]),
                nn.ReLU(),
                nn.Linear(candidate["stateHiddenSize"], candidate["stateEmbeddingSize"]),
                nn.ReLU(),
            )
            self.action_encoder = nn.Sequential(
                nn.Linear(candidate["actionFeatureCount"], candidate["actionEmbeddingSize"]),
                nn.ReLU(),
            )
            self.policy_head = nn.Linear(candidate["stateEmbeddingSize"] + candidate["actionEmbeddingSize"], 1)
            self.value_head = nn.Linear(candidate["stateEmbeddingSize"], candidate["valueSeats"])

        def forward(self, visible_state: Any, canonical_actions: Any, legal_action_mask: Any) -> tuple[Any, Any]:
            state_embedding = self.state_encoder(visible_state)
            action_embedding = self.action_encoder(canonical_actions)
            state_per_action = state_embedding.unsqueeze(1).expand(-1, action_embedding.shape[1], -1)
            policy_logits = self.policy_head(torch.cat((state_per_action, action_embedding), dim=-1)).squeeze(-1)
            policy_logits = policy_logits.masked_fill(legal_action_mask <= 0, -1.0e9)
            value_delta = self.value_head(state_embedding)
            value_delta = value_delta - value_delta.mean(dim=-1, keepdim=True)
            return policy_logits, value_delta

    model = Stage8BcDualHead()
    actual_parameters = sum(parameter.numel() for parameter in model.parameters())
    if actual_parameters != expected_parameter_count(candidate):
        raise Stage8BcContractError("stage8-bc-model-parameter-count-mismatch")
    return model
