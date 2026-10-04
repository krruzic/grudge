// Dune serpent (Emberdune Spires): a giant serpent that swims under the sand of the dune sea (an annulus around
// the map centre). It is not an entity - nothing can hit it - it is a moving hazard:
//   loop    circles the ring at `speed`; anything within churnRadius of it is slowed (churning sand)
//   breach  every everySeconds it stops, warns for warnSeconds (rumble ring), then bursts out: champions in
//           breachRadius take damage, are knocked back and stunned; soldiers are swallowed whole
//   hunt    while someone carries the Grudge inside the dune sea, the serpent leaves its loop and chases the
//           carrier at huntSpeed (a little slower than a champion); when it gets within 2 m it breaches under them
//           after a short huntWarn, at most every huntCooldown seconds
// Everything is driven from World time and positions (no RNG), so it stays in lockstep.
import type { MapEvents } from "../mapEvents.ts";
import type { Entity } from "../types.ts";

export interface SerpentDef {
  radius: number;
  inner: number;
  outer: number;
  speed: number;
  huntSpeed: number;
  firstSeconds: number;
  everySeconds: number;
  warnSeconds: number;
  huntWarn: number;
  huntCooldown: number;
  breachRadius: number;
  damage: number;
  knockback: number;
  stun: number;
  churnRadius: number;
  churnSlow: number;
}

export interface Serpent {
  x: number;
  z: number;
  /** Heading in radians (for the renderer's mound and fins). */
  dir: number;
  mode: "loop" | "hunt" | "warn";
  /** When the current warning ends in a breach (mode "warn"). */
  breachAt: number;
  /** Next scheduled loop breach. */
  nextBreach: number;
  /** Earliest next hunt breach. */
  huntReady: number;
  /** Id of the hunted carrier, 0 when looping. */
  prey: number;
}

export function makeSerpent(ev: MapEvents, d: SerpentDef): Serpent {
  const t = ev.w.terrain;
  const cx = t.width / 2;
  const cz = t.depth / 2;
  return {
    x: cx + d.radius,
    z: cz,
    dir: Math.PI / 2,
    mode: "loop",
    breachAt: 0,
    nextBreach: d.firstSeconds,
    huntReady: 0,
    prey: 0,
  };
}

/** The Grudge carrier if they are inside the dune sea (else null). */
function preyIn(ev: MapEvents, d: SerpentDef): Entity | null {
  const w = ev.w;
  const r = w.arena.relic;
  if (r.state !== "carried") return null;
  const c = w.get(r.carrier);
  if (!c?.alive || c.hero?.dead) return null;
  const t = w.terrain;
  const dist = Math.hypot(c.transform.pos.x - t.width / 2, c.transform.pos.z - t.depth / 2);
  return dist >= d.inner - 2 && dist <= d.outer + 1.5 ? c : null;
}

export function updateSerpent(ev: MapEvents, d: SerpentDef): void {
  const w = ev.w;
  const s = ev.serpent!;
  const dt = w.dt;
  const t = w.terrain;
  const cx = t.width / 2;
  const cz = t.depth / 2;

  if (s.mode === "warn") {
    if (w.time >= s.breachAt) breach(ev, d, s);
    return;
  }

  const prey = preyIn(ev, d);
  s.prey = prey ? prey.id : 0;
  if (prey) {
    s.mode = "hunt";
    const px = prey.transform.pos.x;
    const pz = prey.transform.pos.z;
    const dx = px - s.x;
    const dz = pz - s.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= 2 && w.time >= s.huntReady) {
      startWarn(ev, d, s, d.huntWarn);
      return;
    }
    if (dist > 1e-3) {
      const step = Math.min(dist, d.huntSpeed * dt);
      s.x += (dx / dist) * step;
      s.z += (dz / dist) * step;
      s.dir = Math.atan2(dx, dz);
    }
  } else {
    s.mode = "loop";
    // Swim back onto the ring, then around it (clockwise in map coordinates).
    const rx = s.x - cx;
    const rz = s.z - cz;
    const rr = Math.hypot(rx, rz) || 1;
    const tx = -rz / rr;
    const tz = rx / rr;
    const pull = (d.radius - rr) * 0.8;
    let vx = tx * d.speed + (rx / rr) * pull;
    let vz = tz * d.speed + (rz / rr) * pull;
    const v = Math.hypot(vx, vz) || 1;
    vx = (vx / v) * d.speed;
    vz = (vz / v) * d.speed;
    s.x += vx * dt;
    s.z += vz * dt;
    s.dir = Math.atan2(vx, vz);
    if (w.time >= s.nextBreach) {
      startWarn(ev, d, s, d.warnSeconds);
      return;
    }
  }
  // Stay inside the dune sea.
  const rx = s.x - cx;
  const rz = s.z - cz;
  const rr = Math.hypot(rx, rz) || 1;
  const clamped = Math.min(d.outer, Math.max(d.inner, rr));
  s.x = cx + (rx / rr) * clamped;
  s.z = cz + (rz / rr) * clamped;
  churn(ev, d, s);
}

/** Sand churning over the swimming serpent slows everything near it. */
function churn(ev: MapEvents, d: SerpentDef, s: Serpent): void {
  const w = ev.w;
  for (const e of w.entities) {
    if (!e.alive || e.structure || e.neutral) continue;
    if (Math.hypot(e.transform.pos.x - s.x, e.transform.pos.z - s.z) > d.churnRadius) continue;
    const st = e.status;
    st.slowMul = Math.min(st.slowUntil > w.time ? st.slowMul : 1, d.churnSlow);
    st.slowUntil = Math.max(st.slowUntil, w.time + 0.25);
  }
}

function startWarn(ev: MapEvents, d: SerpentDef, s: Serpent, secs: number): void {
  const w = ev.w;
  s.mode = "warn";
  s.breachAt = w.time + secs;
  w.emit({ type: "serpent", stage: "warn", x: s.x, y: w.groundY(s.x, s.z), z: s.z, seconds: secs });
}

function breach(ev: MapEvents, d: SerpentDef, s: Serpent): void {
  const w = ev.w;
  w.emit({ type: "serpent", stage: "breach", x: s.x, y: w.groundY(s.x, s.z), z: s.z, seconds: 1.4 });
  for (const e of w.entities.slice()) {
    if (!e.alive || e.structure || e.neutral || e.hero?.dead) continue;
    const dist = Math.hypot(e.transform.pos.x - s.x, e.transform.pos.z - s.z) - e.radius * 0.5;
    if (dist > d.breachRadius) continue;
    if (e.unit) {
      w.kill(e, null);
      continue;
    }
    w.damage(null, e, d.damage, {
      fromX: s.x,
      fromZ: s.z,
      knockback: d.knockback,
      stun: d.stun,
      big: true,
    });
  }
  s.mode = "loop";
  s.nextBreach = w.time + d.everySeconds;
  s.huntReady = w.time + d.huntCooldown;
}
