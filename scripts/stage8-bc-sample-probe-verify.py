#!/usr/bin/env python3
"""Read-only verifier for deterministic Stage8 BC gzip shards."""

from __future__ import annotations

import gzip
import hashlib
import json
import pathlib
import sys
from typing import Any


def canonical(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False) + ":" + canonical(value[key])
            for key in sorted(value)
        ) + "}"
    raise TypeError(f"unsupported canonical value: {type(value)!r}")


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def verify(path_value: str) -> dict[str, Any]:
    candidate = pathlib.Path(path_value)
    compressed = candidate.read_bytes()
    decoded = gzip.decompress(compressed).decode("utf-8")
    shard = json.loads(decoded)
    if shard.get("protocolVersion") != "stage8-bc-artifact-shard-v1":
        raise ValueError("bc-probe-python-shard-version-invalid")
    records = shard.get("records")
    manifest = shard.get("manifest")
    if not isinstance(records, list) or not records or not isinstance(manifest, dict):
        raise ValueError("bc-probe-python-shard-shape-invalid")
    if manifest.get("sampleCount") != len(records) or manifest.get("episodeCount") != 1:
        raise ValueError("bc-probe-python-shard-count-invalid")
    sample_ids = [record.get("sample", {}).get("sampleId") for record in records]
    if sample_ids != manifest.get("sampleIds") or len(set(sample_ids)) != len(sample_ids):
        raise ValueError("bc-probe-python-sample-identity-invalid")
    trace_steps = [record.get("sample", {}).get("replay", {}).get("traceStep") for record in records]
    if trace_steps != list(range(1, len(records) + 1)):
        raise ValueError("bc-probe-python-trace-not-contiguous")
    terminal_count = sum(
        record.get("sample", {}).get("replay", {}).get("episodeReward", {}).get("terminal") is True
        for record in records
    )
    if terminal_count != 1 or records[-1]["sample"]["replay"]["episodeReward"].get("terminal") is not True:
        raise ValueError("bc-probe-python-terminal-result-invalid")
    delta = records[-1]["sample"]["replay"]["episodeReward"].get("terminalDelta")
    if not isinstance(delta, list) or len(delta) != 4 or abs(sum(delta)) > 1e-12:
        raise ValueError("bc-probe-python-terminal-delta-invalid")
    return {
        "path": str(candidate),
        "fileSha256": hashlib.sha256(compressed).hexdigest(),
        "canonicalShardSha256": sha256_text(canonical(shard)),
        "sampleCount": len(records),
        "terminalDelta": delta,
    }


def main() -> int:
    if len(sys.argv) < 2:
        raise ValueError("bc-probe-python-shard-path-required")
    results = [verify(value) for value in sys.argv[1:]]
    print(json.dumps({"ok": True, "torchImported": "torch" in sys.modules, "shards": results}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
