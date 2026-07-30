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

  const data = parsed.data;
  const agent = typeof data.agent === "string" && data.agent.trim()
    ? data.agent.trim().slice(0, 64)
    : "unknown";

  let allData: Record<string, unknown> = {};
  if (fs.existsSync(saveFile)) {
    try { allData = JSON.parse(fs.readFileSync(saveFile, "utf-8")); } catch (error) { console.warn("[rl] existing weights read failed", error); }
  }
  if (Array.isArray(data.scores) && data.scores.length === 4 && data.scores.every(Number.isFinite)) {
    allData.scores = data.scores;
  }
  const totalGames = data.totalGames;
  if (typeof totalGames === "number" && Number.isInteger(totalGames) && totalGames >= 0) {
    allData.totalGames = totalGames;
  }
  if ("nn" in data || "meta" in data) {
    allData[agent] = { nn: data.nn, meta: data.meta };
  }
  fs.writeFileSync(saveFile, JSON.stringify(allData), "utf-8");
  return NextResponse.json({ ok: true });
}
