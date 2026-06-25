import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SAVE_FILE = path.join(process.cwd(), "rl_weights.json");

export async function POST(req: NextRequest) {
  const data = await req.json();
  fs.writeFileSync(SAVE_FILE, JSON.stringify(data), "utf-8");
  return NextResponse.json({ ok: true });
}