import type { Player } from "./player";
import type { Tile } from "./tile";

export interface GameState {
  wall: Tile[];
  players: Player[];
  discards: Tile[];
  lastDiscard: Tile | null;
  lastDiscardP: number;
  cur: number;
  phase: string;
  selected: number;
  dealer: number;
  canP: boolean;
  canK: boolean;
  canW: boolean;
  canWS: boolean;
  diff: "easy" | "normal" | "hard";
  _resp: unknown;
  _respP: number;
  _hot: unknown[];
  _kc: Record<string, unknown>;
  showAI: boolean;
  newDrawnTile: Tile | null;
  newDrawnIdx: number;
  playerDiscards: Tile[][];
  turn: number;
  _gameLog?: GameLog;
}

export interface GameLogEvent {
  turn: number;
  name: string;
  action: string;
  tile: string;
  hand: string;
}

export interface GameLog {
  gameId: string;
  startTime: string;
  endTime?: string;
  players: string[];
  dealer: number;
  events: GameLogEvent[];
  suggestLogs?: unknown[];
  result?: unknown;
}
