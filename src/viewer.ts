import * as THREE from "three";
import { HeroModels, outlineConfig } from "./render/heroModels";
import { UnitModels } from "./render/unitModels";

const heroUrls = import.meta.glob("../assets/heroes/*.glb", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const unitUrls = import.meta.glob("../assets/units/*.glb", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const base = (p: string) => p.split("/").pop()!.replace(".glb", "");

const params = new URLSearchParams(location.search);
outlineConfig.enabled = params.has("outline");
const clipName = params.get("clip") ?? "idle";
const clipTime = params.get("t");
const yaw = Number(params.get("yaw") ?? 20) * (Math.PI / 180);
const only = params.get("only")?.split(",");
const set = params.get("set") ?? "heroes";

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6a8aa8);
scene.add(new THREE.HemisphereLight(0xb8d4ff, 0x6a5a3a, 1.35));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
sun.position.set(-0.75, 0.85, 0.3).multiplyScalar(10);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), new THREE.MeshLambertMaterial({ color: 0x4f7a34 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const team = new THREE.Color(params.get("team") === "red" ? "#ff2a2a" : "#2a5cff");
const mixers: { mixer: THREE.AnimationMixer; action?: THREE.AnimationAction }[] = [];
const info = document.getElementById("info")!;

async function main(): Promise<void> {
  const names: string[] = [];
  const roots: THREE.Object3D[] = [];
  if (set === "heroes") {
    const hm = new HeroModels();
    const urls = Object.fromEntries(Object.entries(heroUrls).map(([p, u]) => [base(p), u]));
    await hm.load(urls);
    for (const n of only ?? Object.keys(urls).sort()) {
      const inst = hm.create(n, team, n.toUpperCase());
      inst.root.children.slice(2).forEach((c) => (c.visible = false));
      inst.root.scale.setScalar(1.5);
      names.push(n);
      roots.push(inst.root);
      if (inst.mixer) {
        const action = inst.actions.get(clipName);
        action?.play();
        mixers.push({ mixer: inst.mixer, action });
      }
    }
  } else {
    const um = new UnitModels();
    const urls = Object.fromEntries(Object.entries(unitUrls).map(([p, u]) => [base(p), u]));
    await um.load(urls);
    for (const n of only ?? Object.keys(urls).sort()) {
      const inst = um.create(n, team, 0);
      if (!inst) continue;
      inst.body.scale.setScalar(1.4);
      names.push(n);
      roots.push(inst.body);
      if (inst.mixer) {
        const action = inst.actions.get(clipName);
        action?.play();
        mixers.push({ mixer: inst.mixer, action });
      }
    }
  }
  const gap = 3.2;
  roots.forEach((r, i) => {
    r.position.x = (i - (roots.length - 1) / 2) * gap;
    r.rotation.y = yaw;
    scene.add(r);
  });
  const width = Math.max(roots.length * gap, 6);
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 200);
  const t = Math.tan(THREE.MathUtils.degToRad(30) / 2);
  const dist = Math.max(width / 2 / t / (innerWidth / innerHeight), 5.2 / 2 / t) * 1.05;
  cam.position.set(0, 2.2 + dist * 0.25, dist);
  cam.lookAt(0, 1.6, 0);
  info.textContent = `${names.join("  ")}  clip=${clipName}`;
  const clock = new THREE.Clock();
  if (clipTime !== null) for (const m of mixers) m.mixer.setTime(Number(clipTime));
  renderer.setAnimationLoop(() => {
    const dt = clipTime !== null ? 0 : clock.getDelta();
    for (const m of mixers) m.mixer.update(dt);
    renderer.render(scene, cam);
  });
}

main();
