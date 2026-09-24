"""Standard-library-only regression for the Stage8 BC Python code boundary."""

from __future__ import annotations

import copy
import gzip
import json
import sys
from pathlib import Path

from stage8_bc.contracts import (
    Stage8BcContractError,
    atomic_write_verified,
    checkpoint_definition_sha256,
    identity_sha256,
    parity_definition_sha256,
    validate_checkpoint_evidence,
    validate_execution_ticket,
)
from stage8_bc.dataset import Stage8BcShardDataset
from stage8_bc.export_onnx import export_stage8_bc_onnx_package, onnx_export_definition_sha256
from stage8_bc.model import expected_parameter_count, model_definition_sha256
from stage8_bc.training import run_stage8_bc_training, training_definition_sha256


def expect_error(reason: str, callback) -> None:
    try:
        callback()
    except Stage8BcContractError as error:
        if str(error) != reason:
            raise AssertionError(f"expected {reason}, got {error}") from error
        return
    raise AssertionError(f"expected {reason}")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: stage8-bc-python-code-regression.py <request.json>")
    request_path = Path(sys.argv[1]).resolve(strict=True)
    request = json.loads(request_path.read_text(encoding="utf-8"))
    training_ticket = validate_execution_ticket(request["trainingTicket"], "bc-training")
    export_ticket = validate_execution_ticket(request["exportTicket"], "bc-onnx-export")

    actual_definitions = {
        "modelDefinitionSha256": model_definition_sha256(),
        "trainingDefinitionSha256": training_definition_sha256(),
        "checkpointDefinitionSha256": checkpoint_definition_sha256(),
        "onnxExportDefinitionSha256": onnx_export_definition_sha256(),
        "parityDefinitionSha256": parity_definition_sha256(),
    }
    if actual_definitions != request["expectedDefinitions"]:
        raise AssertionError("python-node-definition-hash-mismatch")
    if identity_sha256(request["canonicalHashFixture"]) != request["canonicalHashSha256"]:
        raise AssertionError("python-node-canonical-hash-mismatch")
    if expected_parameter_count() != request["expectedParameterCount"]:
        raise AssertionError("stage8-bc-parameter-count-mismatch")

    invalid_id_ticket = copy.deepcopy(training_ticket)
    invalid_id_ticket["approvalId"] = "批次-invalid"
    invalid_id_ticket["ticketSha256"] = identity_sha256({key: value for key, value in invalid_id_ticket.items() if key != "ticketSha256"})
    expect_error(
        "stage8-bc-python-ticket-authorization-invalid",
        lambda: validate_execution_ticket(invalid_id_ticket, "bc-training"),
    )

    outside_file = str(request_path)
    dataset = Stage8BcShardDataset(training_ticket, [request["shardPath"]])
    if len(dataset) != 2 or dataset[0]["sample_id"] == dataset[1]["sample_id"]:
        raise AssertionError("stage8-bc-node-python-shard-roundtrip-failed")
    shard_path = Path(request["shardPath"])
    tampered_path = shard_path.with_name("tampered-shard.json.gz")
    shard_value = json.loads(gzip.decompress(shard_path.read_bytes()).decode("utf-8"))
    shard_value["records"][0]["sample"]["visibleState"]["turn"] += 1
    tampered_path.write_bytes(gzip.compress(json.dumps(shard_value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0))
    try:
        expect_error(
            "stage8-bc-dataset-sample-hash-mismatch",
            lambda: Stage8BcShardDataset(training_ticket, [str(tampered_path)]),
        )
    finally:
        tampered_path.unlink(missing_ok=True)
    expect_error(
        "stage8-bc-dataset-shard-path-invalid",
        lambda: Stage8BcShardDataset(training_ticket, [outside_file]),
    )
    expect_error(
        "stage8-bc-training-cuda-required",
        lambda: run_stage8_bc_training(training_ticket, [], "checkpoint-stdlib-test", device="cpu"),
    )
    checkpoint_evidence = request["checkpointEvidence"]
    validate_checkpoint_evidence(
        export_ticket, checkpoint_evidence, require_lifecycle_manifest_match=False,
    )
    tampered_checkpoint = copy.deepcopy(checkpoint_evidence)
    tampered_checkpoint["modelStateSha256"] = "b" * 64
    expect_error(
        "stage8-bc-checkpoint-evidence-hash-mismatch",
        lambda: validate_checkpoint_evidence(
            export_ticket, tampered_checkpoint, require_lifecycle_manifest_match=False,
        ),
    )
    expect_error(
        "stage8-bc-python-artifact-file-path-invalid",
        lambda: export_stage8_bc_onnx_package(
            export_ticket,
            outside_file,
            checkpoint_evidence,
            "model-stdlib-test",
            "https://models.example.invalid/stage8/v1/model.onnx",
        ),
    )
    if any(name == "torch" or name.startswith("torch.") or name == "onnx" or name.startswith("onnx.") for name in sys.modules):
        raise AssertionError("torch-or-onnx-imported-during-standard-library-regression")

    artifact_path, artifact_sha256 = atomic_write_verified(training_ticket, "stdlib-atomic-fixture.bin", b"stage8-bc-atomic-fixture")
    try:
        if not artifact_path.is_file() or artifact_sha256 != request["atomicFixtureSha256"]:
            raise AssertionError("stage8-bc-atomic-write-verification-failed")
    finally:
        artifact_path.unlink(missing_ok=True)

    print(json.dumps({
        "passed": True,
        "definitions": actual_definitions,
        "trainingTicketSha256": training_ticket["ticketSha256"],
        "exportTicketSha256": export_ticket["ticketSha256"],
        "expectedParameterCount": request["expectedParameterCount"],
        "standardLibraryOnly": True,
        "nodePythonShardRecords": len(dataset),
        "tamperedShardRejected": True,
        "torchImported": False,
        "onnxImported": False,
        "temporaryFixtureWrites": 2,
        "formalSamplesWritten": 0,
        "formalModelsWritten": 0,
        "trainingStarted": False,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
