// ============================================================
// �����齫 GPU �����Ĺ�����
// WebGPU ����ģ��ĺ��Ļ�����ʩ
// ============================================================
"use strict";

class GPUContext {
  constructor() {
    this.device = null;
    this.adapter = null;
    this.available = false;
  }

  // ��ʼ??WebGPU
  async init() {
    if (!navigator.gpu) {
      console.warn("[GPU] WebGPU 不可用，使用 CPU fallback");
      return false;
    }
    try {
      this.adapter = await navigator.gpu.requestAdapter({
        powerPreference: "high-performance"
      });
      if (!this.adapter) {
        console.warn("[GPU] 获取 WebGPU adapter");
        return false;
      }
      this.device = await this.adapter.requestDevice();
      this.available = true;
      console.log("[GPU] WebGPU 初始化成功",
        this.adapter.name || "unknown GPU");
      return true;
    } catch (e) {
      console.warn("[GPU] WebGPU 初始化失败", e.message);
      return false;
    }
  }

  // ���� storage buffer
  createBuffer(data, usage, label) {
    const u = GPUBufferUsage.COPY_SRC |
              GPUBufferUsage.COPY_DST |
              (usage || GPUBufferUsage.STORAGE);
    const buf = this.device.createBuffer({
      size: data.byteLength,
      usage: u,
      label: label || ""
    });
    this.device.queue.writeBuffer(buf, 0, data);
    return buf;
  }

  // ���� uniform buffer
  createUniform(data, label) {
    return this.createBuffer(data, GPUBufferUsage.UNIFORM, label);
  }

  // ����ֻ�� storage buffer
  createReadOnly(data, label) {
    return this.createBuffer(data, GPUBufferUsage.STORAGE, label);
  }

  // ������д storage buffer������功?
  createRW(size, label) {
    const buf = this.device.createBuffer({
      size: size,
      usage: GPUBufferUsage.STORAGE |
             GPUBufferUsage.COPY_SRC |
             GPUBufferUsage.COPY_DST,
      label: label || ""
    });
    return buf;
  }

  // ���� compute shader
  createPipeline(wgsl, entry) {
    const module = this.device.createShaderModule({
      code: wgsl,
      label: entry || "pipeline"
    });
    return this.device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: entry || "main" }
    });
  }

  // ִ�� dispatch
  dispatch(pipeline, bindGroup, workgroupX, workgroupY, workgroupZ) {
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass({ label: "dispatch" });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      workgroupX || 1,
      workgroupY || 1,
      workgroupZ || 1
    );
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  // �첽��ȡ GPU buffer ??CPU
  async readBuffer(buffer, size) {
    const temp = this.device.createBuffer({
      size: size,
      usage: GPUBufferUsage.MAP_READ |
             GPUBufferUsage.COPY_DST
    });
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(buffer, 0, temp, 0, size);
    this.device.queue.submit([encoder.finish()]);
    await temp.mapAsync(GPUMapMode.READ);
    const data = temp.getMappedRange().slice();
    temp.unmap();
    temp.destroy();
    return data;
  }

  // dump GPU info
  getInfo() {
    if (!this.available) return "WebGPU 不可用";
    return {
      adapter: this.adapter ? this.adapter.name : "N/A",
      backend: "WebGPU",
      buffers: {
        maxBufferSize: 268435456  // 256 MB ����
      }
    };
  }

  destroy() {
    if (this.device) { this.device.destroy(); }
    this.device = null;
    this.adapter = null;
    this.available = false;
  }
}

// ȫ�ֵ���
window.gpu = null;

// ���ظ�ִ�б�����page.tsx ����ִ�нű�ʱ����ʼ��һ�Σ�
if (!window.__gpuInit) {
  window.__gpuInit = true;

// �Զ���ʼ??
(async function() {
  const ctx = new GPUContext();
  await ctx.init();
  window.gpu = ctx;
  console.log("[GPU] 状态", ctx.available ? "可用" : "不可用");
})();}
