import type { Player } from "./player";
import type { Tile } from "./tile";

export type GamePhase = "idle" | "drawing" | "discarding" | "responding" | "ended";

export interface GameResponse {
  p: number;
  cp?: boolean;
  ck?: boolean;
  cw?: boolean;
}

export interface GameResult {
  winner: number | null;
  type: string;
  scores?: Array<{ name: string; score: number }>;
  [key: string]: unknown;
}

export interface AiSuggestLog {
  isAiDecision?: boolean;
  player?: number;
  [key: string]: unknown;
}

export interface GameState {
  wall: Tile[];
  players: Player[];
  discards: Tile[];
  lastDiscard: Tile | null;
  lastDiscardP: number;
  cur: number;
  phase: GamePhase;
  selectedTile?: Tile | null;
  dealer: number;
  canP: boolean;
  canK: boolean;
  canW: boolean;
  canWS: boolean;
  diff: "easy" | "normal" | "hard";
  _resp: GameResponse | GameResponse[] | null;
  _respP: number;
  _responseKind?: "win" | "calls" | null;
  _hot: Array<{ x: number; y: number; w: number; h: number; t: Tile }>;
  _kc: Record<string, number>;
  _hasWild?: Record<string, boolean>;
  showAI: boolean;
  newDrawnTile: Tile | null;
  newDrawnIdx: number;
  playerDiscards: Tile[][];
  turn: number;
  _gameLog?: GameLog;
}

export interface GameLogEvent {
  turn: number;
  player: number;
  name: string;
  action: string;
  tile: string | null;
  tileLabel?: string | null;
  hand: string;
}

export interface GameLog {
  gameId: string;
  startTime: string;
  endTime?: string;
  players: string[];
  dealer: number;
  events: GameLogEvent[];
  suggestLogs?: AiSuggestLog[];
  result?: GameResult;
}
