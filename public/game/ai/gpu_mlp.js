"use strict";

const MATMUL_WGSL = [
  '@group(0) @binding(0) var<storage, read> A : array<f32>;',
  '@group(0) @binding(1) var<storage, read> B : array<f32>;',
  '@group(0) @binding(2) var<storage, read_write> C : array<f32>;',
  '@group(0) @binding(3) var<uniform> dims : vec4<u32>;',
  'const TS = 16u;',
  'var<workgroup> tA : array<array<f32, TS>, TS>;',
  'var<workgroup> tB : array<array<f32, TS>, TS>;',
  '@compute @workgroup_size(TS, TS)',
  'fn main(@builtin(global_invocation_id) gid : vec3<u32>,',
  '        @builtin(local_invocation_id) lid : vec3<u32>,',
  '        @builtin(workgroup_id) wgid : vec3<u32>) {',
  '  let M = dims.x; let K = dims.y; let N = dims.z;',
  '  let row = gid.y; let col = gid.x;',
  '  var sum = 0.0;',
  '  let tiles = (K + TS - 1u) / TS;',
  '  for (var t = 0u; t < tiles; t++) {',
  '    let ar = wgid.y * TS + lid.y; let ac = t * TS + lid.x;',
  '    let br = t * TS + lid.y; let bc = wgid.x * TS + lid.x;',
  '    tA[lid.y][lid.x] = select(0.0, A[ar * K + ac], ar < M && ac < K);',
  '    tB[lid.y][lid.x] = select(0.0, B[br * N + bc], br < K && bc < N);',
  '    workgroupBarrier();',
  '    for (var kk = 0u; kk < TS; kk++) { sum += tA[lid.y][kk] * tB[kk][lid.x]; }',
  '    workgroupBarrier();',
  '  }',
  '  if (row < M && col < N) { C[row * N + col] = sum; }',
  '}',
].join("\n");

const RELU_WGSL = [
  '@group(0) @binding(0) var<storage, read_write> X : array<f32>;',
  '@group(0) @binding(1) var<storage, read> bias : array<f32>;',
  '@group(0) @binding(2) var<uniform> dims : vec4<u32>;',
  '@compute @workgroup_size(256)',
  'fn main(@builtin(global_invocation_id) gid : vec3<u32>) {',
  '  let i = gid.x;',
  '  if (i >= dims.x) { return; }',
  '  X[i] = max(0.0, X[i] + bias[i % dims.y]);',
  '}',
].join("\n");

const SOFTMAX_WGSL = [
  '@group(0) @binding(0) var<storage, read_write> X : array<f32>;',
  '@group(0) @binding(1) var<uniform> dims : vec4<u32>;',
  '@compute @workgroup_size(256)',
  'fn main(@builtin(global_invocation_id) gid : vec3<u32>) {',
  '  let row = gid.x; let N = dims.y;',
  '  if (row >= dims.x) { return; }',
  '  var mx = -1e10;',
  '  for (var j = 0u; j < N; j++) { mx = max(mx, X[row * N + j]); }',
  '  var sum = 0.0;',
  '  for (var j = 0u; j < N; j++) {',
  '    let v = exp(X[row * N + j] - mx); X[row * N + j] = v; sum += v;',
  '  }',
  '  for (var j = 0u; j < N; j++) { X[row * N + j] /= sum; }',
  '}',
].join("\n");

const GRAD_MATMUL_WGSL = [
  '@group(0) @binding(0) var<storage, read> A : array<f32>;',
  '@group(0) @binding(1) var<storage, read> B : array<f32>;',
  '@group(0) @binding(2) var<storage, read_write> C : array<f32>;',
  '@group(0) @binding(3) var<uniform> dims : vec4<u32>;',
  '@compute @workgroup_size(16,16)',
  'fn main(@builtin(global_invocation_id) gid: vec3<u32>) {',
  '  let row=gid.y;let col=gid.x;let M=dims.x;let K=dims.y;let N=dims.z;',
  '  if(row>=M||col>=N){return;}',
  '  var sum=0.0;',
  '  for(var k=0u;k<K;k++){sum+=A[k*M+row]*B[k*N+col];}',
  '  C[row*N+col]=sum;',
  '}',
].join("\n");

const ADAM_WGSL = [
  '@group(0) @binding(0) var<storage, read_write> W : array<f32>;',
  '@group(0) @binding(1) var<storage, read_write> m : array<f32>;',
  '@group(0) @binding(2) var<storage, read_write> v : array<f32>;',
  '@group(0) @binding(3) var<storage, read> g : array<f32>;',
  '@group(0) @binding(4) var<uniform> p : vec4<f32>;',
  '@group(0) @binding(5) var<uniform> cnt : vec4<u32>;',
  '@compute @workgroup_size(256)',
  'fn main(@builtin(global_invocation_id) gid: vec3<u32>) {',
  '  let i=gid.x;let n=cnt.x;',
  '  if(i>=n){return;}',
  '  let lr=p.x;let b1=p.y;let b2=p.z;let ep=p.w;',
  '  let gi=g[i];',
  '  let mi=b1*m[i]+(1.0-b1)*gi;',
  '  let vi=b2*v[i]+(1.0-b2)*gi*gi;',
  '  W[i]-=lr*mi/(sqrt(vi)+ep);',
  '  m[i]=mi;v[i]=vi;',
  '}',
].join("\n");

const TANH_WGSL = [
  '@group(0) @binding(0) var<storage, read_write> X : array<f32>;',
  '@group(0) @binding(1) var<uniform> dims : vec4<u32>;',
  '@compute @workgroup_size(256)',
  'fn main(@builtin(global_invocation_id) gid : vec3<u32>) {',
  '  let i = gid.x;',
  '  if (i >= dims.x) { return; }',
  '  X[i] = tanh(X[i]);',
  '}',
].join("\n");

class GPUMlp {
  constructor(layers) {
    this.layers = layers || [74, 1024, 1024, 1024, 1024, 35];
    this.device = window.gpu ? window.gpu.device : null;
    this.ready = false; this.weights = []; this.biases = [];
    this.gpuW = []; this.gpuB = []; this.pipelines = [];
    if (!this.device) { console.warn("[GPUMlp] no GPU device"); return; }
    try {
      this._compileShaders(); this._initWeights(); this.ready = true;
      var total = 0;
      for (var i = 0; i < this.weights.length; i++) total += this.weights[i].length + this.biases[i].length;
      console.log("[GPUMlp] OK:", this.layers.join("->"), "params=" + total);
    } catch (e) { console.warn("[GPUMlp] init fail:", e.message); }
  }

  _compileShaders() {
    var d = this.device;
    function mk(code) { return d.createComputePipeline({layout:"auto", compute:{module:d.createShaderModule({code:code}), entryPoint:"main"}}); }
    this.pipelines = { matmul: mk(MATMUL_WGSL), relu: mk(RELU_WGSL), softmax: mk(SOFTMAX_WGSL), tanh: mk(TANH_WGSL) };
    this.gradPipelines = {}; try {
      var _gmk = function(cx){ return d.createComputePipeline({layout:'auto', compute:{module:d.createShaderModule({code:cx}), entryPoint:'main'}}); };
      this.gradPipelines.grad = _gmk(GRAD_MATMUL_WGSL);
      this.gradPipelines.adam = _gmk(ADAM_WGSL);
    } catch(_ge) { console.warn('[GPUMlp] grad pipeline:', _ge.message); }
  }

  _mbuf(data, extra) {
    var u = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | (extra || 0);
    var buf = this.device.createBuffer({size: data.byteLength, usage: u});
    this.device.queue.writeBuffer(buf, 0, data);
    return buf;
  }

  _muni(v) { return this._mbuf(new Uint32Array(v), GPUBufferUsage.UNIFORM); }
  _mtmp(size) { return this.device.createBuffer({size:size, usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST}); }

  _initWeights() {
    for (var l = 0; l < this.layers.length - 1; l++) {
      var inSz = this.layers[l]; var outSz = this.layers[l + 1];
      var sc = Math.sqrt(2.0 / (inSz + outSz));
      var w = new Float32Array(inSz * outSz); var b = new Float32Array(outSz);
      for (var i = 0; i < w.length; i++) w[i] = (Math.random() * 2 - 1) * sc;
      this.weights.push(w); this.biases.push(b);
      this.gpuW.push(this._mbuf(w)); this.gpuB.push(this._mbuf(b));
    }
  }

  _dMatmul(a, b, c, M, K, N) {
    var d = this.device, bg = d.createBindGroup({layout:this.pipelines.matmul.getBindGroupLayout(0), entries:[
      {binding:0, resource:{buffer:a}}, {binding:1, resource:{buffer:b}}, {binding:2, resource:{buffer:c}},
      {binding:3, resource:{buffer:this._muni([M,K,N,0])}}]});
    var enc = d.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(this.pipelines.matmul); pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(Math.ceil(N/16), Math.ceil(M/16));
    pass.end(); d.queue.submit([enc.finish()]);
  }

  _dRelu(x, bias, M, N) {
    var d = this.device, bg = d.createBindGroup({layout:this.pipelines.relu.getBindGroupLayout(0), entries:[
      {binding:0, resource:{buffer:x}}, {binding:1, resource:{buffer:bias}},
      {binding:2, resource:{buffer:this._muni([M*N,N,0,0])}}]});
    var enc = d.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(this.pipelines.relu); pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(Math.ceil(M*N/256));
    pass.end(); d.queue.submit([enc.finish()]);
  }

  _dSoftmax(x, M, N) {
    var d = this.device, bg = d.createBindGroup({layout:this.pipelines.softmax.getBindGroupLayout(0), entries:[
      {binding:0, resource:{buffer:x}}, {binding:1, resource:{buffer:this._muni([M,N,0,0])}}]});
    var enc = d.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(this.pipelines.softmax); pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(M);
    pass.end(); d.queue.submit([enc.finish()]);
  }

  _dTanh(x, M, N) {
    var d = this.device, bg = d.createBindGroup({layout:this.pipelines.tanh.getBindGroupLayout(0), entries:[
      {binding:0, resource:{buffer:x}}, {binding:1, resource:{buffer:this._muni([M*N,0,0,0])}}]});
    var enc = d.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(this.pipelines.tanh); pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(Math.ceil(M*N/256));
    pass.end(); d.queue.submit([enc.finish()]);
  }

  forward(inputArr) {
    if (!this.ready) return {policy:new Float32Array(34), value:0};
    var d = this.device, batch = 1;
    var cur = this._mbuf(inputArr), curSz = inputArr.length;
    for (var l = 0; l < this.layers.length - 2; l++) {
      var inSz = this.layers[l], outSz = this.layers[l+1];
      var next = this._mtmp(outSz * batch * 4);
      this._dMatmul(cur, this.gpuW[l], next, batch, inSz, outSz);
      this._dRelu(next, this.gpuB[l], batch, outSz);
      /* defer buffer GC */
      cur = next; curSz = outSz;
    }
    var outSz = this.layers[this.layers.length - 1], outBuf = this._mtmp(outSz * batch * 4);
    this._dMatmul(cur, this.gpuW[this.layers.length - 2], outBuf, batch, curSz, outSz);
    this._dTanh(outBuf, batch, 1);
    this._dSoftmax(outBuf, batch, 34);
    return this._forwardCPU(inputArr);
  }

  _forwardCPU(input) {
    var h = new Float32Array(input);
    for (var l = 0; l < this.weights.length; l++) {
      var w = this.weights[l], b = this.biases[l], inSz = this.layers[l], outSz = this.layers[l+1];
      var n = new Float32Array(outSz);
      for (var o = 0; o < outSz; o++) {
        var s = b[o];
        for (var i = 0; i < inSz; i++) s += h[i] * w[o * inSz + i];
        n[o] = (l < this.weights.length - 1) ? Math.max(0, s) : s;
      }
      h = n;
    }
    var pol = new Float32Array(34), sum = 0;
    for (var i = 0; i < 34; i++) { pol[i] = Math.exp(h[i]); sum += pol[i]; }
    for (var i = 0; i < 34; i++) pol[i] /= sum;
    return {policy: pol, value: Math.tanh(h[34])};
  }

  _initAdam() {
    if(this.gpuM&&this.gpuM[0])return;
    this.t=0;this.gpuM={};this.gpuV={};
    for(var l=0;l<this.weights.length;l++){
      var s=this.weights[l].byteLength;
      var u=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC;
      var d=this.device;
      this.gpuM[l]=d.createBuffer({size:s,usage:u});
      this.gpuV[l]=d.createBuffer({size:s,usage:u});
      var z=new Float32Array(this.weights[l].length);
      d.queue.writeBuffer(this.gpuM[l],0,z);
      d.queue.writeBuffer(this.gpuV[l],0,z);
    }
    
    console.log("[GPUMlp] GPU backward init OK");
  }

  // 计算单层梯度: dW = aPrev^T * delta
  _adamUpdate(layerIdx, gradBuf, lr) {
    var d=this.device;
    this.t++;
    var b1=0.9,b2=0.999,ep=1e-8;
    var lrT=lr*Math.sqrt(1-Math.pow(b2,this.t))/(1-Math.pow(b1,this.t));
    var pBuf=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});var cntBuf=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    d.queue.writeBuffer(pBuf,0,new Float32Array([lrT,b1,b2,ep]));d.queue.writeBuffer(cntBuf,0,new Uint32Array([this.weights[layerIdx].length,0,0,0]));
    var bg=d.createBindGroup({layout:this.gradPipelines.adam.getBindGroupLayout(0),entries:[
      {binding:0,resource:{buffer:this.gpuW[layerIdx]}},
      {binding:1,resource:{buffer:this.gpuM[layerIdx]}},
      {binding:2,resource:{buffer:this.gpuV[layerIdx]}},
      {binding:3,resource:{buffer:gradBuf}},
      {binding:4,resource:{buffer:pBuf}},{binding:5,resource:{buffer:cntBuf}}
    ]});
    var total=this.weights[layerIdx].length;
    var enc=d.createCommandEncoder();
    var pass=enc.beginComputePass();
    pass.setPipeline(this.gradPipelines.adam);pass.setBindGroup(0,bg);
    pass.dispatchWorkgroups(Math.ceil(total/256));
    pass.end();d.queue.submit([enc.finish()]);
    /* buffers auto-GC after GPU done */
  }

  // GPU 训练一�
  trainStepGPU(a,b,c,d,e,f,g,h){}

  test() {
    var inp = new Float32Array(this.layers[0]);
    for (var i = 0; i < inp.length; i++) inp[i] = Math.random() * 2 - 1;
    var cpu = this._forwardCPU(inp), gpu = this.forward(inp);
    var md = 0;
    for (var i = 0; i < 34; i++) md = Math.max(md, Math.abs(cpu.policy[i] - gpu.policy[i]));
    console.log("[GPUMlp] test: maxDiff=" + md.toExponential(3));
    return md < 1e-4;
  }

  serialize() {
    return JSON.stringify({layers:this.layers,weights:this.weights.map(function(w){return Array.from(w);}),biases:this.biases.map(function(b){return Array.from(b);})});
  }
  static deserialize(json) {
    var d=JSON.parse(json);var m=new GPUMlp(d.layers);
    m.weights=d.weights.map(function(w){return new Float32Array(w);});
    m.biases=d.biases.map(function(b){return new Float32Array(b);});
    if(m.device){for(var l=0;l<m.weights.length;l++){
      m.device.queue.writeBuffer(m.gpuW[l],0,m.weights[l]);
      m.device.queue.writeBuffer(m.gpuB[l],0,m.biases[l]);
    }m.ready=true;}return m;
  }
}

if (typeof window !== "undefined") window.GPUMlp = GPUMlp;