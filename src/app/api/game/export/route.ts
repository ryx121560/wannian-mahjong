import { NextRequest, NextResponse } from "next/server";

import {
  resolveGameExportDirectory,
  validateGameRecordExport,
  writeValidatedGameExport,
} from "@/lib/game-record-export";
import { readJsonObject } from "@/app/api/rl/validation";

export async function POST(request: NextRequest) {
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });

  try {
    const record = validateGameRecordExport(parsed.data);
    const exportDirectory = resolveGameExportDirectory();
    const written = writeValidatedGameExport(exportDirectory, record);
    return NextResponse.json({ ok: true, filename: written.filename, duplicateExportIndex: written.duplicateExportIndex }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "game record export failed";
    const status = message.startsWith("invalid") || message.includes("client path") ? 400 : 503;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
