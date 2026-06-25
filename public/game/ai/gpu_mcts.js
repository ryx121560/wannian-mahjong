"use strict";

const MCTS_ROLLOUT_WGSL = [
  '@group(0) @binding(0) var<storage, read> handData : array<u32>;',
  '@group(0) @binding(5) var<storage, read> candData : array<u32>;',
  '@group(0) @binding(1) var<storage, read_write> outputScores : array<f32>;',
  '@group(0) @binding(2) var<storage, read_write> rngStates : array<u32>;',
  '@group(0) @binding(3) var<uniform> params : vec4<u32>;',
  '@group(0) @binding(4) var<storage, read> lutData : array<u32>;',
  '',
  'fn xorshift(state: ptr<function, u32>) -> u32 {',
  '  var x = *state; x ^= x << 13u; x ^= x >> 17u; x ^= x << 5u; *state = x; return x;',
  '}',
  '',
  'fn computeHash(hand: array<u32, 34>) -> u32 {',
  '  var h: u32 = 0u;',
  '  for (var i: u32 = 0u; i < 34u; i++) { h = h * 31u + hand[i]; }',
  '  return h;',
  '}',
  '',
  'fn lutLookup(hash: u32, lutSize: u32) -> u32 {',
  '  var lo: u32 = 0u; var hi: u32 = lutSize;',
  '  while (lo < hi) {',
  '    var mid: u32 = (lo + hi) >> 1u;',
  '    var mh: u32 = lutData[mid * 2u];',
  '    if (mh < hash) { lo = mid + 1u; } else { hi = mid; }',
  '  }',
  '  if (lo < lutSize && lutData[lo * 2u] == hash) { return lutData[lo * 2u + 1u]; }',
  '  return 99u;',
  '}',
  '',
  'fn shantenFallback(hand: array<u32, 34>) -> u32 {',
  '  var pairs: u32 = 0u; var melds: u32 = 0u;',
  '  for (var i: u32 = 0u; i < 34u; i++) {',
  '    if (hand[i] >= 3u) { melds++; } else if (hand[i] >= 2u) { pairs++; }',
  '  }',
  '  return 8u - min(melds + pairs, 7u);',
  '}',
  '',
  'fn getShanten(hand: array<u32, 34>, lutSize: u32) -> u32 {',
  '  if (lutSize > 0u) {',
  '    var h = computeHash(hand);',
  '    var s = lutLookup(h, lutSize);',
  '    if (s < 99u) { return s; }',
  '  }',
  '  return shantenFallback(hand);',
  '}',
  '',
  '@compute @workgroup_size(64)',
  'fn main(@builtin(global_invocation_id) gid: vec3<u32>) {',
  '  let idx = gid.x; let totalInst = params.x; let maxDepth = params.y; let lutSize = params.z;',
  '  if (idx >= totalInst) { return; }',
  '  let off = idx * 35u;',
  '  var hand: array<u32, 34>;',
  '  for (var i: u32 = 0u; i < 34u; i++) { hand[i] = inputData[off + i]; }',
  '  let discIdx = inputData[off + 34u];',
  '  if (hand[discIdx] > 0u) { hand[discIdx]--; }',
  '  var state = rngStates[idx]; if (state == 0u) { state = idx + 1u; }',
  '  var score: f32 = 0.0;',
  '  for (var d: u32 = 0u; d < maxDepth; d++) {',
  '    let tile = xorshift(&state) % 34u; hand[tile]++;',
  '    var sh = getShanten(hand, lutSize);',
  '    if (sh == 0u) { score += 1.0; } else { score += 1.0 / f32(sh + 1u); }',
  '    if (sh > 0u) {',
  '      var bestDisc: u32 = 0u; var bestSh: u32 = 99u;',
  '      for (var c: u32 = 0u; c < 34u; c++) {',
  '        if (hand[c] > 0u) {',
  '          hand[c]--; sh = getShanten(hand, lutSize);',
  '          if (sh < bestSh) { bestSh = sh; bestDisc = c; }',
  '          hand[c]++;',
  '        }',
  '      }',
  '      if (hand[bestDisc] > 0u) { hand[bestDisc]--; }',
  '    }',
  '  }',
  '  outputScores[idx] = score; rngStates[idx] = state;',
  '}',
].join("\n");

var TILE_INDEX = {wan1:0,wan2:1,wan3:2,wan4:3,wan5:4,wan6:5,wan7:6,wan8:7,wan9:8,
  tong1:9,tong2:10,tong3:11,tong4:12,tong5:13,tong6:14,tong7:15,tong8:16,tong9:17,
  tiao1:18,tiao2:19,tiao3:20,tiao4:21,tiao5:22,tiao6:23,tiao7:24,tiao8:25,tiao9:26,
  dong:27,nan:28,xi:29,bei:30,zhong:31,fa:32,bai:33};





class GPUMctsRollout {
  constructor() {
    this.gpu = window.gpu;
    this.numRollouts = 1000000;
    this.maxDepth = 12;
    this.ready = this.gpu && this.gpu.available;
    this.candidates = 14;
    this.pipeline = null;
    this.lutData = null; // {hashAndShanten array, lutSize}
    if (this.ready) {
      try {
        this._initShader();
        this._loadLUT();
        console.log("[GPUMcts] ready, rollouts=" + this.numRollouts + " depth=" + this.maxDepth);
      } catch (e) {
        console.warn("[GPUMcts] init fail:", e.message);
        this.ready = false;
      }
    }
  }

  _initShader() {
    var d = this.gpu.device;
    this.pipeline = d.createComputePipeline({
      layout: "auto",
      compute: { module: d.createShaderModule({ code: MCTS_ROLLOUT_WGSL }), entryPoint: "main" }
    });
  }

  _loadLUT() {
    try {
      var req = new XMLHttpRequest();
      req.open("GET", "/game/ai/shanten_lut.json", false);
      req.send();
      if (req.status === 200) {
        var entries = JSON.parse(req.responseText);
        var pairs = [];
        for (var i = 0; i < entries.length; i++) {
          var names = entries[i].h.split(",");
          var counts = new Array(34).fill(0);
          for (var j = 0; j < names.length; j++) {
            var idx = TILE_INDEX[names[j]];
            if (idx !== undefined) counts[idx]++;
          }
          var h = 0;
          for (var k = 0; k < 34; k++) { h = Math.imul(h, 31) + (counts[k] || 0) | 0; }
          pairs.push({hash: h >>> 0, shanten: Math.min(entries[i].s, 15)});
        }
        pairs.sort(function(a, b) { return a.hash - b.hash; });
        var arr = new Uint32Array(pairs.length * 2);
        for (var k = 0; k < pairs.length; k++) {
          arr[k * 2] = pairs[k].hash;
          arr[k * 2 + 1] = pairs[k].shanten;
        }
        this.lutData = { arr: arr, size: pairs.length };
        console.log("[GPUMcts] LUT loaded: " + pairs.length + " entries");
      }
    } catch(e) {
      console.warn("[GPUMcts] LUT load:", e.message);
    }
  }

  async run(handStates, discardCandidates, GS, options) {
    if (!this.ready) return null;
    options = options || {};
    var nr = options.numRollouts || this.numRollouts;
    var md = options.maxDepth || this.maxDepth;
    var batch = handStates.length * discardCandidates.length;
    if (batch === 0) return [];

    var d = this.gpu.device;
    var totalInst = batch * nr;

    var inputArr = new Uint32Array(totalInst * 35);
    var rngArr = new Uint32Array(totalInst);
    for (var i = 0; i < totalInst; i++) {
      var instIdx = i % batch;
      var candIdx = instIdx % discardCandidates.length;
      var handIdx = Math.floor(instIdx / discardCandidates.length);
      for (var t = 0; t < 34; t++) {
        inputArr[i * 35 + t] = handStates[handIdx] ? (handStates[handIdx][t] || 0) : 0;
      }
      inputArr[i * 35 + 34] = discardCandidates[candIdx];
      rngArr[i] = (i + 1) * 2654435761;
    }

    var inputBuf = this._makeBuf(inputArr);
    var outputBuf = this._makeRW(totalInst * 4);
    var rngBuf = this._makeBuf(rngArr);
    var lutSize = this.lutData ? this.lutData.size : 0;
    var lutBuf = this.lutData ? this._makeBuf(this.lutData.arr) : this._makeBuf(new Uint32Array([0]));
    var uniformBuf = this._makeUniform([totalInst, md, lutSize, batch]);

    var bg = d.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: handBuf } },
        { binding: 1, resource: { buffer: outputBuf } },
        { binding: 2, resource: { buffer: rngBuf } },
        { binding: 3, resource: { buffer: uniformBuf } },
        { binding: 4, resource: { buffer: lutBuf } },
        { binding: 5, resource: { buffer: candBuf } }
      ]
    });

    var enc = d.createCommandEncoder();
    var pass = enc.beginComputePass();
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(Math.ceil(totalInst / 64));
    pass.end(); d.queue.submit([enc.finish()]);
    await d.queue.onSubmittedWorkDone();

    var result = await this.gpu.readBuffer(outputBuf, totalInst * 4);
    var scores = new Float32Array(result, 0, totalInst);

    var aggScores = [];
    for (var c = 0; c < discardCandidates.length; c++) {
      var sum = 0; var cnt = 0;
      for (var r = 0; r < nr; r++) { var inst = r * batch + c; sum += scores[inst]; cnt++; }
      aggScores.push({candidateKey: discardCandidates[c], avgScore: cnt > 0 ? sum / cnt : 0});
    }

    handBuf.destroy(); outputBuf.destroy(); rngBuf.destroy(); candBuf.destroy();
    uniformBuf.destroy(); lutBuf.destroy();
    return aggScores;
  }

  _makeBuf(data) {
    var d = this.gpu.device;
    var u = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    var buf = d.createBuffer({ size: data.byteLength, usage: u });
    d.queue.writeBuffer(buf, 0, data); return buf;
  }

  _makeRW(size) {
    var d = this.gpu.device;
    return d.createBuffer({ size: size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  }

  _makeUniform(v) {
    var data = new Uint32Array(v);
    var d = this.gpu.device;
    var buf = d.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(buf, 0, data); return buf;
  }
}

if (typeof window !== "undefined") window.GPUMctsRollout = GPUMctsRollout;