import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { readJsonObject } from "../validation";
import { resolveRlWeightsFile } from "@/lib/rl-weights-file";

export async function POST(req: NextRequest) {
  let saveFile: string;
  try {
    saveFile = resolveRlWeightsFile();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid RL weights configuration" }, { status: 503 });
  }
  const parsed = await readJsonObject(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  fs.writeFileSync(saveFile, JSON.stringify(parsed.data), "utf-8");
  return NextResponse.json({ ok: true });
}
