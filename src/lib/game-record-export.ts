import fs from "node:fs";
import path from "node:path";

export const GAME_RECORD_EXPORT_SCHEMA = "wannian-game-record-export-v2";

export type GameRecord = {
  gameId: string;
  gameSequence: number;
  startTime: string;
  players: string[];
  dealer: number;
  events: unknown[];
  trainingDataIncluded: false;
  [key: string]: unknown;
};

export type ValidatedGameRecordExport = {
  schemaVersion: typeof GAME_RECORD_EXPORT_SCHEMA;
  gameId: string;
  gameSequence: number;
  record: GameRecord;
};

function canonicalPath(value: string): string {
  const normalized = path.normalize(value);
  return fs.existsSync(normalized) ? fs.realpathSync.native(normalized) : normalized;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`invalid game record ${field}`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`invalid game record ${field}`);
  }
  return value as number;
}

function assertSafeGameId(gameId: string): string {
  const safe = gameId.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^_+|_+$/g, "").slice(0, 96);
  if (!safe) throw new Error("invalid game record gameId");
  return safe;
}

function ensureConfiguredDirectory(value: string, field: string): string {
  if (!path.isAbsolute(value)) {
    throw new Error(`${field} must be an absolute path`);
  }
  const resolved = canonicalPath(value);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`${field} must reference an existing directory`);
  }
  fs.accessSync(resolved, fs.constants.W_OK);
  return resolved;
}

export function resolveGameExportDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.GAME_EXPORT_DIR;
  if (!configured) throw new Error("GAME_EXPORT_DIR is required");
  const directory = ensureConfiguredDirectory(configured, "GAME_EXPORT_DIR");
  const requiresApproval = env.GAME_EXPORT_REQUIRE_APPROVED === "1";
  if (!requiresApproval) return directory;

  const approved = env.APPROVED_GAME_EXPORT_DIR;
  if (!approved) throw new Error("APPROVED_GAME_EXPORT_DIR is required");
  const approvedDirectory = ensureConfiguredDirectory(approved, "APPROVED_GAME_EXPORT_DIR");
  if (directory !== approvedDirectory) {
    throw new Error("GAME_EXPORT_DIR does not match APPROVED_GAME_EXPORT_DIR");
  }
  return directory;
}

export function validateGameRecordExport(payload: Record<string, unknown>): ValidatedGameRecordExport {
  for (const field of ["outputPath", "filePath", "directory", "exportDir"]) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new Error("client path fields are not allowed");
    }
  }
  if (payload.schemaVersion !== GAME_RECORD_EXPORT_SCHEMA) {
    throw new Error("invalid game record export schema");
  }
  if (!payload.record || typeof payload.record !== "object" || Array.isArray(payload.record)) {
    throw new Error("invalid game record");
  }
  const record = payload.record as Record<string, unknown>;
  for (const field of ["outputPath", "filePath", "directory", "exportDir"]) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      throw new Error("client path fields are not allowed");
    }
  }
  const gameId = requireNonEmptyString(record.gameId, "gameId");
  const gameSequence = requirePositiveInteger(record.gameSequence, "gameSequence");
  if (payload.gameId !== gameId || payload.gameSequence !== gameSequence) {
    throw new Error("game record identity does not match record");
  }
  requireNonEmptyString(record.startTime, "startTime");
  if (!Array.isArray(record.players) || record.players.length !== 4 || !record.players.every((name) => typeof name === "string" && name.length > 0)) {
    throw new Error("invalid game record players");
  }
  if (!Number.isInteger(record.dealer) || (record.dealer as number) < 0 || (record.dealer as number) > 3) {
    throw new Error("invalid game record dealer");
  }
  if (!Array.isArray(record.events)) throw new Error("invalid game record events");
  if (record.trainingDataIncluded !== false) throw new Error("invalid game record trainingDataIncluded");
  assertSafeGameId(gameId);
  return {
    schemaVersion: GAME_RECORD_EXPORT_SCHEMA,
    gameId,
    gameSequence,
    record: record as GameRecord,
  };
}

function exportFilename(record: GameRecord, duplicateExportIndex: number): string {
  const suffix = duplicateExportIndex === 1 ? "" : `_导出${duplicateExportIndex}`;
  return `万年麻将_第${record.gameSequence}局_${assertSafeGameId(record.gameId)}${suffix}.json`;
}

export function writeValidatedGameExport(
  exportDirectory: string,
  validated: ValidatedGameRecordExport,
): { filename: string; duplicateExportIndex: number; filePath: string } {
  const directory = ensureConfiguredDirectory(exportDirectory, "GAME_EXPORT_DIR");
  const content = JSON.stringify([validated.record], null, 2);

  for (let duplicateExportIndex = 1; duplicateExportIndex < 10_000; duplicateExportIndex += 1) {
    const filename = exportFilename(validated.record, duplicateExportIndex);
    const target = path.join(directory, filename);
    const temporary = path.join(directory, `.${filename}.${process.pid}.${Date.now()}.tmp`);
    try {
      fs.writeFileSync(temporary, content, { encoding: "utf8", flag: "wx" });
      try {
        // A hard link is an atomic no-overwrite commit when both files are in the approved directory.
        fs.linkSync(temporary, target);
        fs.unlinkSync(temporary);
        return { filename, duplicateExportIndex, filePath: target };
      } catch (error) {
        fs.rmSync(temporary, { force: true });
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
        throw error;
      }
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
  throw new Error("unable to allocate a unique export filename");
}
