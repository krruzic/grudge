// Builds the View for a new entity: the model (hero/soldier/structure, or a placeholder when no model is
// loaded), health and work bars, silhouette proxies, and registration with the batches EntityViews draws from.
import * as THREE from "three";
import { clipBelowWater } from "./wading";
import type { View } from "./view";
import { markSilhouette, silMat } from "./silhouettes";
import type { EntityViews } from "./entityViews";
import { WHITE } from "./view";
import { Bar, makeBar } from "./bars";
import { ballistaMesh } from "./ballista";
import { unitPlaceholder, structurePlaceholder } from "../models/placeholders";
import { blobShadow } from "../models/markers";
import { caskMesh } from "../heroProps/friar";
import { teslaCoil } from "../hazards/tesla";
import { costumeOfPlayer, playerLabel } from "../costumes";
import type { Entity } from "../../sim/types";

/** What each kind contributes to a View. */
interface Parts {
  body: THREE.Object3D;
  bar: Bar;
  mixer?: THREE.AnimationMixer;
  actions?: Map<string, THREE.AnimationAction>;
}

export function createView(ents: EntityViews, e: Entity): View {
  const team = ents.teamColors[e.team];
  const root = new THREE.Group();
  const view: Partial<View> = {};
  const parts = e.hero
    ? heroParts(ents, e, team, root, view)
    : e.unit
      ? unitParts(ents, e, team, root, view)
      : structureParts(ents, e, team, root, view);
  const { body, bar, mixer } = parts;
  const actions = parts.actions ?? new Map<string, THREE.AnimationAction>();
  root.add(bar.group);
  ents.root.add(root);
  const mats: THREE.MeshLambertMaterial[] = [];
  body.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.outline) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m instanceof THREE.MeshLambertMaterial && !mats.includes(m)) {
        m.userData.baseEmissive ??= m.emissive.clone();
        mats.push(m);
      }
    }
  });
  const v: View = {
    kind: e.kind,
    root,
    body,
    mixer,
    actions,
    bar,
    seen: true,
    weapon: view.weapon,
    held: view.held,
    pipNodes: view.pipNodes,
    spin: view.spin,
    level2: view.level2,
    level3: view.level3,
    shield: view.shield,
    blockFx: view.blockFx,
    work: view.work,
    mats,
    flash: 0,
    joltX: 0,
    joltZ: 0,
    freeze: 0,
    stepDist: 0,
  };
  // Blob shadows and foot rings are drawn by instanced batches; the originals stay as hidden transform anchors.
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.footRing && !o.userData.batchHidden) {
      o.visible = false;
      o.userData.batchHidden = true;
      (v.rings ??= []).push(o);
      return;
    }
    if (!(o instanceof THREE.Mesh) || !o.userData.blob) return;
    o.layers.set(31);
    o.visible = false;
    o.userData.batchHidden = true;
    (v.blobs ??= []).push(o);
  });
  // Structures are drawn by the structure/static batches; hide the tree once every mesh is batched.
  if (e.structure) {
    const flash = () => v.flash > 0;
    const done = [
      ...ents.structBatch.add(body, e.team, flash),
      ...ents.statics.addTree(
        body,
        `${e.team}`,
        flash,
        (m) => !m.userData.structKind && !(m.material as THREE.Material).transparent,
      ),
    ];
    const used = new Set(done.map((m) => m.material));
    v.mats = v.mats.filter((m) => !used.has(m));
    let meshes = 0;
    body.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) meshes++;
    });
    if (meshes === done.length) {
      body.visible = false;
      body.userData.batchHidden = true;
    }
  }
  // Single merged skinned soldiers go to the instanced UnitBatches (with their silhouette).
  if (view.batched) {
    const sm = view.batched;
    const tm = e.team;
    ents.batches.add(
      sm,
      v.body,
      `${sm.geometry.uuid}|${tm}`,
      () => ({ material: batchMaterial(sm, tm), sil: clipBelowWater(silMat(tm, true).clone()) }),
      () => v.flash > 0,
    );
  }
  if (e.unit) ents.fx.spawnFx(e.transform.pos.x, e.transform.y, e.transform.pos.z, e.team);
  return v;
}

/**
 * Hero model under the player's costume; the player tag sprite is lifted out of the scaled model so it keeps
 * its size, and carried props (Stig's wrench, Pip, kegs) are collected so sync can hide them while thrown.
 */
function heroParts(ents: EntityViews, e: Entity, team: THREE.Color, root: THREE.Group, view: Partial<View>): Parts {
  const hero = e.hero!;
  const player = hero.player;
  const pc = ents.world.ffa ? team : (ents.playerColors[player] ?? team);
  const twin = ents.world.players.some((q) => q.team === e.team && q.player < player && q.heroType === hero.type);
  const inst = ents.heroes.create(
    hero.type,
    team,
    playerLabel(player),
    pc,
    twin ? team.clone().lerp(pc, 0.7) : undefined,
    costumeOfPlayer(player),
  );
  inst.root.scale.setScalar(ents.heroScale);
  root.add(inst.root);
  const body = inst.body;
  const bar = makeBar(1.3, team, 0.1);
  bar.group.position.z = 0.95 * ents.heroScale;
  const tag = inst.root.children.find((o) => o instanceof THREE.Sprite);
  if (tag) {
    inst.root.remove(tag);
    tag.position.set(0, 0.1, 1.33 * ents.heroScale);
    tag.scale.multiplyScalar(ents.heroScale * 0.85);
    root.add(tag);
  }
  markSilhouette(body, e.team);
  const held: THREE.Object3D[] = [];
  const pipNodes: THREE.Object3D[] = [];
  body.traverse((o) => {
    if (o.name.startsWith(`${hero.type}_wrench`)) held.push(o);
    if (o.name.startsWith(`${hero.type}_pip`) || o.name.startsWith(`${hero.type}_keg`)) pipNodes.push(o);
  });
  if (held.length) view.held = held;
  if (pipNodes.length) view.pipNodes = pipNodes;
  // Hexagonal guard ring in front of the hero, shown while blocking.
  const bf = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.75, 6),
    new THREE.MeshBasicMaterial({
      color: team.clone().lerp(WHITE, 0.6),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  bf.position.set(0, 1.0, 0.75);
  bf.visible = false;
  body.add(bf);
  view.blockFx = bf;
  return { body, bar, mixer: inst.mixer, actions: inst.actions };
}

/** Soldier (or the neutral ogre): rigged model when loaded, else a placeholder. */
function unitParts(ents: EntityViews, e: Entity, team: THREE.Color, root: THREE.Group, view: Partial<View>): Parts {
  const unit = e.unit!;
  let body: THREE.Object3D;
  let mixer: THREE.AnimationMixer | undefined;
  let actions: Map<string, THREE.AnimationAction> | undefined;
  const inst = ents.units.create(e.neutral ? "ogre" : unit.type, team, e.team);
  let g: THREE.Object3D;
  if (inst) {
    g = new THREE.Group();
    g.add(inst.body);
    body = inst.body;
    mixer = inst.mixer;
    actions = inst.actions;
  } else {
    g = unitPlaceholder(unit.type, team);
    body = g.getObjectByName("body")!;
    view.weapon = g.getObjectByName("weapon");
  }
  root.add(g, blobShadow(e.radius * 1.2));
  g.scale.setScalar((inst ? 1.3 : unit.type === "heavy" ? 1.45 : 1.4) * (e.neutral ? 1.55 : 1));
  const skin = inst ? batchable(inst.body) : null;
  if (skin) view.batched = skin;
  else markSilhouette(g, e.team);
  const bar = e.neutral
    ? makeBar(2, team, 4.4)
    : makeBar(unit.type === "heavy" ? 1.1 : 0.8, team, unit.type === "heavy" ? 2.3 : 1.7);
  bar.group.visible = !!e.neutral;
  return { body, bar, mixer, actions };
}

/** Body mesh for a non-core structure: works site (empty), hero-built specials, the model, or a placeholder. */
function structureBody(
  ents: EntityViews,
  st: NonNullable<Entity["structure"]>,
  team: THREE.Color,
  ownerCostume: string,
): THREE.Object3D {
  if (st.works !== undefined) return new THREE.Group();
  if (st.cask) return caskMesh(team, ownerCostume);
  if (st.tesla) return teslaCoil(1.1, ownerCostume);
  if (st.siege) return ballistaMesh(team, ownerCostume);
  if (ents.structures.has(st.type)) return ents.structures.create(st.type, team);
  return structurePlaceholder(st.type, team);
}

/**
 * Core (with its shield bubble and spinning crystal) or a built structure: works sites, Maddock's cask, Stig's
 * tesla coil and ballista use their own meshes in the owner's costume. Named nodes "spin*", "level2*" and
 * "level3_<spec>" are the parts sync animates or reveals on upgrade.
 */
function structureParts(
  ents: EntityViews,
  e: Entity,
  team: THREE.Color,
  root: THREE.Group,
  view: Partial<View>,
): Parts {
  let body: THREE.Object3D;
  let bar: Bar;
  const st = e.structure!;
  if (st.type === "core") {
    body = ents.structures.create("core", team);
    const sh = new THREE.Mesh(
      new THREE.SphereGeometry(3.0, 16, 10),
      new THREE.MeshBasicMaterial({
        color: team.clone().lerp(WHITE, 0.4),
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    sh.position.y = 1.4;
    root.add(sh);
    view.shield = sh;
    view.spin = body.getObjectByName("crystal") ?? undefined;
    bar = makeBar(2.6, team, 0, 0.75);
    view.work = makeBar(2.6, new THREE.Color(0x9fe0ff), 0, 1.05);
    root.add(view.work.group);
  } else {
    const oc = costumeOfPlayer(ents.world.getAny(e.owner ?? -1)?.hero?.player);
    body = structureBody(ents, st, team, oc);
    body.traverse((o) => {
      if (!view.spin && o.name.startsWith("spin")) view.spin = o;
      if (!view.level2 && o.name.startsWith("level2")) view.level2 = o;
      if (o.name.startsWith("level3_") && o.parent && !o.parent.name.startsWith("level3_"))
        (view.level3 ??= new Map()).set(o.name.slice(7).replace(/[._]\d+$/, ""), o);
    });
    body.rotation.y = e.transform.facing;
    bar =
      st.works !== undefined
        ? makeBar(2.2, team, 3.6)
        : st.cask
          ? makeBar(1.5, team, 3.2)
          : st.siege
            ? makeBar(1.2, team, 2.4)
            : makeBar(1.9, team, 0, 0.5);
    if (!st.siege && st.works === undefined) {
      view.work = makeBar(1.9, new THREE.Color(0xffd040), 0, 0.8);
      root.add(view.work.group);
    }
    if (st.works === undefined) ents.fx.buildFx(e.transform.pos.x, e.transform.y, e.transform.pos.z, e.team);
  }
  root.add(body);
  return { body, bar };
}

function batchable(body: THREE.Object3D): THREE.SkinnedMesh | null {
  const meshes: THREE.Mesh[] = [];
  body.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  const m = meshes[0];
  if (
    meshes.length !== 1 ||
    !(m instanceof THREE.SkinnedMesh) ||
    Array.isArray(m.material) ||
    m.material.name !== "merged"
  )
    return null;
  return m;
}
function batchMaterial(src: THREE.SkinnedMesh, team: number): THREE.Material {
  const base = src.material as THREE.MeshLambertMaterial;
  const m = base.clone();
  m.onBeforeCompile = base.onBeforeCompile;
  m.customProgramCacheKey = base.customProgramCacheKey;
  m.stencilWrite = true;
  m.stencilRef = 1;
  m.stencilFunc = THREE.AlwaysStencilFunc;
  m.stencilZPass = THREE.ReplaceStencilOp;
  m.userData.team = team;
  return m;
}
