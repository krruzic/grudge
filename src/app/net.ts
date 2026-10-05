// Online play glue between the NetLink transport (src/net/link.ts) and the client state machine.
//
// Roles: the HOST runs the real select screen and the authoritative simulation; GUESTS ("peers") see a mirrored
// lobby (state "lobby", screens.lobby) and replay the host's frames.
//
// Lobby flow: a guest announces which local pads want seats ("want"); the host seats each one in a free slot
// (open or auto-CPU), and every 0.25 s broadcasts the whole lobby view ("lobby"). Guests send their picks,
// ready flags, costume, camera, name and level changes as small messages keyed by their local pad index `k`.
// Cursors and name entries are mirrored live both ways at ~12 Hz ("hand", "nm" up to the host; "pres" down).
//
// Match flow (lockstep): the host starts everyone with the same MatchSpec ("start"). Each tick, the host merges
// the commands each guest sent since the last tick ("cmd", queued per remote seat) with its own local/bot input,
// steps the world, and broadcasts the packed command frame ("fs"), plus a world hash every 30 ticks. Guests only
// step on frames they receive (stepPeer) and compare hashes to detect desyncs. Guests never run bots: a CPU seat
// is a bot on the host, whose commands arrive in the frames like everyone else's.
import { Bot } from "../sim/bot";
import type { Command } from "../sim/types";
import { costumesOf, playerLabel } from "../render/costumes";
import { cleanHand, type HandWire } from "../ui/cursor";
import type { LobbySlot } from "../ui/screens";
import { MAX_TAG, cleanTag } from "../game/save";
import { NetLink, type NetMsg } from "../net/link";
import { mathPrint, worldHash, type Frame, type MatchSpec } from "../net/session";
import type { App } from "./app";
import { MAX_PLAYERS, maps, roster, seatsFor } from "./assets";
import { enterSelect, freeLabel, makeHuman, makeOpen, setMode } from "./select";
import { linkMates, resetAttractWorld, setPaused, startNetMatch, toMenu } from "./match";

/** A guest's local pad seated at a slot on the host (slot -1 = waiting for a free seat). */
export interface RemoteSeat {
  peer: number;
  /** The guest's local pad index. */
  k: number;
  slot: number;
  name: string;
  /** Commands received since the last tick, merged into one per tick (mergeCommands). */
  queue: Command[];
  last: Command;
}

/** Presence (cursor / name entry) mirroring rate. */
const PRES_DT = 1 / 12;
/** How often the host re-broadcasts the lobby view and room info. */
const LOBBY_DT = 0.25;
/** Host sends a world hash every this many ticks so guests can detect a desync. */
const HASH_EVERY = 30;
/** Peer: catch up at most this many ticks per frame. */
const MAX_CATCHUP = 12;

const cleanName = (v: unknown): string =>
  String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, MAX_TAG);

export class NetSession {
  readonly link = new NetLink();
  mode: "off" | "host" | "peer" = "off";

  // ── Host side ──
  readonly rseats: RemoteSeat[] = [];
  readonly peerNames = new Map<number, string>();
  /** Camera (manual zoom) flag of each remote seat, shown on the host's select cards. */
  readonly remoteCam = [0, 0, 0, 0];
  /** Mirrored guest cursors and name entries, keyed "peer:k". */
  readonly remoteHands = new Map<string, HandWire>();
  readonly remoteSigning = new Map<string, [number, string]>();
  /** Last broadcast time of the lobby view; set to 0 to send it on the next frame. */
  lobbySentAt = 0;
  presSent = "";
  presAt = 0;
  outFrames: Frame[] = [];
  outHashes: [number, number][] = [];

  // ── Guest side ──
  /** Local pad index -> seat on the host. */
  readonly mySlots = new Map<number, number>();
  /** Seats whose chip this guest put down without picking (don't auto-grab it again). */
  readonly dropped = new Set<number>();
  wantSent = "";
  wantAt = 0;
  readonly handSent = ["null", "null", "null", "null"];
  readonly handAt = [0, 0, 0, 0];
  readonly nmSent = ["null", "null", "null", "null"];
  /** Field vote as the host last broadcast it: [seat, card index] pairs, and whole seconds left (-1: no vote yet). */
  guestVotes: [number, number][] = [];
  voteLeft = -1;
  /** Guest: this machine's own votes (seat -> card), shown until the host's broadcast confirms them. */
  readonly myVotes = new Map<number, number>();
  /** Host is on field select: [pickIndex, mapIndex] to mirror, else null. */
  guestField: [number, number] | null = null;
  netFrames: Frame[] = [];
  readonly netHashes = new Map<number, number>();
  desync = false;
  mathWarned = false;

  // ── Menu ──
  /** A room-list fetch is in flight (browse page). */
  roomFetch = false;

  /** Float-math fingerprint of this browser; peers on a different engine may desync. */
  readonly math = mathPrint();

  seatAt(i: number): RemoteSeat | undefined {
    return this.rseats.find((r) => r.slot === i);
  }

  /** Peer id seated at slot i, or -1. */
  remoteAt(i: number): number {
    return this.seatAt(i)?.peer ?? -1;
  }

  /** Guest: local pad index seated at slot i, or -1. */
  padOfSlot(i: number): number {
    return [...this.mySlots].find(([, v]) => v === i)?.[0] ?? -1;
  }

  resetMatchStreams(): void {
    this.netFrames = [];
    this.netHashes.clear();
    this.outFrames = [];
    this.outHashes = [];
    this.desync = false;
  }
}

// ── Leaving ──

/** Closes the connection and forgets every remote seat and mirrored presence. */
export function leaveNet(app: App, why = ""): void {
  const n = app.net;
  n.link.close();
  n.mode = "off";
  n.rseats.length = 0;
  n.peerNames.clear();
  n.mySlots.clear();
  n.wantSent = "";
  app.menus.netBusy = false;
  app.menus.netStatus = why;
  app.menus.netAddrs = [];
  app.screens.lobby = null;
  n.remoteHands.clear();
  n.remoteSigning.clear();
  n.presSent = "";
  n.handSent.fill("null");
  n.nmSent.fill("null");
  n.guestField = null;
  app.cursors.setGhosts([]);
  app.screens.signing.clear();
  app.screens.fieldWatch = false;
  app.screens.fieldNote = "";
}

// ── Host: seating ──

function freeRemoteSlot(app: App): number {
  const order = [...Array.from({ length: seatsFor(app.mode === "tdm" ? "tdm" : "2v2") - 1 }, (_, k) => k + 1), 0];
  for (const i of order) {
    const s = app.slots[i];
    const local = !!app.pads.players[i]?.connected || i < app.forceJoin;
    if (!local && !app.net.seatAt(i) && (s.open || s.autoCpu)) return i;
  }
  return -1;
}

/** Seats a waiting remote pad in the first free slot (growing 1v1 to 2v2 when needed). */
function seatRemote(app: App, r: RemoteSeat): void {
  if (r.slot >= 0) return;
  const i = freeRemoteSlot(app);
  if (i < 0) return;
  r.slot = i;
  if ([0, 1, 2, 3].filter((k) => app.present(k)).length >= 3 && app.mode === "1v1") setMode(app, "2v2");
  app.slots[i].autoCpu = false;
  makeHuman(app, i);
  app.slots[i].tag = freeLabel(app, i, r.name);
  app.slots[i].tagId = undefined;
  if (i >= 2 && app.mode === "1v1") setMode(app, "2v2");
}

/** A remote seat went away: reopen it on select, or hand the hero to a CPU mid-match. */
function freeSeat(app: App, r: RemoteSeat, now: number): void {
  const i = r.slot;
  r.slot = -1;
  if (i < 0) return;
  app.slots[i].tag = undefined;
  app.slots[i].tagId = undefined;
  if (app.state === "select" || app.state === "map") makeOpen(app, i);
  else if (i < app.players) {
    app.bots[i] = new Bot(i, 0.75, app.seed + i);
    app.people[i] = false;
    linkMates(app);
    app.hud.banner_(`${r.name} LEFT · A CPU TAKES OVER`, now, 2.5);
  }
}

const inMatch = (app: App) => app.state === "match" || app.state === "paused";
const matchPhase = (app: App) => (inMatch(app) || app.state === "results" ? "match" : "lobby");

function fieldName(app: App, random: string): string {
  const fields = app.fields();
  if (app.pickIndex >= fields.length) return random;
  return (maps[fields[app.pickIndex]]?.data.name ?? maps[app.mapIndex].data.name).toUpperCase();
}

/** The host's select screen as guests see it (sent as "lobby" every LOBBY_DT). */
function lobbyView(app: App) {
  const n = app.net;
  return {
    build: __BUILD__,
    math: n.math,
    rules: app.save.data.rules,
    mode: app.mode,
    map: fieldName(app, "RANDOM FIELD"),
    phase: matchPhase(app),
    slots: app.slots.map((s, i): LobbySlot => {
      const remote = n.remoteAt(i);
      return {
        hero: s.hero,
        level: s.level,
        ready: s.ready,
        cpu: s.cpu,
        open: !!s.open,
        name: s.tag ?? null,
        remote: remote >= 0 ? remote : app.pads.players[i]?.connected ? 0 : -1,
        local: n.seatAt(i)?.k ?? 0,
        active: app.slotActive(i),
        commander: app.commanderSlot(i),
        cam: remote >= 0 ? n.remoteCam[i] : (app.save.data.options.zoom?.[i] ?? 0),
        costume: s.costume ?? "",
      };
    }),
  };
}
type LobbyWire = ReturnType<typeof lobbyView>;

// ── Host: messages from guests ──

/** Handles one message a guest sent to the host. */
function fromPeer(app: App, id: number, m: NetMsg): void {
  const n = app.net;
  const slots = app.slots;
  if (m.t === "want") {
    // The set of local pads this guest wants seated: drop seats for pads that left (not mid-match), add new ones.
    const ks = ((m.ks as number[]) ?? []).filter((k) => k >= 0 && k < 4).slice(0, 4);
    for (const r of n.rseats.filter((q) => q.peer === id && !ks.includes(q.k))) {
      if (inMatch(app)) continue;
      freeSeat(app, r, performance.now() / 1000);
      n.rseats.splice(n.rseats.indexOf(r), 1);
    }
    for (const k of ks) {
      if (n.rseats.some((q) => q.peer === id && q.k === k)) continue;
      const base = n.peerNames.get(id) ?? "GUEST";
      const name = ks.length > 1 ? `${base.slice(0, 6)}${k + 1}` : base;
      n.rseats.push({ peer: id, k, slot: -1, name, queue: [], last: { moveX: 0, moveZ: 0 } });
    }
    n.lobbySentAt = 0;
    return;
  }
  const r = n.rseats.find((q) => q.peer === id && q.k === Number(m.k ?? 0));
  if (!r) {
    // Unseated pads of a seated guest may still pause.
    if (
      m.t === "pause" &&
      inMatch(app) &&
      n.rseats.some((q) => q.peer === id) &&
      (app.pausing || app.state === "paused")
    )
      setPaused(app, app.state === "match", "");
    return;
  }
  const key = `${id}:${r.k}`;
  if (m.t === "hand") {
    const h = cleanHand(m.h);
    if (h) n.remoteHands.set(key, h);
    else n.remoteHands.delete(key);
    return;
  }
  if (m.t === "nm") {
    const v = m.v;
    if (Array.isArray(v)) n.remoteSigning.set(key, [v[0] === 1 ? 1 : 0, cleanName(v[1])]);
    else n.remoteSigning.delete(key);
    return;
  }
  const i = r.slot;
  if (m.t === "costume" && i >= 0) {
    const costume = String(m.id ?? "");
    slots[i].costume = costumesOf(slots[i].hero).includes(costume) ? costume : "";
    n.lobbySentAt = 0;
    return;
  }
  if (m.t === "cam" && i >= 0) {
    n.remoteCam[i] = m.on ? 1 : 0;
    n.lobbySentAt = 0;
    return;
  }
  if (m.t === "tag" && i >= 0) {
    // A signed name must not clash with another human's name or save id; otherwise the request is ignored.
    const t = m.tag === null ? "" : cleanTag(String(m.tag ?? ""));
    const tagId = typeof m.id === "string" && /^[0-9a-f-]{36}$/.test(m.id) ? m.id : null;
    const clash =
      !!t && slots.some((s, j) => j !== i && !s.cpu && !s.open && (s.tag === t || (!!tagId && s.tagId === tagId)));
    if (!clash) {
      slots[i].tag = t || freeLabel(app, i, r.name);
      slots[i].tagId = t ? tagId : undefined;
    }
    n.lobbySentAt = 0;
    return;
  }
  if (m.t === "lvl" && (app.state === "select" || app.state === "map")) {
    const to = Number(m.slot);
    if (slots[to]?.cpu && !slots[to].open) {
      slots[to].level = (slots[to].level % 3) + 1;
      n.lobbySentAt = 0;
    }
    return;
  }
  if (m.t === "seat" && app.state === "select") {
    moveRemoteSeat(app, r, Number(m.slot));
    return;
  }
  if (m.t === "cmd" && i >= 0 && inMatch(app)) {
    if (r.queue.length < 30) r.queue.push(m.c as Command);
  } else if (
    m.t === "pick" &&
    i >= 0 &&
    app.state === "select" &&
    !slots[i].ready &&
    roster.includes(String(m.hero)) &&
    !app.commanderSlot(i)
  ) {
    slots[i].hero = String(m.hero);
  } else if (m.t === "ready" && i >= 0 && app.state === "select" && !app.commanderSlot(i)) {
    // Ready = seal placed: the chip goes onto the hero; unready hands it back to the guest's cursor.
    const ready = !!m.on;
    slots[i].ready = ready;
    app.cursors.placeChip(i, ready ? slots[i].hero : null);
    const c = app.cursors.cursors[i];
    if (!ready && c.holding < 0) c.holding = i;
    if (ready && c.holding === i) c.holding = -1;
    app.audio.ui(m.on ? "ok" : "back");
  } else if (m.t === "vote" && i >= 0 && app.state === "map") {
    const k = Number(m.pick);
    if (Number.isInteger(k) && k >= 0 && k <= app.fields().length) {
      if (app.voteAt < 0) app.voteAt = performance.now() / 1000;
      app.votes.set(i, k);
      app.audio.ui("seal");
    }
  } else if (m.t === "pause" && inMatch(app) && (app.pausing || app.state === "paused")) {
    setPaused(app, app.state === "match", r.slot >= 0 ? playerLabel(r.slot) : r.name);
  }
}

/** A guest asked to move its pad from seat r.slot to seat `to` (only into an open / auto-CPU seat). */
function moveRemoteSeat(app: App, r: RemoteSeat, to: number): void {
  const slots = app.slots;
  const i = r.slot;
  const tgt = slots[to];
  const allowed =
    !!tgt &&
    app.slotActive(to) &&
    !app.commanderSlot(to) &&
    to !== i &&
    !app.net.seatAt(to) &&
    !app.pads.players[to]?.connected &&
    (tgt.open || tgt.autoCpu);
  if (!allowed) return;
  const hero = i >= 0 ? slots[i].hero : roster[0];
  const keep = i >= 0 ? ([slots[i].tag, slots[i].tagId] as const) : null;
  if (i >= 0) makeOpen(app, i);
  r.slot = to;
  slots[to].autoCpu = false;
  makeHuman(app, to);
  slots[to].hero = hero;
  slots[to].tag = keep ? keep[0] : freeLabel(app, to, r.name);
  slots[to].tagId = keep ? keep[1] : undefined;
  app.net.lobbySentAt = 0;
  app.audio.ui("move");
}

// ── Guest: messages from the host ──

/** The host's lobby view arrived: mirror it into screens.lobby and leave a finished match when it says so. */
function onLobby(app: App, lv: LobbyWire, now: number): boolean {
  const n = app.net;
  if (lv.build && lv.build !== __BUILD__) {
    leaveNet(app, "THE HOST RUNS ANOTHER VERSION · REFRESH BOTH PAGES");
    app.state = "menu";
    app.menus.open("network");
    return false;
  }
  if (lv.math && lv.math !== n.math && !n.mathWarned) {
    n.mathWarned = true;
    app.hud.banner_("DIFFERENT BROWSER FROM THE HOST · USE THE SAME ONE OR YOU MAY DESYNC", now, 6);
  }
  n.mySlots.clear();
  lv.slots.forEach((s, i) => {
    if (s.remote === n.link.id) n.mySlots.set(s.local ?? 0, i);
  });
  const anyDevice = app.pads.players.some((p) => p.connected);
  const status =
    lv.phase === "match"
      ? ""
      : !anyDevice
        ? "PRESS A BUTTON ON A CONTROLLER OR KEYBOARD TO TAKE A SEAT"
        : !n.mySlots.size
          ? "THE BATTLE IS FULL · WAITING FOR A SEAT"
          : "";
  app.screens.lobby = { ...lv, mine: [...n.mySlots.values()], status };
  if ((app.state === "results" || inMatch(app)) && lv.phase === "lobby") enterLobby(app);
  return true;
}

/** Guest: back to the mirrored lobby (after a match). */
export function enterLobby(app: App): void {
  app.state = "lobby";
  app.screens.set("lobby");
  app.hud.show(false);
  resetAttractWorld(app);
}

/** Host presence: every cursor and name entry on the host's select screen except this guest's own. */
function onPresence(app: App, m: NetMsg): void {
  const n = app.net;
  const mine = new Set(n.mySlots.values());
  const okSlot = (s: number) => Number.isInteger(s) && s >= 0 && s < MAX_PLAYERS && !mine.has(s);
  const hands = (Array.isArray(m.h) ? m.h : []) as unknown[][];
  app.cursors.setGhosts(
    hands.flatMap((e): [number, HandWire][] => {
      const w = cleanHand(e?.[1]);
      return w && okSlot(Number(e?.[0])) ? [[Number(e[0]), w]] : [];
    }),
  );
  app.screens.signing = new Map(
    ((Array.isArray(m.n) ? m.n : []) as unknown[][])
      .filter((e) => okSlot(Number(e?.[0])))
      .map((e): [number, [number, string]] => [Number(e[0]), [e[1] === 1 ? 1 : 0, cleanName(e[2])]]),
  );
  const raw = Array.isArray(m.f) ? (m.f as unknown[]) : null;
  const f = raw ? [Number(raw[0]), Number(raw[1])] : null;
  n.guestField = f && maps[f[1]] ? [f[0], f[1]] : null;
  n.guestVotes = Array.isArray(raw?.[2])
    ? (raw[2] as unknown[][]).filter((v) => Array.isArray(v)).map((v) => [Number(v[0]), Number(v[1])])
    : [];
  n.voteLeft = Number(raw?.[3] ?? -1);
  if (!n.guestField) n.myVotes.clear();
  if (n.guestField && app.state === "lobby" && n.guestField[1] !== app.mapIndex) {
    app.mapIndex = n.guestField[1];
    resetAttractWorld(app);
  }
}

// ── Per frame ──

/** Drains the link, then sends this frame's outgoing presence / lobby traffic. Called once per frame. */
export function pumpNet(app: App, now: number): void {
  const n = app.net;
  for (const m of n.link.drain()) {
    if (m.t === "closed" || m.t === "hostgone") {
      if (n.mode !== "off" || app.menus.netBusy) {
        const why =
          m.t === "hostgone" || n.mode === "peer"
            ? "THE HOST HAS LEFT"
            : app.menus.netBusy
              ? n.link.status || "COULD NOT REACH THE HOST"
              : "LOST THE CONNECTION";
        const onPage = app.state === "menu";
        toMenu(app, why);
        if (!onPage) {
          app.state = "menu";
          app.menus.open("network");
        }
      }
      continue;
    }
    if (m.t === "error") {
      leaveNet(app, String(m.msg));
      continue;
    }
    if (m.t === "hosting") {
      n.mode = "host";
      app.menus.netBusy = false;
      app.menus.netStatus = "";
      app.state = "select";
      enterSelect(app);
      app.screens.set("select");
      continue;
    }
    if (m.t === "welcome") {
      n.mode = "peer";
      n.link.id = Number(m.id);
      app.menus.netBusy = false;
      n.mySlots.clear();
      n.wantSent = "";
      app.state = "lobby";
      app.screens.set("lobby");
      continue;
    }
    if (n.mode === "host") {
      if (m.t === "joined") {
        n.peerNames.set(
          Number(m.id),
          String(m.name ?? "GUEST")
            .toUpperCase()
            .slice(0, 8),
        );
        app.audio.ui("ok");
        n.lobbySentAt = 0;
      } else if (m.t === "left") {
        const id = Number(m.id);
        n.peerNames.delete(id);
        for (const k of [...n.remoteHands.keys(), ...n.remoteSigning.keys()]) {
          if (!k.startsWith(`${id}:`)) continue;
          n.remoteHands.delete(k);
          n.remoteSigning.delete(k);
        }
        for (const r of n.rseats.filter((q) => q.peer === id)) {
          freeSeat(app, r, now);
          n.rseats.splice(n.rseats.indexOf(r), 1);
        }
      } else if (m.t === "from") fromPeer(app, Number(m.id), m.msg as NetMsg);
      continue;
    }
    if (n.mode === "peer") {
      if (m.t === "lobby") {
        if (!onLobby(app, m.view as LobbyWire, now)) continue;
      } else if (m.t === "start") {
        const spec = m.spec as MatchSpec;
        n.mySlots.clear();
        for (const [peer, k, slot] of (m.seats as [number, number, number][]) ?? [])
          if (peer === n.link.id) n.mySlots.set(k, slot);
        if (!n.mySlots.size) continue;
        const mine = new Set(n.mySlots.values());
        const local = Array.from({ length: spec.players }, (_, i) => mine.has(i));
        startNetMatch(
          app,
          spec,
          local,
          local.map(() => false),
        );
      } else if (m.t === "pres") {
        onPresence(app, m);
      } else if (m.t === "fs") {
        for (const f of m.f as Frame[]) n.netFrames.push(f);
        for (const [k, v] of (m.h as [number, number][]) ?? []) n.netHashes.set(k, v);
      } else if (m.t === "pause") {
        if (inMatch(app)) {
          if (m.on) app.menus.openPause(String(m.by ?? ""));
          app.state = m.on ? "paused" : "match";
          app.screens.set(m.on ? "pause" : "none");
        }
      }
    }
  }
  if (n.mode === "peer" && n.link.open) sendGuestPresence(app, now);
  if (n.mode === "host") sendHostPresence(app, now);
  if (n.mode === "host" && now - n.lobbySentAt > LOBBY_DT) sendLobby(app, now);
}

/** Guest -> host: which pads want seats (re-sent every 1.5 s), cursor hands and name entries of seated pads. */
function sendGuestPresence(app: App, now: number): void {
  const n = app.net;
  const ks = JSON.stringify(app.pads.players.map((p, k) => (p.connected ? k : -1)).filter((k) => k >= 0));
  if (ks !== n.wantSent || now - n.wantAt > 1.5) {
    n.wantSent = ks;
    n.wantAt = now;
    n.link.toHost({ t: "want", ks: JSON.parse(ks) });
  }
  for (let k = 0; k < n.handSent.length; k++) {
    const seated = app.state === "lobby" && n.mySlots.has(k);
    const h = seated ? app.cursors.wire(k) : null;
    const hs = JSON.stringify(h);
    if (hs !== n.handSent[k] && now - n.handAt[k] >= PRES_DT) {
      n.handSent[k] = hs;
      n.handAt[k] = now;
      n.link.toHost({ t: "hand", k, h });
    }
    const ne = seated ? app.screens.naming.get(n.mySlots.get(k)!) : undefined;
    const v = ne ? ne.wire() : null;
    const vs = JSON.stringify(v);
    if (vs !== n.nmSent[k]) {
      n.nmSent[k] = vs;
      n.link.toHost({ t: "nm", k, v });
    }
  }
}

/**
 * Host -> guests: every cursor and name entry on select / field select (local and remote), plus the field
 * cursor. Remote hands are also shown locally as ghost cursors. Sent on change (max PRES_DT) or every second.
 */
function sendHostPresence(app: App, now: number): void {
  const n = app.net;
  const live = app.state === "select" || app.state === "map";
  const hands: [number, HandWire][] = [];
  const names: [number, number, string][] = [];
  const ghosts: [number, HandWire][] = [];
  const signing = new Map<number, [number, string]>();
  const slotOf = (key: string) => {
    const [p, k] = key.split(":").map(Number);
    return n.rseats.find((q) => q.peer === p && q.k === k)?.slot ?? -1;
  };
  if (live) {
    app.cursors.cursors.forEach((_, i) => {
      const w = app.cursors.wire(i);
      if (w) hands.push([i, w]);
    });
    for (const [slot, ne] of app.screens.naming) names.push([slot, ...ne.wire()]);
    for (const [key, w] of n.remoteHands) {
      const s = slotOf(key);
      if (s < 0) continue;
      hands.push([s, w]);
      ghosts.push([s, w]);
    }
    for (const [key, v] of n.remoteSigning) {
      const s = slotOf(key);
      if (s < 0) continue;
      names.push([s, ...v]);
      signing.set(s, v);
    }
  }
  app.cursors.setGhosts(ghosts);
  app.screens.signing = signing;
  const left = app.voteAt < 0 ? -1 : Math.max(0, Math.ceil(5 - (now - app.voteAt)));
  const field = app.state === "map" ? [app.pickIndex, app.mapIndex, [...app.votes], left] : null;
  const s = JSON.stringify([hands, names, field]);
  if (n.peerNames.size && ((s !== n.presSent && now - n.presAt >= PRES_DT) || now - n.presAt > 1)) {
    n.presSent = s;
    n.presAt = now;
    n.link.toPeer("all", { t: "pres", h: hands, n: names, f: field });
  }
}

/** Host: room info for the server's battle list, re-seating on select, and the lobby view broadcast. */
function sendLobby(app: App, now: number): void {
  const n = app.net;
  n.lobbySentAt = now;
  const seated = n.rseats.filter((r) => r.slot >= 0).length;
  const localHumans = app.slots.filter((s, i) => !s.cpu && !s.open && app.slotActive(i) && n.remoteAt(i) < 0).length;
  n.link.meta({
    name: `${(app.save.tagNames()[0] ?? "HOST").toUpperCase()}'S BATTLE`,
    mode: app.mode === "ffa" ? "FREE FOR ALL" : app.mode === "2v2" ? "2 VS 2" : "1 VS 1",
    map: fieldName(app, "RANDOM"),
    humans: Math.max(1, localHumans + seated),
    seats: seatsFor(app.mode),
    phase: matchPhase(app),
  });
  if (app.state === "select") {
    // A local pad plugged into a remote guest's seat takes it back; then seat anyone still waiting.
    for (const r of n.rseats) if (r.slot >= 0 && app.pads.players[r.slot].connected) freeSeat(app, r, now);
    for (const r of n.rseats) seatRemote(app, r);
  }
  n.link.toPeer("all", { t: "lobby", view: lobbyView(app) });
}

// ── Lockstep ──

/**
 * Guest: steps the world on the host's frames. Normally one tick per world.dt of real time, but when frames pile
 * up (more than 2 buffered) it catches up, at most MAX_CATCHUP ticks per frame. Verifies host hashes.
 */
export function stepPeer(app: App, dt: number, now: number): void {
  const n = app.net;
  const w = app.world;
  app.acc += dt;
  let ticks = 0;
  while (n.netFrames.length && (app.acc >= w.dt || n.netFrames.length > 2) && ticks < MAX_CATCHUP) {
    const f = n.netFrames.shift()!;
    if (f.k !== w.tick) n.desync = true;
    w.step(f.c);
    const want = n.netHashes.get(w.tick);
    if (want !== undefined) {
      if (want !== worldHash(w)) {
        if (!n.desync) app.hud.banner_("OUT OF SYNC WITH THE HOST · REJOIN", now, 4);
        n.desync = true;
      }
      n.netHashes.delete(w.tick);
    }
    app.acc = Math.max(0, app.acc - w.dt);
    ticks++;
  }
  if (!n.netFrames.length) app.acc = Math.min(app.acc, w.dt);
}

/** Host: record the packed commands of a tick for broadcast (and a hash every HASH_EVERY ticks). */
export function recordHostTick(app: App, cmds: Command[]): void {
  app.net.outFrames.push({ k: app.world.tick, c: cmds });
}

export function afterHostTick(app: App): void {
  const w = app.world;
  if (w.tick % HASH_EVERY === 0) app.net.outHashes.push([w.tick, worldHash(w)]);
}

/** Host: send this frame's ticks to every guest. */
export function flushHostFrames(app: App): void {
  const n = app.net;
  if (!n.outFrames.length) return;
  n.link.toPeer("all", { t: "fs", f: n.outFrames, h: n.outHashes });
  n.outFrames = [];
  n.outHashes = [];
}
