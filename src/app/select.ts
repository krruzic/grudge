// Champion select and field select controllers (states "select" and "map"), plus name signing.
//
// Seats: each of the 4 select slots is a human (joined, a pad or remote guest sits there), a CPU, or OPEN (online
// host only: waiting for a guest). `autoCpu` marks CPUs that were filled in automatically and may be replaced
// by anyone who joins; CPUs added on purpose (+ ADD CPU / the kind plaque) stay. Commander seats (2/3 in 2v2
// without the partners rule) always play the Herald and are ready from the start.
//
// Chips (seals): every seat has a chip. Placing it on a champion picks that champion and readies the seat.
// A human's chip starts in their own cursor's hand, so their card is empty ("PICK A CHAMPION") until they place
// it - except after a match, where enterSelect(true) keeps everyone's sealed pick and costume. Cursors may also
// pick up a CPU's chip to choose for it.
//
// Ownership rules: only a card's owner (the pad in that seat) can open its name entry or flip its camera
// button; the ready banner and start wait while anyone is signing a name.
import { costumesOf } from "../render/costumes";
import type { PadState } from "../input/gamepads";
import { NameEntry, type TagResult, type TagRow } from "../ui/nameEntry";
import { MAX_TAG, cleanTag, type MatchMode, type TagRef } from "../game/save";
import type { App } from "./app";
import { MAX_PLAYERS, commanderType, data, roster } from "./assets";
import { beginMatch, resetAttractWorld, toMenu } from "./match";

// ── Seats ──

/** Gives a CPU seat a hero: the commander, or a random champion + costume unless it already sealed one. */
export function settleCpu(app: App, i: number): void {
  const sl = app.slots[i];
  if (app.commanderSlot(i)) {
    sl.hero = commanderType;
    sl.ready = true;
    app.cursors.placeChip(i, null);
    return;
  }
  if (app.heldBy(i) >= 0) return;
  if (!sl.ready || sl.open || !roster.includes(sl.hero)) {
    sl.hero = app.randomHero();
    sl.costume = randomCostume(sl.hero);
  }
  sl.ready = true;
  app.cursors.placeChip(i, sl.hero);
}

function randomCostume(hero: string): string {
  const list = costumesOf(hero);
  return list[Math.floor(Math.random() * list.length)] ?? "";
}

/** Seat i becomes a human: unready, chip in their own hand (commanders are ready right away). */
export function makeHuman(app: App, i: number): void {
  const sl = app.slots[i];
  sl.open = false;
  sl.cpu = false;
  sl.joined = true;
  if (app.commanderSlot(i)) {
    sl.hero = commanderType;
    sl.ready = true;
    return;
  }
  if (!roster.includes(sl.hero)) sl.hero = roster[0];
  const cursors = app.cursors.cursors;
  const holder = app.heldBy(i);
  if (holder >= 0 && holder !== i) cursors[holder].holding = -1;
  sl.ready = false;
  app.cursors.placeChip(i, null);
  if (cursors[i].holding < 0) cursors[i].holding = i;
}

/** Seat i becomes OPEN (online host: waiting for a guest). */
export function makeOpen(app: App, i: number): void {
  const sl = app.slots[i];
  if (!app.commanderSlot(i) && !roster.includes(sl.hero)) sl.hero = app.randomHero();
  sl.cpu = false;
  sl.joined = false;
  sl.open = true;
  sl.ready = true;
  sl.autoCpu = true;
  sl.tag = undefined;
  sl.tagId = undefined;
  if (app.cursors.cursors[i].holding === i) app.cursors.cursors[i].holding = -1;
  app.cursors.placeChip(i, null);
}

export function makeCpu(app: App, i: number): void {
  const sl = app.slots[i];
  const wasOpen = !!sl.open;
  sl.open = false;
  sl.cpu = true;
  if (wasOpen) sl.ready = false;
  sl.joined = false;
  if (app.cursors.cursors[i].holding === i) app.cursors.cursors[i].holding = -1;
  settleCpu(app, i);
}

/** Nobody sits at seat i: an open seat when hosting online, otherwise an automatic CPU. */
export function vacate(app: App, i: number): void {
  if (app.net.mode === "host") makeOpen(app, i);
  else {
    makeCpu(app, i);
    app.slots[i].autoCpu = true;
  }
}

/** Switches 1v1 / 2v2 / FFA, re-deciding seats 2 and 3 and moving to a field that fits the mode. */
export function setMode(app: App, v: MatchMode): void {
  if (app.mode === v) return;
  const was = app.mode;
  const wasCommander = [false, false, ...[2, 3].map((k) => app.commanderSlot(k))];
  app.mode = v;
  for (const k of [2, 3]) {
    const sl = app.slots[k];
    if (app.mode === "1v1") {
      if (app.cursors.cursors[k].holding >= 0) app.cursors.cursors[k].holding = -1;
    } else if (was === "1v1") {
      if (app.present(k)) makeHuman(app, k);
      else vacate(app, k);
    } else if (wasCommander[k] !== app.commanderSlot(k)) {
      if (sl.open) makeOpen(app, k);
      else if (sl.cpu) {
        sl.ready = false;
        settleCpu(app, k);
      } else makeHuman(app, k);
    }
  }
  if (!app.fields().includes(app.mapIndex)) {
    app.mapIndex = app.fields()[0] ?? app.mapIndex;
    resetAttractWorld(app);
  }
}

/**
 * Enters champion select: re-decides every seat from who is present. With `keep` (back from a match) humans keep
 * their sealed champion and costume instead of starting with an empty card.
 */
export function enterSelect(app: App, keep = false): void {
  const slots = app.slots;
  const prev = slots.map((sl) =>
    keep && sl.ready && !sl.cpu && !sl.open && roster.includes(sl.hero) ? { hero: sl.hero, costume: sl.costume } : null,
  );
  const here = [0, 1, 2, 3].filter((i) => app.present(i)).length;
  // A host's CPUs added on purpose survive re-entering select.
  const keptCpu = (i: number) =>
    app.net.mode === "host" && slots[i].cpu && slots[i].autoCpu === false && !slots[i].open;
  if (here >= 3) {
    if (app.mode === "1v1") app.mode = "2v2";
  } else if (app.net.mode === "host" && app.mode !== "ffa" && !(app.mode === "2v2" && [2, 3].some(keptCpu)))
    app.mode = "1v1";
  app.cursors.setScale(app.uiCanvas.w, app.uiCanvas.h);
  app.cursors.reset(app.mode === "ffa" ? [0, 1, 2, 3] : app.mode === "2v2" ? [0, 2, 1, 3] : [0, 1]);
  slots.forEach((sl, i) => {
    const keepCpu = keptCpu(i);
    sl.ready = false;
    if (app.present(i)) {
      sl.autoCpu = false;
      makeHuman(app, i);
      const pv = prev[i];
      if (pv && !app.commanderSlot(i)) {
        sl.hero = pv.hero;
        sl.costume = pv.costume;
        sl.ready = true;
        if (app.cursors.cursors[i].holding === i) app.cursors.cursors[i].holding = -1;
        app.cursors.placeChip(i, pv.hero);
      }
    } else if (keepCpu) {
      makeCpu(app, i);
      sl.autoCpu = false;
    } else vacate(app, i);
  });
  app.readySince = -1;
}

/** Every active seat is sealed (no OPEN seats, no chip in anyone's hand). */
export function selectReady(app: App): boolean {
  return (
    app.slots.every((sl, i) => !app.slotActive(i) || (sl.ready && !sl.open && app.heldBy(i) < 0)) &&
    app.cursors.cursors.every((c) => !c.active || c.holding < 0 || !app.slotActive(c.holding))
  );
}

/** Champion select -> field select. */
export function toMap(app: App): void {
  app.mapHover.fill("*");
  app.screens.readyBanner = false;
  app.readySince = -1;
  app.audio.ui("ok");
  app.state = "map";
  app.screens.set("map");
  if (!app.fields().includes(app.mapIndex) && app.fields().length) {
    app.mapIndex = app.fields()[0];
    resetAttractWorld(app);
  }
  app.pickIndex = Math.max(0, app.fields().indexOf(app.mapIndex));
}

// ── Name signing ──
// A card's name plate opens a NameEntry (screens.naming, keyed by seat). Pads type with the on-screen keyboard
// (runNaming); the keyboard seat types directly (installKeyboardNaming). Online guests send the chosen name to
// the host ("tag"), which validates it.

/** The open name entry the keyboard player types into: [seat, entry], or null. */
export function keyboardEditor(app: App): [number, NameEntry] | null {
  const k = app.pads.keyboardSlot();
  if (k < 0) return null;
  const slot = app.state === "lobby" ? app.net.mySlots.get(k) : k;
  const ne = slot === undefined ? undefined : app.screens.naming.get(slot);
  return ne && slot !== undefined ? [slot, ne] : null;
}

/** Typed keys go to the keyboard player's open name entry (capture phase, before the game sees them). */
export function installKeyboardNaming(app: App): void {
  window.addEventListener(
    "keydown",
    (e) => {
      const ed = keyboardEditor(app);
      if (!ed) return;
      const r = ed[1].key(e.code, performance.now() / 1000);
      if (r === false) return;
      if (r) nameDone(app, ed[0], r, app.pads.keyboardSlot());
      e.preventDefault();
      e.stopImmediatePropagation();
      app.audio.ui("move");
    },
    true,
  );
}

/** A name entry closed: apply the chosen tag locally, or send it to the host when we are a guest. */
function nameDone(app: App, slot: number, r: TagResult, k = slot): void {
  app.screens.naming.delete(slot);
  if (r.tag === undefined) {
    app.audio.ui("back");
    return;
  }
  app.audio.ui("ok");
  if (r.tag) app.save.useTag(r.tag.id);
  if (app.state === "lobby") app.net.link.toHost({ t: "tag", k, tag: r.tag?.name ?? null, id: r.tag?.id ?? null });
  else {
    app.slots[slot].tag = r.tag?.name ?? null;
    app.slots[slot].tagId = r.tag?.id ?? null;
  }
}

/** Names used by other humans (so two seats never sign the same name). */
function otherNames(app: App, slot: number): string[] {
  const list =
    app.state === "lobby"
      ? (app.screens.lobby?.slots ?? []).map((s) => (s.cpu || s.open ? null : s.name))
      : app.slots.map((s) => (s.cpu || s.open ? null : (s.tag ?? null)));
  return list.filter((n, j): n is string => j !== slot && !!n);
}

function tagEditor(app: App, slot: number, current: string | null | undefined): NameEntry {
  const rows = (): TagRow[] => {
    const taken = otherNames(app, slot);
    const ids = app.state === "lobby" ? [] : app.slots.map((s, j) => (j === slot ? null : (s.tagId ?? null)));
    return app.save.tagIds().map((id) => {
      const t = app.save.data.tags[id];
      return { id, name: t.name, rec: `${t.w}-${t.l}`, taken: taken.includes(t.name) || ids.includes(id) };
    });
  };
  const create = (name: string): TagRef | null => {
    const n = cleanTag(name);
    return n && !otherNames(app, slot).includes(n) ? app.save.addTag(n) : null;
  };
  return new NameEntry(current, rows, create, MAX_TAG);
}

/** Opens seat i's name entry. */
export function openNaming(app: App, i: number, current: string | null | undefined): void {
  app.screens.naming.set(i, tagEditor(app, i, current));
  app.audio.ui("ok");
}

/** `name` as a seat label, unless another human already uses it. */
export function freeLabel(app: App, slot: number, name: string): string | undefined {
  return app.slots.some((s, j) => j !== slot && !s.cpu && !s.open && s.tag === name) ? undefined : name;
}

/** Feeds pad input to every open name entry. `padOf` maps a seat to the pad that owns it (-1 = gone). */
export function runNaming(app: App, padOf: (slot: number) => number, now: number): void {
  app.namingAte = app.screens.naming.size > 0;
  app.closedNow.clear();
  for (const [slot, ne] of [...app.screens.naming]) {
    const k = padOf(slot);
    const p = k >= 0 ? app.pads.players[k] : undefined;
    if (!p?.connected) {
      app.screens.naming.delete(slot);
      continue;
    }
    const r = ne.update(p, now);
    if (r?.done) {
      app.closedNow.add(k);
      nameDone(app, slot, r, k);
    } else if (Object.values(p.pressed).some(Boolean)) app.audio.ui("move");
  }
}

/** Pad k is signing a name (its cursor must not move or click). */
export function isNaming(app: App, k: number): boolean {
  return [...app.screens.naming.keys()].some((s) => (app.state === "lobby" ? app.net.mySlots.get(k) === s : s === k));
}

/** Freezes the cursors of pads that are signing (or just finished) and passes the pad list through. */
export function freezeNamingCursors<T>(app: App, list: T[]): T[] {
  app.cursors.frozen.clear();
  list.forEach((_, k) => (isNaming(app, k) || app.closedNow.has(k)) && app.cursors.frozen.add(k));
  return list;
}

// ── Costumes ──
// Flicking the C-stick left/right on select cycles the seat's costume and shows the costume strip for 2.5 s.

/** Horizontal C-stick flick direction (-1, 0, 1). */
export function cStickFlick(p: PadState | undefined): number {
  return p && Math.abs(p.cX) > 0.6 && Math.abs(p.cX) > Math.abs(p.cY) ? Math.sign(p.cX) : 0;
}

/** The costume after `current` in direction `dir`, or null when the hero has only one. */
export function nextCostume(hero: string, current: string | undefined, dir: number): string | null {
  const list = costumesOf(hero);
  if (list.length <= 1) return null;
  const at = Math.max(0, list.indexOf(current ?? ""));
  return list[(at + dir + list.length) % list.length];
}

const COSTUME_STRIP_SECONDS = 2.5;

// ── Champion select (state "select") ──

export function updateSelect(app: App, now: number, dt: number): void {
  const { slots, pads, cursors, screens } = app;
  cursors.setScale(app.uiCanvas.w, app.uiCanvas.h);
  if (app.mode === "1v1" && [0, 1, 2, 3].filter((i) => app.present(i)).length >= 3) setMode(app, "2v2");
  // Seats follow who is plugged in: joiners take open / auto-CPU seats, leavers become vacant.
  slots.forEach((sl, i) => {
    sl.local = pads.players[i].connected;
    if (app.present(i) && (sl.open || (sl.cpu && sl.autoCpu))) {
      sl.autoCpu = false;
      makeHuman(app, i);
    }
    if (!app.present(i) && !sl.cpu && !sl.open) vacate(app, i);
    if (app.net.mode !== "host" && sl.open) {
      makeCpu(app, i);
      sl.autoCpu = true;
    }
  });
  runNaming(app, (slot) => (pads.players[slot]?.connected ? slot : -1), now);

  pads.players.forEach((p, i) => {
    const dir = cStickFlick(p);
    const canDress = !slots[i].cpu && !slots[i].open && !isNaming(app, i);
    if (dir && canDress) screens.costumeShownUntil[i] = now + COSTUME_STRIP_SECONDS;
    if (dir && dir !== app.costumeFlick[i] && canDress) {
      const next = nextCostume(slots[i].hero, slots[i].costume, dir);
      if (next !== null) {
        slots[i].costume = next;
        app.net.lobbySentAt = 0;
        app.audio.ui("move");
      }
    }
    app.costumeFlick[i] = dir;
  });

  // A cursor may grab its own human seat's chip, or a CPU seat's chip (choosing for the CPU).
  const canHold = (slot: number, by: number) =>
    app.slotActive(slot) && !app.commanderSlot(slot) && (slot === by ? !slots[slot].cpu : slots[slot].cpu);
  const acts = cursors.update(freezeNamingCursors(app, app.padsForCursors()), dt, now, canHold);
  for (const act of acts) {
    if (act.type === "hover") {
      if (!slots[act.slot].ready && slots[act.slot].hero !== act.hero) {
        slots[act.slot].hero = act.hero;
        app.audio.ui("move");
      }
    } else if (act.type === "place") {
      slots[act.slot].hero = act.hero;
      slots[act.slot].ready = true;
      app.audio.ui("ok");
    } else if (act.type === "pick") {
      slots[act.slot].ready = false;
      app.audio.ui("move");
    } else if (act.type === "button") selectButton(app, act.id, act.by);
    else if (act.type === "back") selectBack(app, act.by);
  }

  screens.updateSelect(slots, data.heroes.heroes, roster, app.mode, app.save.data.rules.partners === 1);
  for (let i = 0; i < 4; i++)
    screens.zoomModes[i] = app.net.remoteAt(i) >= 0 ? app.net.remoteCam[i] : (app.save.data.options.zoom?.[i] ?? 0);
  screens.hosting = app.net.mode === "host";
  const allReady = selectReady(app);
  if (allReady && app.readySince < 0) app.readySince = now;
  if (!allReady) app.readySince = -1;
  // No ready banner (and no start) while anyone is signing a name.
  screens.readyBanner = allReady && !screens.naming.size;
  screens.openHint =
    !allReady &&
    slots.some((sl, i) => app.slotActive(i) && sl.open) &&
    slots.every((sl, i) => !app.slotActive(i) || sl.open || (sl.ready && app.heldBy(i) < 0));
  const startPressed = app.anyPressed("start") && !app.namingAte && !screens.naming.size;
  if (allReady && now - app.readySince > 0.25 && startPressed) toMap(app);
}

/** A cursor clicked a select-screen button ("<id>:<seat>"), `by` = the clicking pad. */
function selectButton(app: App, buttonId: string, by: number): void {
  const { slots, audio } = app;
  const [id, arg] = buttonId.split(":");
  const i = Number(arg);
  if (id === "unplug") {
    app.pads.release(i);
    audio.ui("back");
  } else if (id === "mode" && !app.training) {
    setMode(app, app.mode === "1v1" ? "2v2" : app.mode === "2v2" ? "ffa" : "1v1");
    audio.ui("ok");
  } else if (id === "add") {
    if (app.mode === "1v1") setMode(app, "2v2");
    audio.ui("ok");
  } else if (id === "sit") {
    sitAt(app, by, i);
  } else if (id === "seatcpu") {
    makeCpu(app, i);
    slots[i].autoCpu = false;
    audio.ui("ok");
  } else if (id === "seatopen") {
    makeOpen(app, i);
    audio.ui("back");
  } else if (id === "cam" && (app.net.remoteAt(i) >= 0 || (by !== i && !slots[i].cpu))) {
    // Only the card's owner flips its camera button.
    audio.ui("back");
  } else if (id === "cam") {
    app.toggleZoom(i);
    audio.ui("ok");
  } else if (id === "camera") {
    const order = [1, 0];
    app.save.data.options.split = order[(order.indexOf(app.save.data.options.split) + 1) % order.length];
    app.save.write();
    app.applyOptions();
    audio.ui("ok");
  } else if (id === "kind") {
    if (slots[i].cpu && app.present(i)) makeHuman(app, i);
    else if (!slots[i].cpu) {
      makeCpu(app, i);
      slots[i].autoCpu = false;
    }
    audio.ui("ok");
  } else if (id === "lvl") {
    slots[i].level = (slots[i].level % 3) + 1;
    app.net.lobbySentAt = 0;
    audio.ui("move");
  } else if (id === "tag" && !slots[i].cpu && !app.commanderSlot(i) && by === i && !app.screens.naming.has(i)) {
    // Only the card's owner signs its name.
    openNaming(app, i, slots[i].tag);
  } else if (id === "go" && selectReady(app) && !app.screens.naming.size) {
    toMap(app);
  }
}

/** "SIT HERE": pad `from` moves its seat (hero and name) to seat i, leaving its old seat vacant. */
function sitAt(app: App, from: number, i: number): void {
  const { slots, pads, cursors } = app;
  const ok =
    from >= 0 &&
    from !== i &&
    app.slotActive(i) &&
    !app.commanderSlot(i) &&
    !app.net.seatAt(i) &&
    pads.players[from]?.connected &&
    !pads.players[i]?.connected &&
    (slots[i].open || slots[i].cpu);
  if (!ok || !pads.move(from, i)) {
    app.audio.ui("back");
    return;
  }
  const { hero, tag, tagId } = slots[from];
  const cf = cursors.cursors[from];
  const ct = cursors.cursors[i];
  ct.x = cf.x;
  ct.y = cf.y;
  cf.holding = -1;
  slots[from].tag = undefined;
  slots[from].tagId = undefined;
  vacate(app, from);
  slots[i].autoCpu = false;
  makeHuman(app, i);
  if (roster.includes(hero)) slots[i].hero = hero;
  slots[i].tag = tag;
  slots[i].tagId = tagId;
  app.net.lobbySentAt = 0;
  app.audio.ui("ok");
}

/** B on select: put back a CPU chip in hand, else take back your own seal, else leave to the menu. */
function selectBack(app: App, by: number): void {
  const { slots, cursors } = app;
  const c = cursors.cursors[by];
  if (c.holding >= 0 && c.holding !== by) {
    const sl = slots[c.holding];
    cursors.placeChip(c.holding, sl.hero);
    sl.ready = true;
    c.holding = -1;
    app.audio.ui("back");
  } else if (c.holding < 0 && !slots[by].cpu && slots[by].ready && !app.commanderSlot(by)) {
    slots[by].ready = false;
    cursors.placeChip(by, null);
    c.holding = by;
    app.audio.ui("back");
  } else if (c.holding === by || slots[by].cpu || app.commanderSlot(by)) {
    app.audio.ui("back");
    toMenu(app);
  }
}

// ── Field select (state "map") ──

export function updateFieldSelect(app: App, now: number, dt: number): void {
  const { cursors } = app;
  cursors.setScale(app.uiCanvas.w, app.uiCanvas.h);
  let back = false;
  let go = app.anyPressed("start");
  for (const act of cursors.update(app.padsForCursors(), dt, now, () => false)) {
    if (act.type === "back") back = true;
    if (act.type === "button" && act.id.startsWith("map:")) {
      app.pickIndex = Number(act.id.slice(4));
      go = true;
    }
  }
  // Hovering a field card selects it (and swaps the backdrop world) - but not the hover a cursor starts on.
  const hov = cursors.cursors.find(
    (c, i) => c.active && c.hover.startsWith("map:") && app.mapHover[i] !== "*" && c.hover !== app.mapHover[i],
  );
  cursors.cursors.forEach((c, i) => (app.mapHover[i] = c.hover));
  if (hov) {
    const k = Number(hov.hover.slice(4));
    if (k !== app.pickIndex) {
      app.pickIndex = k;
      app.audio.ui("move");
      const fields = app.fields();
      if (app.pickIndex < fields.length && fields[app.pickIndex] !== app.mapIndex) {
        app.mapIndex = fields[app.pickIndex];
        resetAttractWorld(app);
      }
    }
  }
  if (go) {
    app.audio.ui("ok");
    const pool = app.fields();
    if (app.pickIndex >= pool.length) app.mapIndex = pool[Math.floor(Math.random() * pool.length)] ?? app.mapIndex;
    else app.mapIndex = pool[app.pickIndex];
    beginMatch(app);
  } else if (back) {
    // Back to champion select with every human's seal back in hand.
    app.audio.ui("back");
    app.state = "select";
    app.screens.set("select");
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (!app.slotActive(i) || app.commanderSlot(i) || app.slots[i].cpu) continue;
      app.slots[i].ready = false;
      cursors.placeChip(i, null);
      cursors.cursors[i].holding = i;
    }
  }
}
