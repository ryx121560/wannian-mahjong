"use client";

import { GAME_ENTRY_PATH } from "@/store/gameStore";

export function GameFrame() {
  return (
    <iframe
      src={GAME_ENTRY_PATH}
      title="万年麻将"
      className="game-frame"
      allow="fullscreen"
    />
  );
}
