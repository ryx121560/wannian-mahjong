(function attachGameSessionSnapshot(global) {
  'use strict';

  const VERSION = 1;
  const STORAGE_KEY = 'wannian_game_snapshot_v1';
  const PHASES = Object.freeze(['idle', 'drawing', 'discarding', 'responding', 'ended']);
  const RESPONSE_KINDS = Object.freeze([null, 'win', 'calls']);
  const HONORS = Object.freeze(['dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai']);
  const KONG_RESOURCE_STATUSES = Object.freeze(['active', 'consumed', 'invalidated']);
  const KONG_CLAIM_KINDS = Object.freeze(['directChisel', 'forcedRunImmediate', 'forcedRunDeferred', 'chainKong', 'addedKongChain']);
  const SPECIAL_KONG_CHOICE_KINDS = Object.freeze(['postPongCandidateConcealedKong', 'forcedRunConcealed', 'doublePongForcedRun', 'cancel']);

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
      && (meld.count === 3 || meld.count === 4)
      && (meld.concealed === undefined || typeof meld.concealed === 'boolean')
      && (meld.fromPlayer === undefined || isPlayerIndex(meld.fromPlayer, false));
  }

  function validateRuleMeld(meld) {
    return isObject(meld)
      && typeof meld.type === 'string'
      && isTileArray(meld.tiles)
      && (meld.tiles.length === 3 || meld.tiles.length === 4)
      && meld.tiles.every(function (tile) { return tile === meld.tiles[0]; });
  }

  function validateKongResource(resource) {
    return isObject(resource)
      && isPlayerIndex(resource.owner, false)
      && isTileKey(resource.tile)
      && resource.source === 'pong'
      && KONG_RESOURCE_STATUSES.includes(resource.status)
      && validateRuleMeld(resource.pongMeld)
      && resource.pongMeld.type === 'peng'
      && resource.pongMeld.tiles.length === 3
      && resource.pongMeld.tiles.every(function (tile) { return tile === resource.tile; });
  }

  function validateAddedKongChainWindow(window) {
    if (!isObject(window)
      || window.kind !== 'addedKongChain'
      || !isPlayerIndex(window.owner, false)
      || !validateKongResource(window.initialResource)
      || window.initialResource.owner !== window.owner
      || window.initialResource.status !== 'active'
      || !validateRuleMeld(window.chainPongMeld)
      || window.chainPongMeld.type !== 'peng'
      || window.chainPongMeld.tiles.length !== 3
      || window.chainPongMeld.tiles[0] === window.initialResource.tile
      || !isTileArray(window.preKongHand)
      || !isTileArray(window.initialHandAfterKong)
      || !Array.isArray(window.initialMelds)
      || !window.initialMelds.every(validateRuleMeld)
      || !isTileKey(window.firstDrawTile)) return false;
    return window.initialMelds.some(function (meld) {
      return meld.type === 'mingGang'
        && meld.tiles.length === 4
        && meld.tiles[0] === window.initialResource.tile;
    }) && window.initialMelds.some(function (meld) {
      return meld.type === 'peng'
        && meld.tiles.length === 3
        && meld.tiles[0] === window.chainPongMeld.tiles[0];
    });
  }

  function validateKongActionWindow(window) {
    if (window === null) return true;
    if (!isObject(window) || !KONG_CLAIM_KINDS.includes(window.kind)) return false;
    if (window.kind === 'addedKongChain') return validateAddedKongChainWindow(window);
    return isPlayerIndex(window.owner, false) && validateKongResource(window.resource);
  }

  function validateCandidateKongResource(resource) {
    return isObject(resource)
      && isPlayerIndex(resource.owner, false)
      && isTileKey(resource.candidateKongTile)
      && KONG_RESOURCE_STATUSES.includes(resource.status)
      && validateRuleMeld(resource.pongMeld)
      && resource.pongMeld.type === 'peng'
      && resource.pongMeld.tiles.length === 3;
  }

  function validateSpecialKongChoice(choice) {
    return isObject(choice)
      && typeof choice.key === 'string'
      && SPECIAL_KONG_CHOICE_KINDS.includes(choice.kind)
      && (choice.tile === undefined || isTileKey(choice.tile));
  }

  function validateSpecialKongChoiceWindow(window) {
    return window === null || (isObject(window)
      && isPlayerIndex(window.owner, false)
      && typeof window.phase === 'string'
      && Array.isArray(window.choices)
      && window.choices.every(validateSpecialKongChoice));
  }
  function validateTopSettlement(summary) {
    return summary === null || summary === undefined || (isObject(summary)
      && typeof summary.type === 'string'
      && Array.isArray(summary.scoreDeltas)
      && summary.scoreDeltas.length === 4
      && summary.scoreDeltas.every(Number.isFinite)
      && Math.abs(summary.scoreDeltas.reduce(function (sum, value) { return sum + value; }, 0)) < 1e-9);
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
    if (snapshot.kongContext.resources !== undefined && (!Array.isArray(snapshot.kongContext.resources) || !snapshot.kongContext.resources.every(validateKongResource))) return invalid('invalid-kong-resources');
    if (snapshot.kongContext.actionWindow !== undefined && !validateKongActionWindow(snapshot.kongContext.actionWindow)) return invalid('invalid-kong-action-window');
    if (snapshot.kongContext.candidateResources !== undefined && (!Array.isArray(snapshot.kongContext.candidateResources) || !snapshot.kongContext.candidateResources.every(validateCandidateKongResource))) return invalid('invalid-candidate-kong-resources');
    if (snapshot.kongContext.choiceWindow !== undefined && !validateSpecialKongChoiceWindow(snapshot.kongContext.choiceWindow)) return invalid('invalid-special-kong-choice-window');
    if (!isObject(snapshot.modeContext) || typeof snapshot.modeContext.selfPlayRunning !== 'boolean') return invalid('invalid-mode-context');
    if (!Number.isInteger(snapshot.totalGames) || snapshot.totalGames < 0) return invalid('invalid-total-games');
    if (snapshot.gameSequence !== null && snapshot.gameSequence !== undefined && (!Number.isInteger(snapshot.gameSequence) || snapshot.gameSequence < 1)) return invalid('invalid-game-sequence');
    if (!validateTopSettlement(snapshot.topSettlement)) return invalid('invalid-top-settlement');
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
          melds: (player.melds || []).map(function (meld) {
            const serialized = { tile: keyOf(meld.tile), count: meld.count };
            if (meld.concealed === true) serialized.concealed = true;
            if (Number.isInteger(meld.fromPlayer)) serialized.fromPlayer = meld.fromPlayer;
            return serialized;
          })
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
        wild: clone(state._hasWild) || {},
        resources: clone(state._kongResources) || [],
        actionWindow: clone(state._kongActionWindow) || null,
        candidateResources: clone(state._candidateKongResources) || [],
        choiceWindow: clone(state._specialKongChoiceWindow) || null
      },
      modeContext: {
        selfPlayRunning: !!(context && context.selfPlayRunning)
      },
      newDrawnTile: state.newDrawnTile ? keyOf(state.newDrawnTile) : null,
      newDrawnIdx: Number.isInteger(state.newDrawnIdx) ? state.newDrawnIdx : -1,
      currentGameLog: clone(state._gameLog),
      lastResult: clone(state._lastResult),
      totalGames: Number.isInteger(context && context.totalGames) ? context.totalGames : 0,
      gameSequence: Number.isInteger(context && context.gameSequence) && context.gameSequence > 0 ? context.gameSequence : null,
      topSettlement: clone(context && context.topSettlement) || null
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
          melds: player.melds.map(function (meld) {
            const restoredMeld = { tile: tileFactory(meld.tile), count: meld.count };
            if (meld.concealed === true) restoredMeld.concealed = true;
            if (Number.isInteger(meld.fromPlayer)) restoredMeld.fromPlayer = meld.fromPlayer;
            return restoredMeld;
          })
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
        gameSequence: snapshot.gameSequence || null,
        topSettlement: clone(snapshot.topSettlement) || null,
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
          _kongResources: clone(snapshot.kongContext.resources) || [],
          _kongActionWindow: clone(snapshot.kongContext.actionWindow) || null,
          _candidateKongResources: clone(snapshot.kongContext.candidateResources) || [],
          _specialKongChoiceWindow: clone(snapshot.kongContext.choiceWindow) || null,
          newDrawnTile: newDrawnTile,
          newDrawnIdx: snapshot.newDrawnIdx,
          _gameLog: clone(snapshot.currentGameLog),
          _gameSequence: snapshot.gameSequence || null,
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
