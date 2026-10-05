// Sound recipes for sim events. Each event has already been placed in 3D by Audio.handle (the chain the voices
// play into); a recipe layers samples (ids from tools/sfx/manifest.py) and the odd synth tone. Who did it
// matters: hits sound like the attacker's weapon on the victim's body, champions shout their own voice lines,
// and abilities get their hero's signature layers.
import type { SimEvent, Entity } from "../sim/types";
import type { World } from "../sim/world";
import type { Audio } from "./sfx";

/** What a champion's basic attacks sound like: swing whoosh and impact. */
const WEAPON: Record<string, { swing: string; hit: string; rate?: number }> = {
  warlord: { swing: "swing.heavy", hit: "hit.heavy" },
  engineer: { swing: "swing.heavy", hit: "hit.blunt", rate: 1.15 },
  raider: { swing: "swing.blade", hit: "hit.blade" },
  duelist: { swing: "swing.blade", hit: "hit.blade", rate: 1.1 },
  warden: { swing: "swing.heavy", hit: "hit.blunt", rate: 0.8 },
  friar: { swing: "swing.light", hit: "hit.heavy" },
  vintner: { swing: "swing.heavy", hit: "hit.heavy", rate: 0.75 },
  herald: { swing: "swing.light", hit: "hit.flesh" },
  summoner: { swing: "swing.light", hit: "magic.bolt" },
  marksman: { swing: "swing.light", hit: "arrow.hit" },
  harpooner: { swing: "swing.light", hit: "arrow.hit", rate: 0.85 },
  scribe: { swing: "swing.light", hit: "splash", rate: 1.6 },
  wreckwitch: { swing: "swing.heavy", hit: "kelp.anchor", rate: 0.85 },
  architect: { swing: "swing.light", hit: "hit.wood", rate: 1.1 },
};
const ARMORED = new Set(["warlord", "herald", "engineer", "vintner"]);

const ent = (w: World, id: number | undefined): Entity | undefined => (id === undefined ? undefined : w.getAny(id));
const heroType = (w: World, id: number | undefined): string | undefined => ent(w, id)?.hero?.type;

export function playEvent(a: Audio, ev: SimEvent, w: World): void {
  switch (ev.type) {
    case "hit":
      return hit(a, ev, w);
    case "miss":
      if (a.allow("miss", 2)) a.play("miss", 0.45);
      return;
    case "death": {
      if (ev.kind === "unit") {
        if (a.allow("udeath", 3)) a.play("unit.death", 0.45);
      } else if (ev.kind === "hero") {
        const e = ent(w, ev.id);
        a.vocal(e?.hero?.type, "death", 1, { priority: true, id: ev.id });
        a.play("body.land", 0.7, { at: 0.25 });
        a.play("death.sting", 0.55, { priority: true, at: 0.1 });
      } else {
        a.play("collapse", 0.9, { priority: true });
        a.play("rock.break", 0.8, { at: 0.15 });
        if (ev.big) {
          a.play("explode.big", 1, { priority: true, rate: 0.8 });
          a.play("gong", 0.6, { at: 0.4, priority: true });
          a.impact();
        }
      }
      return;
    }
    case "eliminated":
      a.play("gong", 0.8, { priority: true, rate: 0.85 });
      a.play("bell.church", 0.4, { at: 0.3 });
      return;
    case "slam":
      return slam(a, ev, w);
    case "warcry": {
      const hero = heroType(w, ev.src);
      if (!hero) {
        // Hexed dead rising.
        a.play("bones", 0.5);
        a.play("vo.undead", 0.4, { at: 0.1 });
        return;
      }
      a.vocal(hero, "big", 1, { priority: true, id: ev.src, gap: 0.5 });
      if (ev.style === "blood") [0, 0.28, 0.56].forEach((t) => a.play("drum", 0.6, { at: t, rate: 0.8 }));
      else if (ev.style === "challenge") a.play("bugle", 0.35, { rate: 0.6, at: 0.15, dur: 1.4 });
      else if (hero === "herald") a.play("bugle", 0.5, { rate: 0.75, dur: 1.6 });
      a.play("rock.rumble", 0.35, { rate: 1.2, dur: 0.8 });
      return;
    }
    case "pulse":
      if (!a.allow("pulse", 2)) return;
      if (ev.style === "frost") a.play("glass", 0.5, { rate: 0.8 });
      else if (ev.style === "storm") a.play("electric", 0.55);
      else if (ev.style === "well") a.play("bubble", 0.6, { rate: 0.7 });
      else if (ev.style === "pierce") a.play("hit.wood", 0.6);
      else if (ev.style === "fireburst") {
        a.play("fire.burst", 0.7);
        a.play("explode.small", 0.45, { rate: 1.2 });
      } else a.play("magic.spell", 0.4, { rate: 0.8 });
      return;
    case "heal":
      if (a.allow("heal", 1)) a.play("heal", 0.28, { rate: 1.2 });
      return;
    case "banner":
      a.play("wood.thud", 0.8);
      a.play("herald.flag", 0.6, { at: 0.08 });
      a.vocal("herald", "order", 0.8, { id: ev.src });
      return;
    case "rally":
      a.play("bugle", 0.7, { priority: true, dur: 2.2 });
      a.vocal("herald", "big", 0.8, { id: ev.src, at: 0.2 });
      return;
    case "build":
      if (!a.allow("build", 1)) return;
      a.play("build.work", 0.6);
      a.play("hammer", 0.5, { at: 0.18 });
      if (ev.upgrade) a.play("ratchet", 0.4, { at: 0.1 });
      return;
    case "repair":
      a.play("hammer", 0.6);
      a.play("hammer", 0.5, { at: 0.22 });
      a.play("ratchet", 0.4, { at: 0.1 });
      return;
    case "spawn": {
      const e = ent(w, ev.id);
      if (e?.hero) a.play("respawn", 0.6);
      else if (a.allow("spawn", 1)) a.play("step.dirt", 0.3, { rate: 1.1 });
      return;
    }
    case "rankUp":
      if (a.allow("rank", 1)) a.play("levelup", 0.35, { rate: 1.3 });
      return;
    case "levelup":
      a.play("levelup", 0.6);
      return;
    case "learned":
      a.play("learned", 0.6);
      a.tone("triangle", 880, 1320, 0.3, 0.06, 0, 0.1);
      return;
    case "parry":
      a.play("parry", 0.9, { priority: true });
      a.play("francois.ring", 0.5, { at: 0.02 });
      return;
    case "telegraph":
      if (ev.style === "roots") a.play("thorn.grow", 0.6);
      else if (ev.seconds > 0.2 && a.allow("tele", 1)) a.play("magic.dark", 0.4, { rate: 0.9 });
      return;
    case "blink":
      if (a.allow("blink", 2)) a.play("blink", 0.55);
      return;
    case "act":
      return act(a, ev, w);
    case "shot":
      return shot(a, ev);
    case "cannonWarn": {
      if (!a.allow("cannonWarn", 2)) return;
      a.play("cannon", 0.5, { rate: 0.8 });
      const fly = Math.min(1.3, ev.seconds * 0.6);
      a.tone("sine", 2400, 700, fly, 0.05, 0, ev.seconds - fly);
      return;
    }
    case "cannonHit":
      if (!a.allow("cannonHit", 2)) return;
      a.play("explode.big", 0.95, { priority: true });
      a.play("rock.break", 0.6, { at: 0.05 });
      return;
    case "bomb":
      if (ev.state === "planted") {
        a.play("latch", 0.6);
        a.play("fuse", 0.4, { at: 0.1 });
      }
      return;
    case "reach":
      if (ev.style === "afterimage") a.play("blink", 0.4, { rate: 0.8 });
      else {
        a.play(ev.style === "vine" ? "creak" : "swing.heavy", 0.6, { rate: 0.75 });
        if (ev.hit) a.play(ev.style === "vine" ? "root" : "slap", 0.8, { at: 0.12 });
      }
      return;
    case "shove":
      if (ev.team >= 0) a.play("shove", 0.85);
      else a.play("swing.light", 0.4, { rate: 0.8 });
      return;
    case "fall":
      a.play("fall", 0.5);
      a.play("body.land", 0.6, { at: 0.3 });
      return;
    case "chasm":
      a.play("fall.pit", 0.8, { priority: true });
      return;
    case "chain":
      if (a.allow("chain", 2)) a.play("electric", 0.6);
      return;
    case "pull":
      a.play("whoosh.big", 0.5, { rate: 0.7 });
      a.play("rock.rumble", 0.3, { rate: 1.3 });
      return;
    case "shieldBreak":
      a.play("shield.break", ev.burst ? 0.9 : 0.6);
      if (ev.burst) a.play("wood.break", 0.5);
      return;
    case "charge":
      a.vocal(heroType(w, ev.src), "big", 0.9, { id: ev.src });
      a.play("whoosh.big", 0.6);
      a.play("metal.clank", 0.3, { at: 0.1 });
      return;
    case "mod":
      a.play("rock.rumble", 0.5, { rate: 1.3 });
      a.play("stig.works", 0.6, { at: 0.05 });
      return;
    case "modEnd":
      a.play("rock.break", 0.4);
      return;
    case "callout":
      return callout(a, ev.text);
    case "heroFx":
      return heroFx(a, ev, w);
    case "morph":
      if (ev.stage === "start") a.play("cloth.flap", 0.6);
      else a.play("metal.clank", 0.5);
      return;
    case "jumppad":
      if (ev.stage === "charge") a.play("spring", 0.4, { rate: 0.7 });
      else if (ev.stage === "launch") {
        a.play("jump", 0.6);
        a.play("whoosh.big", 0.5);
      } else if (ev.stage === "fail") a.play("ui.error", 0.4);
      else {
        a.play("body.land", 0.7);
        a.play("shove", 0.35, { rate: 0.8 });
      }
      return;
    case "relic":
      return relic(a, ev);
    case "geyser":
      if (ev.stage === "warn") {
        a.play("bubble", 0.6, { rate: 0.6 });
        a.play("rock.rumble", 0.35, { rate: 1.4 });
      } else {
        a.play("splash.big", 0.9, { priority: true });
        a.play("whoosh.big", 0.6, { rate: 0.8 });
      }
      return;
    case "serpent":
      if (ev.stage === "warn") {
        a.play("rock.rumble", 0.8, { priority: true });
        a.play("serpent.growl", 0.6, { at: ev.seconds * 0.4 });
      } else {
        a.play("serpent.roar", 1, { priority: true });
        a.play("rock.break", 0.8);
        a.play("whoosh.big", 0.6, { rate: 0.7 });
        a.impact();
      }
      return;
    case "avalanche":
      if (ev.stage === "warn") {
        a.play("rock.rumble", 0.7, { priority: true, rate: 0.8 });
        a.play("whistle.wind", 0.4);
      } else if (ev.stage === "slide") {
        a.play("rock.rumble", 1, { priority: true, rate: 0.7 });
        a.play("rock.break", 0.8, { at: 0.4 });
        a.play("rock.break", 0.6, { at: 1.1 });
        a.impact();
      } else a.play("rock.break", 0.4, { rate: 0.8 });
      return;
    case "horn":
      a.play("bugle", 0.8, { rate: 0.5, priority: true, dur: 3 });
      a.tone("sawtooth", 98, 92, 1.6, 0.08);
      return;
    case "gates":
      if (ev.lock) {
        if (ev.stage === "warn") bells(a);
        else {
          a.play("latch", 0.8);
          a.play("gate.open", 0.8, { at: 0.1 });
          a.play("chain.rattle", 0.6, { at: 0.2 });
        }
      } else if (ev.stage === "warn") bells(a);
      else {
        a.play("rock.rumble", 0.6, { rate: 1.2 });
        a.play("gate.open", 0.5);
      }
      return;
    case "tide":
      a.play("tide.wave", 0.8, { rate: ev.high ? 0.9 : 1.1 });
      return;
    case "mist":
      if (ev.stage === "warn") a.play("whistle.wind", 0.6);
      else a.play("whistle.wind", 0.35, { rate: ev.stage === "in" ? 0.8 : 1.2 });
      return;
    case "lantern":
      if (ev.stage === "rise") {
        a.play("magic.dark", 0.6);
        a.play("bell.small", 0.3, { rate: 0.7, at: 0.3 });
      } else if (ev.stage === "taken") {
        a.play("magic.spell", 0.7);
        [523, 659, 784, 1046].forEach((f, i) => a.tone("triangle", f, f, 0.3, 0.06, 0, i * 0.07));
      } else a.play("magic.dark", 0.35, { rate: 0.7 });
      return;
    case "powerup":
      if (ev.stage === "spawn") {
        if (a.allow("pspawn", 1)) a.tone("sine", 880, 1320, 0.25, 0.03);
        return;
      }
      if (ev.kind === "potion") {
        a.play("gulp", 0.7);
        a.play("heal", 0.5, { at: 0.1 });
      } else if (ev.kind === "might") {
        a.play("metal.clank", 0.6, { rate: 0.8 });
        a.play("levelup", 0.5, { rate: 0.8 });
      } else if (ev.kind === "haste") {
        a.play("whoosh.big", 0.7, { rate: 1.4 });
        a.play("levelup", 0.4, { rate: 1.3 });
      } else if (ev.kind === "rush") {
        a.play("magic.spell", 0.6, { rate: 1.3 });
        a.play("levelup", 0.5, { rate: 1.5 });
      } else {
        a.play("shield.up", 0.7);
        a.play("metal.clank", 0.4, { rate: 1.3 });
      }
      return;
    case "chaos":
      a.play("bell.church", 0.5, { priority: true, dur: 2.5 });
      if (ev.kind === "bloodmoon") a.play("gong", 0.7, { rate: 0.7, at: 0.3 });
      else if (ev.kind === "winds") a.play("whistle.wind", 0.6, { at: 0.2 });
      else if (ev.kind === "potions") a.play("bell.small", 0.5, { at: 0.3, rate: 1.2 });
      return;
    case "directive":
      if (a.allow("directive", 1)) a.vocal("herald", "order", 0.6, { gap: 0.4 });
      return;
    case "notice":
      if (ev.team < 0) {
        if (/SUDDEN DEATH/.test(ev.text)) a.announce("sudden_death");
        else a.play("bell.small", 0.35, { rate: 0.8 });
      } else if (a.allow("notice", 1)) a.tone("square", 220, 180, 0.15, 0.04, ev.team ? 0.6 : -0.6);
      return;
  }
}

/** The gate warning chime: three soft two-note bells. */
function bells(a: Audio): void {
  [0, 0.9, 1.8].forEach((t) => {
    a.tone("sine", 392, 390, 1.2, 0.16, 0, t);
    a.tone("sine", 988, 980, 0.8, 0.06, 0, t);
  });
}

function hit(a: Audio, ev: Extract<SimEvent, { type: "hit" }>, w: World): void {
  if (!a.allow("hit", 5)) return;
  const victim = ent(w, ev.id);
  const src = ent(w, ev.src);
  const small = (ev.amount ?? 20) < 6 && !ev.big;
  if (ev.blocked) {
    a.play(victim?.structure ? "hit.ward" : "hit.blocked", 0.7);
    return;
  }
  if (small) {
    // Damage over time: barely a tick.
    if (a.allow("dot", 1)) a.play("hit.flesh", 0.18, { rate: 1.3 });
    return;
  }
  let id = "hit.flesh";
  let rate = 1;
  if (src?.hero) {
    id = WEAPON[src.hero.type]?.hit ?? id;
    if (src.hero.type === "scribe") rate = WEAPON.scribe.rate ?? 1;
  } else if (src?.unit)
    id = src.unit.type === "heavy" ? "hit.blunt" : src.unit.type === "ranged" ? "arrow.hit" : "hit.flesh";
  else if (src?.structure) id = "arrow.hit";
  if (victim?.structure) {
    a.play(id === "arrow.hit" ? "hit.wood" : "hit.structure", 0.65);
    return;
  }
  const unitOnUnit = !!src?.unit && !!victim?.unit;
  const g = unitOnUnit ? 0.35 : 0.75;
  a.play(id, g, rate !== 1 ? { rate } : undefined);
  if (ev.big) a.play("hit.heavy", 0.6, { rate: 0.8 });
  if (victim?.hero && ARMORED.has(victim.hero.type)) a.play("hit.armor", 0.3);
  if (ev.crit) a.play("hit.crit", 0.7, { at: 0.02 });
  if (victim?.hero && ((ev.amount ?? 0) >= 25 || ev.big))
    a.vocal(victim.hero.type, "hurt", 0.65, { id: victim.id, gap: 1.4 });
}

function slam(a: Audio, ev: Extract<SimEvent, { type: "slam" }>, w: World): void {
  if (!a.allow("slam", 2)) return;
  if (ev.trap) {
    a.play("spring", 0.6);
    a.play("root", 0.7, { at: 0.04 });
    return;
  }
  if (ev.zone) {
    a.play("thorn.grow", 0.7);
    a.play("leaves", 0.6, { at: 0.1 });
    return;
  }
  const hero = heroType(w, ev.src);
  if (ev.radius >= 5) {
    a.play("warlord.slam", 1, { priority: true, rate: 0.85 });
    a.play("warlord.quake", 0.8, { at: 0.05 });
    a.play("rock.break", 0.7, { at: 0.1 });
    a.impact();
  } else if (hero === "warlord" || ev.radius >= 2.5) {
    a.play("warlord.slam", 0.85);
    a.play("rock.break", 0.6, { at: 0.04 });
  } else {
    a.play("shove", 0.6);
    a.play("body.land", 0.5);
  }
}

function act(a: Audio, ev: Extract<SimEvent, { type: "act" }>, w: World): void {
  const e = ent(w, ev.src);
  const hero = e?.hero?.type;
  if (!hero) return;
  // What's left of the ability's animation (+ a short tail for its effect): start sounds end with it.
  const ac = e.hero!.action;
  const span = ac ? Math.max(0.35, ac.dur - ac.t) + 0.3 : 1;
  const wpn = WEAPON[hero];
  if (ev.phase === "fire") {
    if (ev.kind === "combo" && wpn) {
      if (hero === "summoner" || hero === "marksman" || hero === "herald") return;
      a.play(wpn.swing, 0.55, { rate: (wpn.rate ?? 1) * (ev.combo >= 2 ? 0.85 : 1) });
      if (Math.random() < 0.3) a.vocal(hero, "attack", 0.55, { id: ev.src });
    } else if (ev.kind === "heave") {
      a.vocal(hero, "big", 1, { id: ev.src, priority: true });
      a.play("whoosh.big", 0.7, { at: 0.1 });
    } else if (ev.kind === "whirl") [0, 0.1, 0.2].forEach((t) => a.play("swing.blade", 0.6, { at: t }));
    else if (ev.kind === "rake") a.play("bird.screech", 0.7);
    else if (ev.kind === "throw") a.play("swing.light", 0.5, { rate: 0.8 });
    return;
  }
  // Ability start.
  const shout = (g = 0.85) => a.vocal(hero, "big", g, { id: ev.src, gap: 0.8, dur: Math.min(0.95, span) });
  switch (ev.kind) {
    case "slam":
    case "quake":
      shout();
      a.play("jump", 0.4, { rate: 0.8, dur: span });
      break;
    case "leap":
      shout(0.7);
      a.play("jump", 0.6, { dur: span });
      break;
    case "dash":
      a.play("swing.blade", 0.7, { rate: 0.8 });
      a.play("dodge", 0.4);
      if (hero === "raider") shout(0.6);
      break;
    case "parry":
      a.play("francois.ring", 0.35, { rate: 1.2 });
      break;
    case "flurry":
      shout(0.8);
      for (let i = 0; i < 8; i++) a.play(i % 2 ? "knife" : "swing.blade", 0.45, { at: 0.08 + i * 0.14 });
      break;
    case "gravewalk":
      a.play("magic.dark", 0.7, { rate: 0.8, dur: span });
      a.vocal(hero, "taunt", 0.5, { id: ev.src, dur: Math.min(1.3, span) });
      break;
    case "heartseeker":
      a.play("wren.draw", 0.7, { rate: 0.8, dur: span });
      shout(0.7);
      break;
    case "brewfest":
      a.play("cork", 0.8);
      a.vocal(hero, "taunt", 0.8, { id: ev.src, at: 0.1 });
      break;
    case "davygrip":
      shout(0.9);
      a.play("bubble", 0.5, { dur: span });
      break;
    case "dredge":
      shout(0.6);
      a.play("chain.rattle", 0.5, { rate: 0.9 });
      break;
    case "bilge":
      a.play("kelp.slime", 0.4, { rate: 1.2 });
      break;
    case "headbutt":
      shout(0.9);
      a.play("ogre.step", 0.5, { rate: 1.2 });
      a.play("whoosh.big", 0.5, { rate: 0.8, at: 0.05 });
      break;
    case "switcheroo":
      a.play("whistle.wind", 0.25, { rate: 1.8, dur: 0.3 });
      a.tone("triangle", 660, 990, 0.12, 0.06);
      a.tone("triangle", 990, 660, 0.12, 0.06, 0, 0.12);
      break;
    case "crush":
      shout(1);
      a.play("chain.rattle", 0.6, { dur: span });
      break;
    case "stealth":
      a.play("grim.smoke", 0.6);
      a.play("pop", 0.5);
      break;
    case "warcry":
    case "rally":
    case "banner":
      break;
    case "works":
    case "wall":
    case "ballista":
      a.play("crank", 0.5, { dur: span });
      break;
    case "fort":
    case "lookout":
      a.play("build.work", 0.5, { rate: 1.2 });
      if (Math.random() < 0.5) a.vocal(hero, "attack", 0.6, { id: ev.src });
      break;
    case "dome":
      shout(0.8);
      a.play("whistle.wind", 0.6, { dur: span });
      break;
    case "summon":
      shout(0.8);
      a.play("magic.dark", 0.6, { rate: 0.7, dur: span });
      break;
    case "hex":
      a.play("magic.dark", 0.5, { dur: span });
      break;
    case "swarm":
      a.play("cloth.flap", 0.4, { rate: 1.3 });
      break;
    case "erratum":
      a.play("ui.page", 0.6, { rate: 1.2 });
      break;
    case "manuscript":
      shout(0.8);
      a.play("ui.peel", 0.6);
      a.play("magic.spell", 0.5, { rate: 0.8, dur: span });
      break;
    case "reach":
    case "zone":
      shout(0.5);
      break;
    case "riptide":
      shout(0.9);
      a.play("tide.wave", 0.7, { dur: span });
      a.play("bubble", 0.5);
      break;
    case "tonguelash":
      a.play("slap", 0.6, { rate: 0.7 });
      a.play("spring", 0.5, { rate: 1.3, at: 0.05 });
      break;
    case "reel":
      a.play("wren.draw", 0.5, { rate: 0.75, dur: span });
      if (Math.random() < 0.5) a.vocal(hero, "attack", 0.6, { id: ev.src });
      break;
    case "harpoon":
      if (Math.random() < 0.25) a.vocal(hero, "attack", 0.5, { id: ev.src });
      break;
    case "keg":
    case "powderkeg":
    case "pip":
    case "volley":
    case "repair":
      if (Math.random() < 0.5) a.vocal(hero, "attack", 0.6, { id: ev.src });
      break;
    default:
      shout(0.6);
  }
}

function shot(a: Audio, ev: Extract<SimEvent, { type: "shot" }>): void {
  if (!a.allow("shot", 4)) return;
  switch (ev.style) {
    case "arrow":
      a.play("arrow.loose", 0.3, { rate: 1.15 });
      return;
    case "square":
      // Hoot's carpenter's square spinning away.
      a.play("stig.wrench", 0.75, { rate: 0.85 });
      a.play("swing.heavy", 0.5, { rate: 1.2 });
      return;
    case "icicle":
      a.play("glass", 0.3, { rate: 1.8 });
      a.play("arrow.loose", 0.3, { rate: 1.4 });
      return;
    case "longarrow":
      a.play("arrow.loose", 0.7);
      a.play("twang", 0.25, { rate: 1.4 });
      return;
    case "powershot":
    case "skyshot":
      a.play("arrow.loose", 0.9, { rate: 0.85 });
      a.play("whoosh.big", 0.6, { rate: 1.2 });
      a.play("twang", 0.4, { rate: 1.1 });
      return;
    case "ballista":
    case "spear":
      a.play("twang", 0.8, { rate: 0.7 });
      a.play("whoosh.big", 0.5, { rate: 1.1 });
      return;
    case "bolt":
      a.play("arrow.loose", 0.5, { rate: 0.85 });
      a.play("latch", 0.25);
      return;
    case "firepot":
      a.play("swing.heavy", 0.6, { rate: 0.7 });
      a.play("sizzle", 0.3);
      return;
    case "magic":
      a.play("magic.bolt", 0.5);
      return;
    case "orb":
      a.play("magic.spell", 0.65);
      return;
    case "rock":
      a.play("rock.rumble", 0.6, { rate: 1.4 });
      a.play("rock.break", 0.5);
      return;
    case "wrench":
      a.play("stig.wrench", 0.7);
      return;
    case "rivet":
      a.play("stig.rivet", 0.6);
      return;
    case "dagger":
      a.play("stig.wrench", 0.5, { rate: 1.4 });
      return;
    case "slash":
      a.play("swing.blade", 0.7, { rate: 0.8 });
      a.play("magic.bolt", 0.3, { rate: 1.3 });
      return;
    case "throw":
      a.play("swing.light", 0.5, { rate: 0.8 });
      return;
    case "harpoon":
      a.play("twang", 0.6, { rate: 0.75 });
      a.play("arrow.loose", 0.6, { rate: 0.7 });
      return;
    case "reel":
      a.play("twang", 0.6, { rate: 0.6 });
      a.play("chain.rattle", 0.35, { rate: 1.4, dur: 0.5 });
      return;
    default:
      a.play("magic.bolt", 0.4);
  }
}

function heroFx(a: Audio, ev: Extract<SimEvent, { type: "heroFx" }>, w: World): void {
  switch (ev.name) {
    case "pipLaunch":
      a.play("bird.chirp", 0.6);
      a.play("cloth.flap", 0.4, { rate: 1.6 });
      return;
    case "pipLatch":
    case "pipHome":
      a.play("bird.chirp", 0.5);
      return;
    case "pipPeck":
      if (a.allow("peck", 1)) a.play("bird.chirp", 0.25, { rate: 1.3 });
      return;
    case "pipRake":
      a.play("bird.screech", 0.8);
      a.play("swing.blade", 0.6, { rate: 1.3 });
      return;
    case "heartseeker":
      a.play("twang", 0.9, { rate: 0.6, priority: true });
      a.play("whoosh.big", 0.9, { rate: 0.8 });
      a.play("explode.small", 0.35, { rate: 1.4 });
      return;
    case "ricochet":
      a.play("metal.clank", 0.5, { rate: 1.5 });
      return;
    case "volley":
      // A ragged release of many bows, a rising whoosh of arrows overhead.
      a.vocal("marksman", "big", 0.7, { id: ev.src });
      for (let i = 0; i < 7; i++)
        a.play("arrow.loose", 0.75 - i * 0.05, {
          at: i * 0.045 + Math.random() * 0.03,
          rate: 0.9 + Math.random() * 0.25,
        });
      a.play("twang", 0.6, { rate: 1.2 });
      a.play("twang", 0.45, { rate: 0.9, at: 0.08 });
      a.play("whoosh.big", 0.8, { rate: 1.3, at: 0.1, priority: true });
      a.play("whoosh.big", 0.6, { rate: 1.6, at: 0.25 });
      return;
    case "volleyWave":
      // Arrows raining down: a hiss and a scatter of thunks.
      if (a.allow("volleyWave", 1)) {
        a.play("miss", 0.6, { rate: 1.3 });
        a.play("miss", 0.45, { rate: 1.6, at: 0.05 });
        for (let i = 0; i < 4; i++)
          a.play("arrow.hit", 0.55 - i * 0.07, { at: 0.12 + i * 0.06 + Math.random() * 0.04 });
      }
      return;
    case "skyshot":
      a.play("jump", 0.5);
      return;
    case "kegThrow":
    case "powderThrow":
      a.play("swing.light", 0.5, { rate: 0.7 });
      return;
    case "kegSplash":
    case "kegSplashSmall": {
      const big = ev.name === "kegSplash";
      a.play("maddock.keg", big ? 0.7 : 0.4);
      a.play("splash", big ? 0.8 : 0.45, { at: 0.03 });
      if (big) a.play("gulp", 0.4, { at: 0.25 });
      return;
    }
    case "kegLand":
      a.play("maddock.keg", 0.6);
      a.play("fuse", 0.35, { at: 0.1 });
      return;
    case "kegBoom":
    case "lastCall":
      a.play("explode.small", 0.95, { priority: true });
      a.play("wood.break", 0.6, { at: 0.03 });
      return;
    case "kegPop":
      a.play("pop", 0.6);
      a.play("explode.small", 0.45, { rate: 1.3 });
      return;
    case "brewfest":
      a.play("cheer", 0.7, { priority: true });
      a.play("maddock.keg", 0.8);
      a.play("warlord.slam", 0.5, { rate: 1.2 });
      return;
    case "plenty":
      if (Math.random() < 0.5) a.play("burp", 0.35);
      return;
    // Brindle (harpooner).
    case "wet":
      if (a.allow("wet", 2)) a.play("splash", 0.45, { rate: 1.3 });
      return;
    case "harpoonStick":
      a.play("wood.thud", 0.7);
      a.play("metal.clank", 0.35, { rate: 1.2 });
      return;
    case "harpoonDrop":
      a.play("step.water", 0.4);
      return;
    case "reel":
      a.play("ratchet", 0.7, { rate: 1.3 });
      a.play("splash", 0.5, { at: 0.05 });
      return;
    case "tongue":
      a.play("slap", 0.7, { at: 0.12 });
      a.play("gulp", 0.4, { rate: 1.4, at: 0.3 });
      return;
    case "riptide":
      a.play("splash.big", 0.9, { priority: true });
      a.play("tide.wave", 0.8, { at: 0.05 });
      return;
    case "puddle":
      a.play("step.water", 0.5);
      return;
    case "slip":
      a.play("splash", 0.7);
      a.play("body.land", 0.6, { at: 0.08 });
      return;
    // Professor Hoot (architect)
    case "squareRecall":
      a.play("stig.wrench", 0.5, { rate: 1.2 });
      return;
    case "fortRise":
      a.play("step.snow", 0.9, { rate: 0.7 });
      a.play("rock.rumble", 0.5, { rate: 1.6 });
      a.play("glass", 0.35, { rate: 1.4, at: 0.12 });
      if ((ev.radius ?? 0) > 0) a.play("whoosh.big", 0.6, { rate: 1.3 });
      return;
    case "fortFall":
      a.play("step.snow", 0.6, { rate: 0.6 });
      if ((ev.radius ?? 0) > 0) a.play("glass", 0.7, { rate: 0.9 });
      return;
    case "lookoutRise":
      a.play("rock.rumble", 0.7, { rate: 1.3 });
      a.play("creak", 0.5, { rate: 0.8, at: 0.1 });
      a.play("glass", 0.45, { rate: 1.2, at: 0.25 });
      return;
    case "lookoutFall":
      a.play("collapse", 0.7, { rate: 1.2 });
      a.play("glass", (ev.radius ?? 0) > 0 ? 0.9 : 0.5, { rate: 0.8, at: 0.05 });
      if ((ev.radius ?? 0) > 0) a.play("explode.small", 0.5, { rate: 1.6, at: 0.08 });
      return;
    case "dome":
      a.play("whoosh.big", 0.9, { rate: 0.7, priority: true });
      a.play("rock.rumble", 0.7, { rate: 1.2 });
      a.play("glass", 0.8, { rate: 0.7, at: 0.2 });
      a.play("bell.small", 0.35, { rate: 1.6, at: 0.3 });
      return;
    case "domeBlock":
      if (a.allow("domeBlock", 2)) a.play("glass", 0.45, { rate: 1.7 });
      return;
    case "owlHop":
      a.play("cloth.flap", 0.7, { rate: 1.3 });
      a.play("cloth.flap", 0.5, { rate: 1.5, at: 0.12 });
      if (Math.random() < 0.4) a.play("owl", 0.45, { rate: 1.2, dur: 0.6 });
      return;
    // Gristle (vintner)
    case "pound":
    case "crush":
    case "crushFinal": {
      const k = ev.name === "crushFinal" ? 1 : ev.name === "pound" ? 0.8 : ev.id === 1 ? 0.65 : 0.5;
      a.play("hammer", 0.5 + 0.4 * k, { rate: 0.55 });
      a.play("metal.clank", 0.4 + 0.3 * k, { rate: 0.6 - 0.1 * k, at: 0.01 });
      a.play("warlord.slam", 0.5 + 0.4 * k, { rate: 1.25 - 0.3 * k, at: 0.02 });
      a.play("splash", 0.3 + 0.3 * k, { rate: 0.8, at: 0.05 });
      if (ev.name === "crushFinal") {
        a.play("rock.break", 0.8, { at: 0.06, priority: true });
        a.play("gong", 0.35, { rate: 0.6, at: 0.04 });
        a.impact();
      }
      return;
    }
    case "headbuttHit":
      a.play("hit.heavy", 0.8, { rate: 0.7 });
      a.play("body.land", 0.4);
      return;
    case "wallSlam":
      a.play("wallsplat", 0.9, { priority: true, rate: 0.85 });
      a.play("rock.break", 0.6, { at: 0.03 });
      a.play("bell.small", 0.35, { rate: 1.6, at: 0.15 });
      a.impact();
      return;
    case "switchMark":
      a.play("chain.rattle", 0.35, { rate: 1.4 });
      return;
    case "switch":
      a.play("blink", 0.7);
      a.play("whoosh.big", 0.5, { rate: 1.4 });
      a.play("shield.up", 0.5, { at: 0.05 });
      return;
    case "switchFizzle":
      a.play("ui.error", 0.3, { rate: 0.8 });
      return;
    case "curl":
      a.play("metal.clank", 0.7, { rate: 0.7 });
      a.play("body.land", 0.5);
      return;
    case "gritFull":
      a.play("hit.armor", 0.25, { rate: 0.6 });
      return;
    case "kegRocket":
      a.play("cork", 0.8);
      a.play("firecracker", 0.5, { at: 0.05 });
      a.play("whoosh.big", 0.6, { at: 0.05 });
      return;
    // Hollin: wet ink flicks, page rustles, bees and chimes.
    case "inkShot":
      a.play("swing.light", 0.5, { rate: 1.35 });
      a.play("bubble", 0.35, { rate: 1.4, at: 0.02 });
      if (Math.random() < 0.25) a.vocal("scribe", "attack", 0.5, { id: ev.src });
      return;
    case "inkCharged":
      a.play("whoosh.big", 0.5, { rate: 1.5 });
      a.play("magic.bolt", 0.55, { rate: 0.9 });
      a.vocal("scribe", "big", 0.6, { id: ev.src });
      return;
    case "inkBounce":
      if (a.allow("inkBounce", 1)) a.play("splash", 0.35, { rate: 1.9 });
      return;
    case "inkBlot":
      a.play("splash.big", 0.6, { rate: 1.3 });
      a.play("bubble", 0.4, { rate: 0.8, at: 0.05 });
      return;
    case "rune":
      if (a.allow("rune", 1)) a.play("bell.small", 0.25, { rate: 1.5 });
      return;
    case "runeUse":
      a.play("magic.spell", 0.5, { rate: 1.3 });
      a.play("bell.small", 0.35, { rate: 1.2 });
      return;
    case "runeFlare":
      if (a.allow("runeFlare", 2)) {
        a.play("magic.spell", 0.65, { rate: 1.1 });
        a.play("explode.small", 0.35, { rate: 1.5, at: 0.03 });
      }
      return;
    case "swarm":
    case "greatSwarm":
      a.play("bed.insects", ev.name === "greatSwarm" ? 0.8 : 0.6, { rate: 1.7, dur: Math.min(1.6, ev.seconds ?? 1) });
      a.play("bubble", 0.3, { rate: 0.7 });
      if (ev.name === "greatSwarm") a.play("bell.small", 0.4, { rate: 1.1 });
      return;
    case "swarmCall":
      a.play("bed.insects", 0.6, { rate: 2, dur: 0.9 });
      a.play("whistle.wind", 0.3, { rate: 1.6 });
      return;
    case "erratum":
      a.play("blink", 0.6, { rate: 0.9 });
      a.play("ui.page", 0.6, { at: 0.04 });
      a.play("cloth.flap", 0.4, { rate: 1.4, at: 0.06 });
      return;
    case "manuscript":
      a.play("gong", 0.45, { rate: 1.6, priority: true });
      a.play("bell.church", 0.4, { rate: 1.3, at: 0.05 });
      [0, 0.07, 0.15, 0.24].forEach((t) => a.play("ui.page", 0.45, { at: t, rate: 1 + t }));
      a.vocal("scribe", "taunt", 0.7, { id: ev.src, at: 0.15 });
      return;
    case "gust":
      a.play("whistle.wind", 0.5, { rate: 1.2 });
      a.play("ui.page", 0.55);
      a.play("cloth.flap", 0.45, { rate: 1.1, at: 0.05 });
      return;
    // Mother Kelp: anchor and chain, brine, drowned hands.
    case "whirl":
      if (a.allow("kelpWhirl", 1)) {
        a.play("swing.heavy", 0.55, { rate: 0.75 });
        a.play("chain.rattle", 0.35, { rate: 1.1 });
      }
      return;
    case "dredge":
    case "dredgeMiss":
      a.play("chain.rattle", 0.8, { priority: true });
      a.play("whoosh.big", 0.6, { rate: 0.8 });
      if (ev.name === "dredgeMiss") a.play("splash", 0.5, { at: ev.seconds ?? 0.2 });
      return;
    case "dredgeSwap":
      a.play("kelp.anchor", 0.9, { priority: true });
      a.play("splash", 0.8, { at: 0.02 });
      a.play("bubble", 0.5, { at: 0.1 });
      return;
    case "bilge":
      a.play("kelp.spit", 0.8, { priority: true });
      a.play("kelp.slime", 0.7, { at: 0.12 });
      a.play("bubble", 0.4, { at: 0.2 });
      return;
    case "davygrip":
      a.play("kelp.curse", 0.8, { priority: true });
      a.play("splash", 0.9, { rate: 0.7 });
      a.play("rock.rumble", 0.6, { rate: 0.8, at: 0.05 });
      a.play("kelp.slime", 0.6, { at: 0.1 });
      a.impact();
      return;
    case "grab":
      if (a.allow("kelpGrab", 2)) a.play("kelp.slime", 0.6, { rate: 0.8 });
      return;
    case "chainSwing":
      a.play("chain.rattle", 0.8);
      a.play("whoosh.big", 0.5, { rate: 1.1, at: 0.05 });
      return;
    case "tide":
      if ((ev.radius ?? 0) >= 10 && a.allow("kelpTide", 1)) {
        a.play("splash", 0.6, { rate: 0.8 });
        a.vocal("wreckwitch", "taunt", 0.7, { id: ev.src });
      } else if ((ev.radius ?? 0) % 3 === 0 && (ev.radius ?? 0) > 0 && a.allow("kelpTide", 1))
        a.play("bubble", 0.3, { rate: 0.9 });
      return;
  }
  void w;
}

function relic(a: Audio, ev: Extract<SimEvent, { type: "relic" }>): void {
  const arp = (fs: number[], type: OscillatorType, g: number, step: number) =>
    fs.forEach((f, i) => a.tone(type, f, f, 0.22, g, 0, i * step));
  if (ev.state === "taken") {
    a.play("magic.spell", 0.6, { priority: true });
    arp([523, 659, 784, 1047], "triangle", 0.07, 0.06);
  } else if (ev.state === "dropped") {
    a.play("hit.ward", 0.6, { rate: 0.6 });
    arp([784, 622, 523, 392], "triangle", 0.07, 0.06);
  } else if (ev.state === "home") {
    a.play("magic.dark", 0.5, { rate: 1.2 });
    a.tone("sine", 392, 784, 0.6, 0.06);
  } else if (ev.state === "stolen") {
    a.play("magic.dark", 0.7, { priority: true, rate: 0.7 });
    arp([659, 523, 440, 330], "sawtooth", 0.05, 0.08);
  } else {
    a.play("gong", 0.9, { priority: true });
    a.play("explode.far", 0.6);
    a.play("cheer", 0.4, { at: 0.4 });
    arp([262, 330, 392, 523, 659], "sawtooth", 0.04, 0.07);
    a.impact();
  }
}

function callout(a: Audio, text: string): void {
  if (text === "WALL SPLAT!") {
    a.play("wallsplat", 0.9, { priority: true });
    a.play("body.land", 0.6);
  } else if (text === "GUARD BROKEN!") a.play("guardbreak", 0.8, { priority: true });
  else if (text === "FULL POWER!") a.tone("triangle", 880, 1760, 0.18, 0.08);
  else if (text === "INTERRUPTED!" || text === "BLINDED!") a.play("glass", 0.5, { rate: 1.3 });
  else if (text === "!") a.play("ogre.voice", 0.7);
  else if (text === "ANVIL POUND") a.play("swing.heavy", 0.6, { rate: 0.6 });
}
