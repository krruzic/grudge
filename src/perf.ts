import type * as THREE from "three";

type Timer = { ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }; gl: WebGL2RenderingContext; free: WebGLQuery[]; pending: { q: WebGLQuery; key: string; frame: number }[] };

const on = typeof location !== "undefined" && new URLSearchParams(location.search).has("perf");

const cpu = new Map<string, number>();
const gpu = new Map<string, number>();
const stat = new Map<string, number>();
const sums = new Map<string, number>();
let frames = 0;
let snapshot: Record<string, number> = {};
let el: HTMLPreElement | null = null;
let timer: Timer | null = null;
let active: WebGLQuery | null = null;
let frameNo = 0;
let lastShow = 0;
let frameMax = 0;

function add(m: Map<string, number>, k: string, v: number): void {
  m.set(k, (m.get(k) ?? 0) + v);
}

export const perf = {
  on,
  now(): number {
    return on ? performance.now() : 0;
  },
  cpu(key: string, t0: number): number {
    if (!on) return 0;
    const t = performance.now();
    add(cpu, key, t - t0);
    return t;
  },
  stat(key: string, v: number): void {
    if (on) add(stat, key, v);
  },
  init(renderer: THREE.WebGLRenderer): void {
    if (!on) return;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    if (ext) timer = { ext, gl, free: [], pending: [] };
    renderer.info.autoReset = false;
    el = document.createElement("pre");
    el.style.cssText = "position:fixed;left:4px;top:4px;z-index:99;margin:0;padding:4px 6px;background:rgba(0,0,0,.7);color:#cfe;font:11px monospace;pointer-events:none;white-space:pre";
    document.body.appendChild(el);
  },
  gpuBegin(key: string): void {
    if (!timer || active) return;
    const q = timer.free.pop() ?? timer.gl.createQuery()!;
    timer.gl.beginQuery(timer.ext.TIME_ELAPSED_EXT, q);
    active = q;
    timer.pending.push({ q, key, frame: frameNo });
  },
  gpuEnd(): void {
    if (!timer || !active) return;
    timer.gl.endQuery(timer.ext.TIME_ELAPSED_EXT);
    active = null;
  },
  frame(renderer: THREE.WebGLRenderer | null): void {
    if (!on) return;
    frameNo++;
    if (timer) {
      const gl = timer.gl;
      const disjoint = gl.getParameter(timer.ext.GPU_DISJOINT_EXT);
      const keep: Timer["pending"] = [];
      for (const p of timer.pending) {
        if (p.frame === frameNo - 1 || !gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) {
          keep.push(p);
          continue;
        }
        if (!disjoint) add(gpu, p.key, gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6);
        timer.free.push(p.q);
      }
      timer.pending = keep;
    }
    frameMax = Math.max(frameMax, cpu.get("frame") ?? 0);
    for (const [k, v] of cpu) add(sums, "cpu." + k, v);
    for (const [k, v] of stat) add(sums, k, v);
    cpu.clear();
    stat.clear();
    if (renderer) renderer.info.reset();
    frames++;
    const t = performance.now();
    if (t - lastShow < 1000) return;
    for (const [k, v] of gpu) add(sums, "gpu." + k, v);
    gpu.clear();
    const out: Record<string, number> = { frames, ms: (t - lastShow) / frames };
    for (const [k, v] of sums) out[k] = v / frames;
    if (renderer) {
      out.programs = renderer.info.programs?.length ?? 0;
      out.textures = renderer.info.memory.textures;
      out.geometries = renderer.info.memory.geometries;
    }
    out["cpu.frameMax"] = frameMax;
    frameMax = 0;
    snapshot = out;
    sums.clear();
    frames = 0;
    lastShow = t;
    (window as unknown as { grudgePerf: unknown }).grudgePerf = snapshot;
    if (el) el.textContent = Object.entries(snapshot).map(([k, v]) => `${k.padEnd(18)} ${v.toFixed(2)}`).join("\n");
  },
};
