(function attachAiRuleCore(global) {
  'use strict';

  const ROUTE_PRIORITY = Object.freeze({
    norm: 0,
    '7p': 1,
    quanzheng: 2,
    banzheng: 3,
    dalan: 4
  });

  function compareRoutes(a, b) {
    if (a.v !== b.v) return a.v - b.v;
    return (ROUTE_PRIORITY[a.p] ?? 99) - (ROUTE_PRIORITY[b.p] ?? 99);
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
