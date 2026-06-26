"use strict";
// ============================================================
// 对手建模接口层
// GPU 可用-> GPUOpponentModel, 否则-> 启发式版
// ============================================================

(function() {
  let model = null;

  function createCpuOpponentModel() {
    const states = {};

    function ensure(player) {
      if (!states[player]) states[player] = { discards: [], actions: [], melds: 0 };
      return states[player];
    }

    function tileKey(tile) {
      if (!tile) return null;
      if (typeof tile === "string") return tile;
      if (tile.k) return tile.k;
      return tile.t === "num" ? tile.s + tile.v : tile.s;
    }

    function addWait(waits, key, weight) {
      if (!key) return;
      const hit = waits.find(function(item){ return item.tile === key; });
      if (hit) hit.weight += weight;
      else waits.push({ tile: key, weight: weight });
    }

    function inferWaits(player) {
      const state = ensure(player);
      const waits = [];
      const pl = window.GS && GS.players ? GS.players[player] : null;
      const hand = pl && Array.isArray(pl.hand) ? pl.hand : [];
      const seen = state.discards.slice(-6);

      for (const tile of hand) {
        if (!tile || tile.t !== "num") continue;
        if (tile.v > 1) addWait(waits, tile.s + (tile.v - 1), 1);
        if (tile.v < 9) addWait(waits, tile.s + (tile.v + 1), 1);
      }
      for (const key of seen) {
        if (!key) continue;
        const suit = key.slice(0, -1);
        const value = Number(key.slice(-1));
        if (!Number.isFinite(value)) continue;
        if (value > 1) addWait(waits, suit + (value - 1), 0.3);
        if (value < 9) addWait(waits, suit + (value + 1), 0.3);
      }
      return waits.sort(function(a, b){ return b.weight - a.weight; }).slice(0, 8);
    }

    return {
      update: function(player, action, tile) {
        const state = ensure(player);
        state.actions.push(action);
        if (action === "discard") state.discards.push(tileKey(tile));
        if (action === "pong" || action === "kong" || action === "chi") state.melds++;
      },
      sampleTenpai: function(player) {
        const state = ensure(player);
        const pl = window.GS && GS.players ? GS.players[player] : null;
        const meldCount = Math.max(state.melds, pl && pl.melds ? pl.melds.length : 0);
        const discardCount = Math.max(state.discards.length, GS && GS.playerDiscards && GS.playerDiscards[player] ? GS.playerDiscards[player].length : 0);
        const handSize = pl && Array.isArray(pl.hand) ? pl.hand.length : 13;
        let tenpaiProb = 0.08 + meldCount * 0.16 + Math.max(0, discardCount - 8) * 0.04;
        if (handSize <= 7) tenpaiProb += 0.12;
        return { tenpaiProb: Math.max(0, Math.min(0.95, tenpaiProb)), waits: inferWaits(player) };
      },
      getDistribution: function(player) {
        return inferWaits(player);
      }
    };
  }

  function init() {
    if (window.gpu && window.gpu.available) {
      model = new GPUOpponentModel();
      console.log("[Opponent] 使用 GPU 版本");
    } else {
      model = createCpuOpponentModel();
      console.log("[Opponent] 使用 CPU 版本");
    }
  }

  window.opponentModel = {
    update: function(p, a, t) { if (model) model.update(p, a, t); },
    sampleTenpai: function(p) { return model ? model.sampleTenpai(p) : {tenpaiProb:0, waits:[]}; },
    getDistribution: function(p) { return model ? model.getDistribution(p) : []; },
    init: init
  };

  if (document.readyState === "complete") init();
  else window.addEventListener("load", init);
})();
