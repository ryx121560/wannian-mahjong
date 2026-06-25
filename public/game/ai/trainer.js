"use strict";

class RLTrainer {
  constructor(mlp) {
    this.mlp = mlp || null;
    this.experience = [];
    this.batchSize = 16;
    this.lr = 0.001;
    this.beta1 = 0.9; this.beta2 = 0.999; this.eps = 1e-8;
    this.t = 0; this.mW = null; this.vW = null; this.mB = null; this.vB = null;
    if (this.mlp) console.log("[RLTrainer] initialized");
  }

  addExperience(state, targetPolicy, targetValue) {
    if(this.experience.length>1024)this.experience.splice(0,512);
    this.experience.push({
      input: new Float32Array(state),
      targetPolicy: new Float32Array(targetPolicy),
      targetValue: targetValue
    });
  }

  trainMiniBatch() {
    if (!this.mlp || !this.mlp.ready || this.experience.length === 0) return null;
    var batch = Math.min(this.experience.length, this.batchSize);
    if (!this.mW) {
      this.mW = this.mlp.weights.map(function(w){return new Float32Array(w.length);});
      this.vW = this.mlp.weights.map(function(w){return new Float32Array(w.length);});
      this.mB = this.mlp.biases.map(function(b){return new Float32Array(b.length);});
      this.vB = this.mlp.biases.map(function(b){return new Float32Array(b.length);});
    }
    var idx = [];
    for (var s = 0; s < batch; s++) idx.push(Math.floor(Math.random() * this.experience.length));
    var gradW = this.mlp.weights.map(function(w){return new Float32Array(w.length);});
    var gradB = this.mlp.biases.map(function(b){return new Float32Array(b.length);});
    var totalLoss = 0;
    for (var si = 0; si < batch; si++) {
      var ex = this.experience[idx[si]];
      var acts = [ex.input];
      var h = new Float32Array(ex.input);
      for (var l = 0; l < this.mlp.weights.length; l++) {
        var w = this.mlp.weights[l], b = this.mlp.biases[l];
        var inSz = this.mlp.layers[l], outSz = this.mlp.layers[l+1];
        var n = new Float32Array(outSz);
        for (var o = 0; o < outSz; o++) {
          var s = b[o];
          for (var i = 0; i < inSz; i++) s += h[i] * w[o * inSz + i];
          n[o] = (l < this.mlp.weights.length - 1) ? Math.max(0, s) : s;
        }
        acts.push(n); h = n;
      }
      var lastH = acts[acts.length - 1];
      var sumExp = 0;
      for (var i = 0; i < 34; i++) sumExp += Math.exp(lastH[i]);
      if (sumExp === Infinity || sumExp <= 0) continue;
      var delta = new Float32Array(this.mlp.layers[this.mlp.layers.length - 1]);
      for (var i = 0; i < 34; i++) {
        var soft = Math.exp(lastH[i]) / sumExp;
        totalLoss -= ex.targetPolicy[i] * Math.log(Math.max(soft, 1e-10));
        delta[i] = soft - ex.targetPolicy[i];
      }
      var pv = Math.tanh(lastH[34]);
      totalLoss += (pv - ex.targetValue) * (pv - ex.targetValue);
      delta[34] = (1 - pv * pv) * (pv - ex.targetValue);
      for (var l = this.mlp.weights.length - 1; l >= 0; l--) {
        var w = this.mlp.weights[l], aPrev = acts[l];
        var inSz = this.mlp.layers[l], outSz = this.mlp.layers[l+1];
        for (var o = 0; o < outSz; o++) {
          if (delta[o] === 0) continue;
          for (var i = 0; i < inSz; i++) gradW[l][o * inSz + i] += aPrev[i] * delta[o];
          gradB[l][o] += delta[o];
        }
        if (l > 0) {
          var pd = new Float32Array(inSz);
          for (var i = 0; i < inSz; i++) {
            var su = 0;
            for (var o = 0; o < outSz; o++) su += w[o * inSz + i] * delta[o];
            pd[i] = su * ((aPrev[i] > 0) ? 1 : 0);
          }
          delta = pd;
        }
      }
    }
    var invB = 1 / batch;
    for (var l = 0; l < gradW.length; l++) {
      for (var i = 0; i < gradW[l].length; i++) gradW[l][i] *= invB;
      for (var i = 0; i < gradB[l].length; i++) gradB[l][i] *= invB;
    }
    this.t++;
    var lrT = this.lr * Math.sqrt(1 - Math.pow(this.beta2, this.t)) / (1 - Math.pow(this.beta1, this.t));
    for (var l = 0; l < this.mlp.weights.length; l++) {
      var w = this.mlp.weights[l], b = this.mlp.biases[l];
      var mw = this.mW[l], vw = this.vW[l], mb = this.mB[l], vb = this.vB[l];
      var gw = gradW[l], gb = gradB[l];
      for (var i = 0; i < w.length; i++) {
        mw[i] = this.beta1 * mw[i] + (1 - this.beta1) * gw[i];
        vw[i] = this.beta2 * vw[i] + (1 - this.beta2) * gw[i] * gw[i];
        w[i] -= lrT * mw[i] / (Math.sqrt(vw[i]) + this.eps);
      }
      for (var i = 0; i < b.length; i++) {
        mb[i] = this.beta1 * mb[i] + (1 - this.beta1) * gb[i];
        vb[i] = this.beta2 * vb[i] + (1 - this.beta2) * gb[i] * gb[i];
        b[i] -= lrT * mb[i] / (Math.sqrt(vb[i]) + this.eps);
      }
    }
    if (this.mlp.gpuW.length > 0) {
      var d = this.mlp.device;
      for (var l = 0; l < this.mlp.weights.length; l++) {
        d.queue.writeBuffer(this.mlp.gpuW[l], 0, this.mlp.weights[l]);
        d.queue.writeBuffer(this.mlp.gpuB[l], 0, this.mlp.biases[l]);
      }
    }
    return { loss: totalLoss / batch, samples: batch };
  }

  evaluateLoss(examples) {
    if (!this.mlp || examples.length === 0) return Infinity;
    var totalLoss = 0;
    for (var s = 0; s < examples.length; s++) {
      var ex = examples[s];
      var pred = this.mlp._forwardCPU(ex.input);
      for (var i = 0; i < 34; i++)
        totalLoss -= ex.targetPolicy[i] * Math.log(Math.max(pred.policy[i], 1e-10));
      totalLoss += (pred.value - ex.targetValue) * (pred.value - ex.targetValue);
    }
    return totalLoss / examples.length;
  }

  save() {
    if (!this.mlp) return;
    var data = this.mlp.serialize();
    try {
      localStorage.setItem("rl_model", data);
    } catch (e) {}
    console.log("[RLTrainer] weights saved");
  }

  load() {
    try {
      var data = localStorage.getItem("rl_model");
      if (data) {
        this.mlp = GPUMlp.deserialize(data);
        return true;
      }
    } catch (e) {}
    return false;
  }
  // GPU 加速训练：CPU 计算前向+梯度，GPU 执行 Adam 更新
  async trainMiniBatchGPU() {
    if (!this.mlp || !this.mlp.ready || this.experience.length === 0) return null;
    if (!this.mlp.device || !this.mlp.gpuW || !this.mlp.gpuW[0]) {
      return this.trainMiniBatch();
    }
    var batch = Math.min(this.experience.length, this.batchSize);
    if (!this.mW) {
      this.mW = this.mlp.weights.map(function(w){return new Float32Array(w.length);});
      this.vW = this.mlp.weights.map(function(w){return new Float32Array(w.length);});
      this.mB = this.mlp.biases.map(function(b){return new Float32Array(b.length);});
      this.vB = this.mlp.biases.map(function(b){return new Float32Array(b.length);});
    }
    var idx = [];
    for (var s = 0; s < batch; s++) idx.push(Math.floor(Math.random() * this.experience.length));
    var gradW = this.mlp.weights.map(function(w){return new Float32Array(w.length);});
    var gradB = this.mlp.biases.map(function(b){return new Float32Array(b.length);});
    var totalLoss = 0;
    for (var si = 0; si < batch; si++) {
      var ex = this.experience[idx[si]];
      var acts = [ex.input];
      var h = new Float32Array(ex.input);
      for (var l = 0; l < this.mlp.weights.length; l++) {
        var w = this.mlp.weights[l], b = this.mlp.biases[l];
        var inSz = this.mlp.layers[l], outSz = this.mlp.layers[l+1];
        var n = new Float32Array(outSz);
        for (var o = 0; o < outSz; o++) {
          var s = b[o];
          for (var i = 0; i < inSz; i++) s += h[i] * w[o * inSz + i];
          n[o] = (l < this.mlp.weights.length - 1) ? Math.max(0, s) : s;
        }
        acts.push(n); h = n;
      }
      var lastH = acts[acts.length - 1];
      var sumExp = 0;
      for (var i = 0; i < 34; i++) sumExp += Math.exp(lastH[i]);
      if (sumExp === Infinity || sumExp <= 0) continue;
      var delta = new Float32Array(this.mlp.layers[this.mlp.layers.length - 1]);
      for (var i = 0; i < 34; i++) {
        var soft = Math.exp(lastH[i]) / sumExp;
        totalLoss -= ex.targetPolicy[i] * Math.log(Math.max(soft, 1e-10));
        delta[i] = soft - ex.targetPolicy[i];
      }
      var pv = Math.tanh(lastH[34]);
      totalLoss += (pv - ex.targetValue) * (pv - ex.targetValue);
      delta[34] = (1 - pv * pv) * (pv - ex.targetValue);
      for (var l = this.mlp.weights.length - 1; l >= 0; l--) {
        var w = this.mlp.weights[l], aPrev = acts[l];
        var inSz = this.mlp.layers[l], outSz = this.mlp.layers[l+1];
        for (var o = 0; o < outSz; o++) {
          if (delta[o] === 0) continue;
          for (var i = 0; i < inSz; i++) gradW[l][o * inSz + i] += aPrev[i] * delta[o];
          gradB[l][o] += delta[o];
        }
        if (l > 0) {
          var pd = new Float32Array(inSz);
          for (var i = 0; i < inSz; i++) {
            var su = 0;
            for (var o = 0; o < outSz; o++) su += w[o * inSz + i] * delta[o];
            pd[i] = su * ((aPrev[i] > 0) ? 1 : 0);
          }
          delta = pd;
        }
      }
    }
    var invB = 1 / batch;
    for (var l = 0; l < gradW.length; l++) {
      for (var i = 0; i < gradW[l].length; i++) gradW[l][i] *= invB;
      for (var i = 0; i < gradB[l].length; i++) gradB[l][i] *= invB;
    }
    this.mlp._initAdam();
    var d = this.mlp.device;
    for (var l = 0; l < this.mlp.weights.length; l++) {
      var gBuf = d.createBuffer({size: gradW[l].byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC});
      d.queue.writeBuffer(gBuf, 0, gradW[l]);
      this.mlp._adamUpdate(l, gBuf, this.lr);
    }
    await d.queue.onSubmittedWorkDone();
    for (var l = 0; l < this.mlp.weights.length; l++) {
      var rb = d.createBuffer({size: this.mlp.weights[l].byteLength, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
      var enc = d.createCommandEncoder();
      enc.copyBufferToBuffer(this.mlp.gpuW[l], 0, rb, 0, this.mlp.weights[l].byteLength);
      d.queue.submit([enc.finish()]);
      await rb.mapAsync(GPUMapMode.READ);
      var arr = new Float32Array(rb.getMappedRange());
      this.mlp.weights[l].set(arr);
      rb.unmap();
      rb.destroy();
    }
    return { loss: totalLoss / batch, samples: batch };
  }
}

if (typeof window !== "undefined") window.RLTrainer = RLTrainer;