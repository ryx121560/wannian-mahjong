import { NextResponse } from "next/server";
import fs from "fs";
import { requireExistingRlWeightsFile } from "@/lib/rl-weights-file";

export async function GET() {
  let saveFile: string;
  try {
    saveFile = requireExistingRlWeightsFile();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid RL weights configuration" }, { status: 503 });
  }
  try {
    if (fs.existsSync(saveFile)) {
      const content = fs.readFileSync(saveFile, "utf-8");
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
