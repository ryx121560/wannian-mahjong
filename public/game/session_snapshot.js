(function attachGameSessionSnapshot(global) {
  'use strict';

  const VERSION = 1;
  const STORAGE_KEY = 'wannian_game_snapshot_v1';
  const PHASES = Object.freeze(['idle', 'drawing', 'discarding', 'responding', 'ended']);
  const RESPONSE_KINDS = Object.freeze([null, 'win', 'calls']);
  const HONORS = Object.freeze(['dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai']);

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function clone(value) {
    if (value == null) return null;
    return JSON.parse(JSON.stringify(value));
  }

  function isTileKey(value) {
    return typeof value === 'string'
      && (HONORS.includes(value) || /^(wan|tong|tiao)[1-9]$/.test(value));
  }

  function isTileArray(value) {
    return Array.isArray(value) && value.every(isTileKey);
  }

  function isPlayerIndex(value, allowNone) {
    return Number.isInteger(value) && value >= (allowNone ? -1 : 0) && value <= 3;
  }

  function validateMeld(meld) {
    return isObject(meld)
      && isTileKey(meld.tile)
      && Number.isInteger(meld.count)
      && (meld.count === 3 || meld.count === 4);
  }

  function validatePlayer(player) {
    return isObject(player)
      && typeof player.name === 'string'
      && typeof player.human === 'boolean'
      && Number.isFinite(player.score)
      && isTileArray(player.hand)
      && Array.isArray(player.melds)
      && player.melds.every(validateMeld);
  }

  function validateResponse(response) {
    return isObject(response)
      && isPlayerIndex(response.p, false)
      && typeof response.cw === 'boolean'
      && typeof response.cp === 'boolean'
      && typeof response.ck === 'boolean';
  }

  function invalid(reason) {
    return { ok: false, reason: reason };
  }

  function validate(snapshot) {
    if (!isObject(snapshot)) return invalid('snapshot-not-object');
    if (snapshot.version !== VERSION) return invalid('unsupported-version');
    if (typeof snapshot.savedAt !== 'string' || Number.isNaN(Date.parse(snapshot.savedAt))) return invalid('invalid-saved-at');
    if (snapshot.status !== 'active' && snapshot.status !== 'ended') return invalid('invalid-status');
    if (!PHASES.includes(snapshot.phase)) return invalid('invalid-phase');
    if ((snapshot.phase === 'ended') !== (snapshot.status === 'ended')) return invalid('status-phase-mismatch');
    if (!Array.isArray(snapshot.players) || snapshot.players.length !== 4 || !snapshot.players.every(validatePlayer)) return invalid('invalid-players');
    if (!isPlayerIndex(snapshot.cur, false)) return invalid('invalid-current-player');
    if (!isPlayerIndex(snapshot.dealer, false)) return invalid('invalid-dealer');
    if (!Number.isInteger(snapshot.turn) || snapshot.turn < 0) return invalid('invalid-turn');
    if (!isTileArray(snapshot.wall) || !isTileArray(snapshot.discards)) return invalid('invalid-tile-array');
    if (!Array.isArray(snapshot.playerDiscards) || snapshot.playerDiscards.length !== 4 || !snapshot.playerDiscards.every(isTileArray)) return invalid('invalid-player-discards');
    if (snapshot.lastDiscard !== null && !isTileKey(snapshot.lastDiscard)) return invalid('invalid-last-discard');
    if (!isPlayerIndex(snapshot.lastDiscardP, true)) return invalid('invalid-last-discard-player');
    if (snapshot.newDrawnTile !== null && !isTileKey(snapshot.newDrawnTile)) return invalid('invalid-new-drawn-tile');
    if (!Number.isInteger(snapshot.newDrawnIdx) || snapshot.newDrawnIdx < -1) return invalid('invalid-new-drawn-index');
    if (snapshot.newDrawnTile === null && snapshot.newDrawnIdx !== -1) return invalid('stale-new-drawn-index');
    if (snapshot.newDrawnTile !== null) {
      const currentHand = snapshot.players[snapshot.cur].hand;
      if (snapshot.newDrawnIdx < 0 || snapshot.newDrawnIdx >= currentHand.length || currentHand[snapshot.newDrawnIdx] !== snapshot.newDrawnTile) return invalid('new-drawn-reference-mismatch');
    }
    if (![snapshot.canP, snapshot.canK, snapshot.canW, snapshot.canWS].every(function (value) { return typeof value === 'boolean'; })) return invalid('invalid-action-flags');
    if (!isObject(snapshot.responseContext)) return invalid('invalid-response-context');
    if (!isPlayerIndex(snapshot.responseContext.responder, true)) return invalid('invalid-responder');
    if (!RESPONSE_KINDS.includes(snapshot.responseContext.kind)) return invalid('invalid-response-kind');
    if (snapshot.responseContext.responses !== null && !Array.isArray(snapshot.responseContext.responses)) return invalid('invalid-responses');
    if (Array.isArray(snapshot.responseContext.responses) && !snapshot.responseContext.responses.every(validateResponse)) return invalid('invalid-response-entry');
    if (snapshot.phase === 'responding' && snapshot.responseContext.kind === null) return invalid('missing-response-kind');
    if (snapshot.phase === 'responding' && snapshot.responseContext.kind === 'calls' && !Array.isArray(snapshot.responseContext.responses)) return invalid('missing-call-responses');
    if (snapshot.phase === 'responding' && snapshot.responseContext.kind === 'win' && snapshot.responseContext.responder < 0) return invalid('missing-win-responder');
    if (snapshot.phase !== 'responding' && (snapshot.responseContext.kind !== null || snapshot.responseContext.responses !== null || snapshot.responseContext.responder !== -1)) return invalid('stale-response-context');
    if (!isObject(snapshot.kongContext) || !isObject(snapshot.kongContext.counts) || !isObject(snapshot.kongContext.wild)) return invalid('invalid-kong-context');
    if (!isObject(snapshot.modeContext) || typeof snapshot.modeContext.selfPlayRunning !== 'boolean') return invalid('invalid-mode-context');
    if (!Number.isInteger(snapshot.totalGames) || snapshot.totalGames < 0) return invalid('invalid-total-games');
    return { ok: true, reason: null };
  }

  function create(state, context, tileKey) {
    const keyOf = typeof tileKey === 'function' ? tileKey : function (tile) { return tile.k; };
    const mapTiles = function (tiles) { return (tiles || []).map(keyOf); };
    return {
      version: VERSION,
      savedAt: new Date().toISOString(),
      status: state.phase === 'ended' ? 'ended' : 'active',
      wall: mapTiles(state.wall),
      players: (state.players || []).map(function (player) {
        return {
          name: player.name,
          human: !!player.human,
          score: player.score,
          hand: mapTiles(player.hand),
          melds: (player.melds || []).map(function (meld) { return { tile: keyOf(meld.tile), count: meld.count }; })
        };
      }),
      discards: mapTiles(state.discards),
      playerDiscards: (state.playerDiscards || []).map(mapTiles),
      lastDiscard: state.lastDiscard ? keyOf(state.lastDiscard) : null,
      lastDiscardP: Number.isInteger(state.lastDiscardP) ? state.lastDiscardP : -1,
      cur: state.cur,
      dealer: state.dealer,
      turn: state.turn,
      phase: state.phase,
      canP: !!state.canP,
      canK: !!state.canK,
      canW: !!state.canW,
      canWS: !!state.canWS,
      responseContext: {
        responses: clone(state._resp),
        responder: Number.isInteger(state._respP) ? state._respP : -1,
        kind: state._responseKind || null
      },
      kongContext: {
        counts: clone(state._kc) || {},
        wild: clone(state._hasWild) || {}
      },
      modeContext: {
        selfPlayRunning: !!(context && context.selfPlayRunning)
      },
      newDrawnTile: state.newDrawnTile ? keyOf(state.newDrawnTile) : null,
      newDrawnIdx: Number.isInteger(state.newDrawnIdx) ? state.newDrawnIdx : -1,
      currentGameLog: clone(state._gameLog),
      lastResult: clone(state._lastResult),
      totalGames: Number.isInteger(context && context.totalGames) ? context.totalGames : 0
    };
  }

  function restore(snapshot, tileFactory) {
    const validation = validate(snapshot);
    if (!validation.ok) return validation;
    if (typeof tileFactory !== 'function') return invalid('tile-factory-missing');
    try {
      const makeTiles = function (keys) { return keys.map(tileFactory); };
      const players = snapshot.players.map(function (player) {
        return {
          name: player.name,
          human: player.human,
          score: player.score,
          hand: makeTiles(player.hand),
          melds: player.melds.map(function (meld) { return { tile: tileFactory(meld.tile), count: meld.count }; })
        };
      });
      const playerDiscards = snapshot.playerDiscards.map(makeTiles);
      const discards = makeTiles(snapshot.discards);
      let lastDiscard = null;
      if (snapshot.lastDiscard !== null) {
        const row = snapshot.lastDiscardP >= 0 ? playerDiscards[snapshot.lastDiscardP] : [];
        const rowTile = row.length > 0 ? row[row.length - 1] : null;
        const globalTile = discards.length > 0 ? discards[discards.length - 1] : null;
        lastDiscard = rowTile && rowTile.k === snapshot.lastDiscard
          ? rowTile
          : globalTile && globalTile.k === snapshot.lastDiscard
            ? globalTile
            : tileFactory(snapshot.lastDiscard);
      }
      let newDrawnTile = null;
      if (snapshot.newDrawnTile !== null) {
        const hand = players[snapshot.cur].hand;
        const indexed = hand[snapshot.newDrawnIdx];
        newDrawnTile = indexed && indexed.k === snapshot.newDrawnTile
          ? indexed
          : hand.find(function (tile) { return tile.k === snapshot.newDrawnTile; }) || null;
      }
      return {
        ok: true,
        status: snapshot.status,
        savedAt: snapshot.savedAt,
        totalGames: snapshot.totalGames,
        selfPlayRunning: snapshot.modeContext.selfPlayRunning,
        state: {
          wall: makeTiles(snapshot.wall),
          players: players,
          discards: discards,
          playerDiscards: playerDiscards,
          lastDiscard: lastDiscard,
          lastDiscardP: snapshot.lastDiscardP,
          cur: snapshot.cur,
          dealer: snapshot.dealer,
          turn: snapshot.turn,
          phase: snapshot.phase,
          canP: snapshot.canP,
          canK: snapshot.canK,
          canW: snapshot.canW,
          canWS: snapshot.canWS,
          _resp: clone(snapshot.responseContext.responses),
          _respP: snapshot.responseContext.responder,
          _responseKind: snapshot.responseContext.kind,
          _kc: clone(snapshot.kongContext.counts) || {},
          _hasWild: clone(snapshot.kongContext.wild) || {},
          newDrawnTile: newDrawnTile,
          newDrawnIdx: snapshot.newDrawnIdx,
          _gameLog: clone(snapshot.currentGameLog),
          _lastResult: clone(snapshot.lastResult),
          selectedTile: null,
          _hot: [],
          _aiDiscardAnim: null,
          _aiActionTimer: null,
          _aiAnimTimer: null,
          _aiNextTurnTimer: null,
          _respTimer: null
        }
      };
    } catch (error) {
      return invalid('tile-deserialization-failed:' + (error && error.message ? error.message : String(error)));
    }
  }

  function clear(storage) {
    try {
      storage.removeItem(STORAGE_KEY);
      return { ok: true };
    } catch (error) {
      return invalid('storage-clear-failed:' + (error && error.message ? error.message : String(error)));
    }
  }

  function load(storage) {
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch (error) {
      return invalid('storage-read-failed:' + (error && error.message ? error.message : String(error)));
    }
    if (raw == null || raw === '') return { ok: false, missing: true, reason: 'snapshot-missing' };
    let snapshot;
    try {
      snapshot = JSON.parse(raw);
    } catch (error) {
      clear(storage);
      return invalid('snapshot-json-invalid');
    }
    const validation = validate(snapshot);
    if (!validation.ok) {
      clear(storage);
      return validation;
    }
    return { ok: true, snapshot: snapshot };
  }

  function save(storage, snapshot) {
    const validation = validate(snapshot);
    if (!validation.ok) return validation;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      return { ok: true };
    } catch (error) {
      return invalid('storage-write-failed:' + (error && error.message ? error.message : String(error)));
    }
  }

  global.GameSessionSnapshot = Object.freeze({
    version: VERSION,
    storageKey: STORAGE_KEY,
    create: create,
    validate: validate,
    restore: restore,
    load: load,
    save: save,
    clear: clear
  });
})(window);
