import { NextRequest } from "next/server";

export const MAX_RL_PAYLOAD_BYTES = 1024 * 1024;

export type ParsedJsonResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export async function readJsonObject(req: NextRequest): Promise<ParsedJsonResult> {
  const body = await req.text();
  if (Buffer.byteLength(body, "utf-8") > MAX_RL_PAYLOAD_BYTES) {
    return { ok: false, status: 413, error: "Payload too large" };
  }

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, status: 400, error: "Invalid payload" };
  }

  return { ok: true, data: data as Record<string, unknown> };
}
