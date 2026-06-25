"use strict";
// ============================================================
// GPU 贝叶斯对手建模
// 每个对手维护 34 维 P(持有牌_i) 分布 + 听牌采样
// ============================================================

class GPUOpponentModel {
  constructor() {
    this.gpu = window.gpu;
    this.ready = this.gpu && this.gpu.available;
    this.distributions = [];
    for (let i = 0; i < 4; i++) {
      this.distributions.push(new Array(34).fill(0));
    }
    if (this.ready) {
      console.log("[GPUOpponent] GPU 对手模型初始化");
    }
  }

  update(playerIdx, action, tile) {
    // Placeholder: CPU 版本的贝叶斯更新
    const dist = this.distributions[playerIdx];
    if (action === "discard") {
      dist[tile] = 0;
    } else if (action === "pong") {
      dist[tile] = 3;
    }
  }

  sampleTenpai(playerIdx) {
    // Placeholder
    return { tenpaiProb: 0.1, waits: [] };
  }

  getDistribution(playerIdx) {
    return this.distributions[playerIdx];
  }
}

if (typeof window !== "undefined") {
  window.GPUOpponentModel = GPUOpponentModel;
}
