import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { readJsonObject } from "../validation";

const SAVE_FILE = path.join(process.cwd(), "rl_weights.json");

export async function POST(req: NextRequest) {
  const parsed = await readJsonObject(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const data = parsed.data;
  const agent = typeof data.agent === "string" && data.agent.trim()
    ? data.agent.trim().slice(0, 64)
    : "unknown";

  let allData: Record<string, unknown> = {};
  if (fs.existsSync(SAVE_FILE)) {
    try { allData = JSON.parse(fs.readFileSync(SAVE_FILE, "utf-8")); } catch (error) { console.warn("[rl] existing weights read failed", error); }
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
  fs.writeFileSync(SAVE_FILE, JSON.stringify(allData), "utf-8");
  return NextResponse.json({ ok: true });
}
