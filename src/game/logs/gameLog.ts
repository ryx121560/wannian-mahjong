import type { GameLog, GameResult, GameState } from "@/types";

const STORAGE_KEY = "mahjong_gamelogs";

export function loadGameLogs(): GameLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveGameLogsToStorage(logs: GameLog[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // Ignore storage failures so gameplay is not interrupted.
  }
}

export function logEvent(GS: GameState, playerIndex: number, action: string, tile?: string): void {
  if (!GS._gameLog) return;
  const event = {
    turn: GS._gameLog.events.length + 1,
    player: playerIndex,
    name: GS.players[playerIndex]?.name || "",
    action,
    tile: tile || null,
    tileLabel: tile || null,
    hand: GS.players[playerIndex]?.hand?.map((item) => item.k).join(",") || "",
  };
  GS._gameLog.events.push(event);
}

export function finalizeGameLog(GS: GameState, result: unknown): void {
  if (!GS._gameLog) return;
  GS._gameLog.endTime = new Date().toLocaleString();
  GS._gameLog.result = result as GameResult;
  const logs = loadGameLogs();
  logs.unshift(GS._gameLog);
  while (logs.length > 3) logs.pop();
  saveGameLogsToStorage(logs);
}

export function exportGameLogs(): string | null {
  const logs = loadGameLogs();
  if (logs.length === 0) return null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const data = JSON.stringify(logs, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `万年麻将_游戏记录_${timestamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
  return data;
}
