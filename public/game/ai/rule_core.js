(function attachAiRuleCore(global) {
  'use strict';

  const ROUTE_PRIORITY = Object.freeze({
    norm: 0,
    '7p': 1,
    quanzheng: 2,
    banzheng: 3,
    dalan: 4
  });
  const UNKNOWN_ROUTE_PRIORITY = Math.max.apply(null, Object.values(ROUTE_PRIORITY)) + 1;

  function compareRoutes(a, b) {
    if (a.v !== b.v) return a.v - b.v;
    const left = ROUTE_PRIORITY[a.p] ?? UNKNOWN_ROUTE_PRIORITY;
    const right = ROUTE_PRIORITY[b.p] ?? UNKNOWN_ROUTE_PRIORITY;
    if (left !== right) return left - right;
    if (left === UNKNOWN_ROUTE_PRIORITY && a.p !== b.p) {
      console.warn('[AIRuleCore] unknown route type', a.p, b.p);
      return String(a.p).localeCompare(String(b.p));
    }
    return 0;
  }

  function compareWaitShape(waitBefore, waitAfter) {
    const before = Array.isArray(waitBefore) ? waitBefore : [];
    const after = Array.isArray(waitAfter) ? waitAfter : [];
    const afterSet = new Set(after);
    const lostWaits = before.filter(function findLostWait(tile) {
      return !afterSet.has(tile);
    });
    return {
      preserved: before.length === 0 || lostWaits.length === 0,
      lostWaits: lostWaits
    };
  }

  function scoreTenpaiCandidate(input) {
    const waitCount = Number(input.waitCount) || 0;
    const waitRemaining = Number(input.waitRemaining) || 0;
    const defenseWeight = Number(input.defenseWeight) || 0;
    const safety = Number(input.safety) || 0;
    const structurePenalty = (input.breaksMeld ? 2 : 0) + (input.breaksPair ? 1 : 0);
    return waitCount * 100 + waitRemaining * 10 + defenseWeight * safety - structurePenalty;
  }

  function scoreSemiFoldCandidate(input) {
    const safety = Number(input.safety) || 0;
    const structurePenalty = (input.breaksMeld ? 2 : 0)
      + (input.breaksPair ? 1 : 0)
      + (input.breaksTaatsu ? 0.5 : 0);
    return safety * 100 - structurePenalty;
  }

  function canLearningOverride(candidateShanten, ruleShanten) {
    return Number.isFinite(candidateShanten)
      && Number.isFinite(ruleShanten)
      && candidateShanten <= ruleShanten;
  }

  global.AIRuleCore = Object.freeze({
    id: 'wannian-rule-core',
    version: '2026-06-20-r1',
    routePriority: ROUTE_PRIORITY,
    compareRoutes: compareRoutes,
    compareWaitShape: compareWaitShape,
    scoreTenpaiCandidate: scoreTenpaiCandidate,
    scoreSemiFoldCandidate: scoreSemiFoldCandidate,
    canLearningOverride: canLearningOverride
  });
})(window);
