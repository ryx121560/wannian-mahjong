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

  fs.writeFileSync(SAVE_FILE, JSON.stringify(parsed.data), "utf-8");
  return NextResponse.json({ ok: true });
}
