import * as THREE from "three";
import type { Terrain } from "../sim/terrain";
import { propParts } from "./props";

export function chasmIce(t: Terrain): THREE.Group | null {
  const below = t.chasm;
  if (below === undefined) return null;
  const shard = propParts("iceshard");
  const chunk = propParts("icechunk");
  const shardLo = propParts("iceshard_lo") ?? shard;
  const chunkLo = propParts("icechunk_lo") ?? chunk;
  if (!shard || !chunk || !shardLo || !chunkLo) return null;
  const W = t.width;
  const D = t.depth;
  const buckets = new Map<string, THREE.Matrix4[]>();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let cz = 0; cz < D; cz++) {
    for (let cx = 0; cx < W; cx++) {
      const x = cx + 0.5;
      const z = cz + 0.5;
      const g = t.groundHeight(x, z);
      if (!(g < below)) continue;
      const pit = !Number.isFinite(t.heightAt(x, z));
      if (pit && t.styles[t.index(cx, cz)] !== "rim") continue;
      let h = (cx * 73856093) ^ (cz * 19349663);
      const rnd = () => (h = (h * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const r = rnd();
      const kind = pit ? (r < 0.1 ? "S" : r < 0.18 ? "C" : "") : r < 0.2 ? "s" : r < 0.36 ? "c" : "";
      if (!kind) continue;
      const grow = pit ? 1.35 : 1;
      const big = (kind.toLowerCase() === "s" ? 0.75 + rnd() * 0.8 : 0.8 + rnd() * 0.9) * grow;
      const spike = kind.toLowerCase() === "s";
      e.set((rnd() - 0.5) * (spike ? 0.35 : 0.6), rnd() * Math.PI * 2, (rnd() - 0.5) * (spike ? 0.35 : 0.6));
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(x + (rnd() - 0.5) * 0.6, g - 0.25, z + (rnd() - 0.5) * 0.6),
        q,
        new THREE.Vector3(big, big * (spike ? 0.8 + rnd() * 0.5 : 1), big),
      );
      const key = `${kind}${cx < W / 2 ? 0 : 1}${cz < D / 2 ? 0 : 1}`;
      const list = buckets.get(key) ?? [];
      list.push(m.clone());
      buckets.set(key, list);
    }
  }
  const g = new THREE.Group();
  for (const [key, list] of buckets) {
    const part = { s: shard, c: chunk, S: shardLo, C: chunkLo }[key[0]]!;
    const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.computeBoundingSphere();
    im.castShadow = false;
    im.receiveShadow = true;
    g.add(im);
  }
  return g;
}
