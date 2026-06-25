"use strict";
// ============================================================
// 对手建模接口层
// GPU 可用-> GPUOpponentModel, 否则-> 启发式版
// ============================================================

(function() {
  let model = null;

  function init() {
    if (window.gpu && window.gpu.available) {
      model = new GPUOpponentModel();
      console.log("[Opponent] 使用 GPU 版本");
    } else {
      model = { update: function(){}, sampleTenpai: function(){return {tenpaiProb:0, waits:[]};} };
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
