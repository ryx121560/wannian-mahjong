import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SAVE_FILE = path.join(process.cwd(), "rl_weights.json");

export async function GET() {
  try {
    if (fs.existsSync(SAVE_FILE)) {
      const content = fs.readFileSync(SAVE_FILE, "utf-8");
      const data = JSON.parse(content);
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return new NextResponse(content, {
          headers: { "Content-Type": "application/json" },
        });
      }
    }
  } catch {
    return NextResponse.json({});
  }
  return NextResponse.json({});
}
