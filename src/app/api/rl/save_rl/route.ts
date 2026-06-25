import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SAVE_FILE = path.join(process.cwd(), "rl_weights.json");

export async function POST(req: NextRequest) {
  const data = await req.json();
  let allData: Record<string, unknown> = {};
  if (fs.existsSync(SAVE_FILE)) {
    try { allData = JSON.parse(fs.readFileSync(SAVE_FILE, "utf-8")); } catch {}
  }
  allData[data.agent || "unknown"] = { nn: data.nn, meta: data.meta };
  fs.writeFileSync(SAVE_FILE, JSON.stringify(allData), "utf-8");
  return NextResponse.json({ ok: true });
}