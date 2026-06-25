import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SAVE_FILE = path.join(process.cwd(), "rl_weights.json");

export async function GET() {
  if (fs.existsSync(SAVE_FILE)) {
    return new NextResponse(fs.readFileSync(SAVE_FILE, "utf-8"), {
      headers: { "Content-Type": "application/json" },
    });
  }
  return NextResponse.json({});
}