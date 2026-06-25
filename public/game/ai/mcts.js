"use strict";

(function() {
  var gpuRollout = null;
  var gpuCache = {};

  function initGPU() {
    if (window.gpu && window.gpu.available && !gpuRollout) {
      try { gpuRollout = new GPUMctsRollout(); } catch(e) { console.warn("[MCTS] GPU init:", e.message); }
    }
  }

  function handToCounts(hand) {
    var counts = new Array(34).fill(0);
    for (var i = 0; i < hand.length; i++) {
      var idx = ALL_KEYS.indexOf(hand[i].k);
      if (idx >= 0) counts[idx]++;
    }
    return counts;
  }

  if (window.MCTS) {
    var _orig = window.MCTS.chooseDiscard;
    window.MCTS.chooseDiscard = async function(hand, playerIdx, GS) {
      if (gpuRollout && gpuRollout.ready) {
        try {
          var counts = handToCounts(hand);
          var candidates = [];
          for (var i = 0; i < hand.length; i++) {
            var idx = ALL_KEYS.indexOf(hand[i].k);
            if (idx >= 0 && !candidates.includes(idx)) candidates.push(idx);
          }
          if (candidates.length >= 2) {
            var gpuPromise = gpuRollout.run([counts], candidates, GS, {
              numRollouts: 1000000, maxDepth: 8
            });
            var timeout = new Promise(function(r) { setTimeout(r, 3000); });
            var gpuResult = await Promise.race([gpuPromise, timeout]);
            if (gpuResult && gpuResult.length > 0) {
              gpuResult.sort(function(a, b) { return b.avgScore - a.avgScore; });
              var bestKey = ALL_KEYS[gpuResult[0].candidateKey];
              var idx = hand.findIndex(function(t) { return t.k === bestKey; });
              if (idx >= 0) {
                return idx;
              }
            }
          }
        } catch(e) { /* GPU fail, fallback */ }
      }
      return _orig ? _orig.call(this, hand, playerIdx, GS) : 0;
    };
    console.log("[MCTS] async GPU MCTS ready");
    initGPU();
  }
})();