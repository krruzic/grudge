// Camera framing shared by every view. All cameras look down at cfg.pitchDeg; a view is described by a focus
// point on the ground and the world width visible across the screen at that point.
import * as THREE from "three";
import type { Terrain } from "../sim/terrain";
import type { RenderConfig } from "./gameRenderer";

/** Places `cam` so `width` metres span the screen at `focus` (looking slightly ahead of it); returns the distance. */
export function placeCam(cfg: RenderConfig, cam: THREE.PerspectiveCamera, focus: THREE.Vector3, width: number): number {
  const pitch = THREE.MathUtils.degToRad(cfg.pitchDeg);
  const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(cfg.fovDeg) / 2) * cam.aspect);
  const dist = width / (2 * Math.tan(hHalf));
  const look = new THREE.Vector3(focus.x, focus.y, focus.z - width * 0.06);
  cam.position.set(look.x, look.y + Math.sin(pitch) * dist, look.z + Math.cos(pitch) * dist);
  cam.lookAt(look);
  cam.updateMatrixWorld(true);
  return dist;
}

/** Nudges `focus` (up to 4 iterations) until every `keep` point projects inside the screen-space safe box. */
function keepInView(
  cfg: RenderConfig,
  cam: THREE.PerspectiveCamera,
  focus: THREE.Vector3,
  width: number,
  keep: THREE.Vector3[],
  tight = false,
): void {
  if (!keep.length) return;
  const pitch = THREE.MathUtils.degToRad(cfg.pitchDeg);
  const depthToWidth = (cam.aspect / Math.sin(pitch)) * 1.25;
  const [X0, X1, Y0, Y1] = tight ? [-0.45, 0.45, -0.3, 0.3] : [-0.8, 0.8, -0.66, 0.5];
  const v = new THREE.Vector3();
  for (let it = 0; it < 4; it++) {
    placeCam(cfg, cam, focus, width);
    let dx = 0;
    let dy = 0;
    for (const p of keep) {
      v.set(p.x, p.y + 1.5, p.z).project(cam);
      if (v.x < X0) dx = Math.min(dx, v.x - X0);
      if (v.x > X1) dx = Math.max(dx, v.x - X1);
      if (v.y < Y0) dy = Math.min(dy, v.y - Y0);
      if (v.y > Y1) dy = Math.max(dy, v.y - Y1);
    }
    if (!dx && !dy) return;
    focus.x += dx * width * 0.55;
    focus.z -= dy * (width / depthToWidth) * 0.6;
  }
}

/**
 * Frames `points`: the width covers their bounding box plus `margin` (clamped to [minWidth, maxWidth] and to the
 * map), the focus is clamped so the view doesn't drift far off the map edges, `keep` points are kept on screen,
 * and the camera eases toward the result (`st` holds the smoothed state). `center` (single-hero split views)
 * centres on the kept points with a tighter safe box instead of clamping to the map. Also sets the view's fog range.
 */
export function aimCamera(
  cfg: RenderConfig,
  t: Terrain,
  cam: THREE.PerspectiveCamera,
  st: { focus: THREE.Vector3; width: number; init: boolean },
  points: THREE.Vector3[],
  dt: number,
  minWidth: number,
  maxWidth = Infinity,
  margin = cfg.viewMargin,
  keep: THREE.Vector3[] = points,
  center = false,
): void {
  const pitch = THREE.MathUtils.degToRad(cfg.pitchDeg);
  const aspect = cam.aspect;

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of points) {
    min.min(p);
    max.max(p);
  }
  if (points.length === 0) {
    min.set(t.width / 2, 0, t.depth / 2);
    max.copy(min);
  }
  const focus = min.clone().add(max).multiplyScalar(0.5);

  const depthToWidth = (aspect / Math.sin(pitch)) * 1.25;
  const need = Math.max(max.x - min.x, (max.z - min.z) * depthToWidth) + margin;
  const fullMap = Math.max(t.width, t.depth * depthToWidth) * 1.3 + 12;
  const lo = Math.min(minWidth, fullMap);
  const cap = center ? Math.max(t.width, t.depth * depthToWidth) * 0.9 : fullMap;
  const width = THREE.MathUtils.clamp(need, Math.min(lo, cap), Math.max(Math.min(lo, cap), Math.min(maxWidth, cap)));

  if (center && keep.length) {
    const c = new THREE.Vector3();
    for (const p of keep) c.add(p);
    c.multiplyScalar(1 / keep.length);
    focus.lerp(c, 0.85);
    keepInView(cfg, cam, focus, width, keep, true);
    const k = st.init ? 1 - Math.exp(-dt * 6) : 1;
    st.init = true;
    st.focus.lerp(focus, k);
    st.width += (width - st.width) * k;
    const dist = placeCam(cfg, cam, st.focus, st.width);
    cam.userData.fogNear = dist * cfg.fogNearFactor;
    cam.userData.fogFar = dist * cfg.fogFarFactor;
    return;
  }

  const slack = 6 + width * 0.15;
  if (width < t.width + slack * 2)
    focus.x = THREE.MathUtils.clamp(focus.x, width / 2 - slack, t.width - width / 2 + slack);
  else focus.x = t.width / 2;
  const viewDepth = width / depthToWidth;
  const zs = 4 + viewDepth * 0.15;
  if (viewDepth < t.depth + zs * 2)
    focus.z = THREE.MathUtils.clamp(focus.z, viewDepth / 2 - zs, t.depth - viewDepth / 2 + zs);
  else focus.z = t.depth / 2;

  keepInView(cfg, cam, focus, width, keep);

  const k = st.init ? 1 - Math.exp(-dt * 4) : 1;
  st.init = true;
  st.focus.lerp(focus, k);
  st.width += (width - st.width) * k;

  const dist = placeCam(cfg, cam, st.focus, st.width);
  cam.userData.fogNear = dist * cfg.fogNearFactor;
  cam.userData.fogFar = dist * cfg.fogFarFactor;
}
