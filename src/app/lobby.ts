// Guest lobby controller (state "lobby"): an online guest's view of the host's champion select.
// The host owns the seats; this screen draws the mirrored LobbyView (screens.lobby, refreshed by net.ts) and turns
// the guest's own cursor actions into requests ("pick", "ready", "seat", "cam", "tag", "lvl", "costume"),
// applying them optimistically to the local copy until the next lobby broadcast. A guest may only act on the
// seats its own pads sit in (net.mySlots). While the host is on field select, the guest watches it read-only.
import type { SelectSlot } from "../ui/screens";
import type { App } from "./app";
import { data, roster } from "./assets";
import { cStickFlick, freezeNamingCursors, isNaming, nextCostume, openNaming, runNaming } from "./select";
import { toMenu } from "./match";

export function updateLobby(app: App, now: number, dt: number): void {
  const { cursors, screens, net } = app;
  const lb = screens.lobby;
  cursors.setScale(app.uiCanvas.w, app.uiCanvas.h);
  cursors.tagOf = (k) => net.mySlots.get(k) ?? -1;
  screens.set(net.guestField && lb ? "map" : "lobby");
  if (net.guestField) for (const c of cursors.cursors) c.holding = -1;
  if (!lb) return;
  const mine = () => [...net.mySlots.values()];
  const held = (i: number) => cursors.cursors.some((c) => c.active && c.holding === i);
  const picking = lb.phase === "lobby";

  // Chips follow the host's seats; this guest's camera flags come from its own save.
  lb.slots.forEach((sl, i) => {
    if (!held(i)) cursors.placeChip(i, sl.ready && !sl.open && sl.active && !sl.commander ? sl.hero : null);
    screens.zoomModes[i] = mine().includes(i) ? (app.save.data.options.zoom?.[i] ?? 0) : (sl.cam ?? 0);
  });
  // Our unready seats put the chip back in our hand (unless we deliberately dropped it).
  for (const [k, i] of net.mySlots) {
    const sl = lb.slots[i];
    if (picking && !net.guestField && !sl.ready && !sl.commander && !held(i) && !net.dropped.has(i))
      cursors.cursors[k].holding = i;
    if (sl.ready) net.dropped.delete(i);
  }
  for (const c of cursors.cursors) if (c.holding >= 0 && !mine().includes(c.holding)) c.holding = -1;

  for (const [k, i] of net.mySlots) {
    const dir = cStickFlick(app.pads.players[k]);
    if (dir && picking && !isNaming(app, k)) screens.costumeShownUntil[i] = now + 2.5;
    if (dir && dir !== app.costumeFlick[k] && picking && !isNaming(app, k)) {
      const next = nextCostume(lb.slots[i].hero, lb.slots[i].costume, dir);
      if (next !== null) {
        lb.slots[i].costume = next;
        net.link.toHost({ t: "costume", k, id: next });
        app.audio.ui("move");
      }
    }
    app.costumeFlick[k] = dir;
  }
  runNaming(app, (slot) => net.padOfSlot(slot), now);

  const canHold = (slot: number, by: number) =>
    picking && !net.guestField && net.mySlots.get(by) === slot && !lb.slots[slot].commander;
  const acts = cursors.update(freezeNamingCursors(app, app.pads.players), dt, now, canHold);
  let leave = false;
  for (const act of acts) {
    if (act.type === "hover") {
      const k = net.padOfSlot(act.slot);
      if (k >= 0 && lb.slots[act.slot].hero !== act.hero) {
        lb.slots[act.slot].hero = act.hero;
        net.link.toHost({ t: "pick", k, hero: act.hero });
        app.audio.ui("move");
      }
    } else if (act.type === "place") {
      const k = net.padOfSlot(act.slot);
      if (k < 0) continue;
      lb.slots[act.slot].hero = act.hero;
      lb.slots[act.slot].ready = true;
      net.link.toHost({ t: "pick", k, hero: act.hero });
      net.link.toHost({ t: "ready", k, on: true });
      app.audio.ui("seal");
      app.audio.heroCue(act.hero, true);
    } else if (act.type === "pick") {
      const k = net.padOfSlot(act.slot);
      if (k < 0) continue;
      lb.slots[act.slot].ready = false;
      net.link.toHost({ t: "ready", k, on: false });
      app.audio.ui("peel");
    } else if (act.type === "button") lobbyButton(app, act.id, act.by);
    else if (act.type === "back") {
      // B drops the chip in hand (remembered so it isn't re-grabbed); with nothing in hand it leaves.
      const c = cursors.cursors[act.by];
      if (c?.holding >= 0) {
        net.dropped.add(c.holding);
        c.holding = -1;
      } else leave = true;
    }
  }
  if (leave) {
    app.audio.ui("back");
    toMenu(app, "");
    app.state = "menu";
    app.menus.open("network");
    return;
  }
  const view: SelectSlot[] = lb.slots.map((sl, i) => ({
    joined: !sl.cpu && !sl.open,
    ready: sl.ready,
    hero: sl.hero,
    cpu: sl.cpu,
    level: sl.level ?? 2,
    open: sl.open,
    tag: sl.name,
    local: sl.remote === net.link.id && net.mySlots.get(sl.local ?? 0) === i,
    costume: sl.costume,
  }));
  screens.updateSelect(view, data.heroes.heroes, roster, lb.mode, lb.rules.partners === 1);
  screens.hosting = false;
}

/** A guest cursor clicked a lobby button. Only seats owned by the clicking pad respond (cam, tag). */
function lobbyButton(app: App, buttonId: string, by: number): void {
  const { net } = app;
  const lb = app.screens.lobby!;
  const [id, arg] = buttonId.split(":");
  const i = Number(arg);
  if (id === "map" && net.guestField) {
    // Watching the host's field select: a field card is this pad's vote.
    const slot = net.mySlots.get(by);
    if (slot === undefined) return;
    net.link.toHost({ t: "vote", pick: i, k: by });
    net.myVotes.set(slot, i);
    app.audio.ui("seal");
    return;
  }
  if (id === "cam" && net.mySlots.get(by) === i) {
    const on = app.toggleZoom(i);
    lb.slots[i].cam = on;
    net.link.toHost({ t: "cam", k: Math.max(0, net.padOfSlot(i)), on: !!on });
    app.audio.ui("ok");
  } else if (id === "cam") {
    app.audio.ui("back");
  } else if (id === "pen" && net.mySlots.get(by) === i && !app.screens.naming.has(i)) {
    openNaming(app, i, lb.slots[i]?.name);
  } else if (id === "lvl" && lb.slots[i]?.cpu) {
    net.link.toHost({ t: "lvl", k: [...net.mySlots.keys()][0] ?? 0, slot: i });
    app.audio.ui("move");
  } else if (id === "take" && net.mySlots.has(by)) {
    const from = net.mySlots.get(by)!;
    app.cursors.cursors[by].holding = -1;
    net.dropped.delete(from);
    net.link.toHost({ t: "seat", k: by, slot: i });
    app.audio.ui("ok");
  } else if (id === "unplug") {
    const k = net.padOfSlot(i);
    if (k >= 0) {
      app.pads.release(k);
      app.audio.ui("back");
    }
  }
}
