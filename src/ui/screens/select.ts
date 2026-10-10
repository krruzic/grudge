// Champion select screen (also the online guest lobby, which draws the host's seats read-only where needed).
//
// Top: mode / camera ribbons and one card per champion; cursors drag their seat's chip (seal) onto a card to
// pick it. Below: one seat card per active seat showing the seat's kind plaque (PLAYER / CPU with difficulty
// gems / COMMANDER, camera toggle), name plate, the hero on its painted stage with the costume strip, the
// evolution tree and ability glyphs. A human seat that hasn't placed its seal shows "PICK A CHAMPION" instead.
// Mouse targets ("hero:<id>", "kind:<i>", "lvl:<i>", "cam:<i>", "pen:<i>", "sit:<i>", "go", ...) go into the
// cursors' hit list; app/select.ts turns cursor actions on them into seat changes.
import { RANDOM_PICK } from "../../game/picks";
import { CAMERA_NAMES } from "../../game/save";
import { costumesOf } from "../../render/costumes";
import { drawPlain, textWidth } from "../font";
import { abilityIcon } from "../icons";
import { drawSigning } from "../nameEntry";
import { bottomPrompt } from "../prompts";
import {
  artTitle,
  band,
  beam,
  boardBg,
  card,
  inset,
  nameImage,
  paintedText,
  ribbon,
  shadowText,
  smoothImage,
  texturedRect,
  waxSeal,
  woodFloor,
} from "../uiPaint";
import type { SelectSlot, Screens } from "../screens";
import { BROWN, INK, MODE_NAME, TEAM_BRIGHT, TEAM_CLOTH, TEAM_FIELD, TEAM_TEXT, center } from "./common";
import { classGlyph, costumeIcon, drawTree, hasTree, heroGlyph, stageArt, uiGlyph } from "./selectArt";
import { chipColor } from "../cursor";

/** A cursor (local, or an online player's mirrored one) is hovering mouse target `id`. */
const hovered = (s: Screens, id: string) =>
  !!s.cursors?.cursors.some((c) => c.active && c.hover === id) || !!s.cursors?.ghosts.some((g) => g.wire[0] === id);

/** Whoever holds seat i's chip (here or online) is hovering a champion with it. */
const previewing = (s: Screens, i: number) =>
  !!s.cursors?.cursors.some((c) => c.active && c.holding === i && c.hover.startsWith("hero:")) ||
  !!s.cursors?.ghosts.some((g) => g.wire[5] === i && g.wire[0].startsWith("hero:"));

/** Seat i's costume strip is open: flicked here, or by an online player's hand. */
const stripOpen = (s: Screens, i: number) =>
  performance.now() / 1000 < (s.costumeShownUntil[i] ?? 0) || !!s.cursors?.ghosts.some((g) => g.wire[7] === i);

export function drawSelect(s: Screens, ctx: CanvasRenderingContext2D, W: number, H: number, blink: boolean): void {
  boardBg(ctx, W, H);
  const floorY = H - 20;
  woodFloor(ctx, floorY, W, H);
  beam(ctx, 4, 2, W - 8, 17);
  artTitle(ctx, "t_champion", "CHOOSE YOUR CHAMPION", W / 2, 3, 14);
  // Mode ribbon (click: cycle 1v1 / 2v2 / FFA) and camera ribbon (click: shared / split view).
  const mw = s.mode === "ffa" ? 70 : s.mode === "ffadm" ? 84 : 46;
  const modeArt = s.training ? null : nameImage(`t_${s.mode}`);
  ribbon(ctx, W - 15 - mw / 2, 4, mw, 11, s.training ? "TRAINING" : MODE_NAME[s.mode], 0.55, undefined, modeArt);
  s.hit("mode", W - 15 - mw / 2 - mw / 2 - 5, 1, mw + 10, 17);
  const cam = CAMERA_NAMES[s.cameraMode] ?? CAMERA_NAMES[1];
  const cw = Math.max(64, textWidth(cam, 0.5) + 18);
  ribbon(ctx, 8 + cw / 2, 4, cw, 11, cam, 0.5);
  s.hit("camera", 4, 1, cw + 8, 17);

  // The roster takes one row of cards, two once there are more than nine champions; seats start below it.
  const top = drawRosterRow(s, ctx, W) + 6;

  const eight = s.mode === "tdm" || s.mode === "ffadm";
  if (eight) drawTdmSeats(s, ctx, W, top, floorY - top - 6);
  // Seat cards: 2v2 orders them blue, blue, red, red.
  const order = eight ? [] : s.mode === "ffa" ? [0, 1, 2, 3] : s.twoVtwo ? [0, 2, 1, 3] : [0, 1];
  const n = order.length;
  const bw = s.twoVtwo ? Math.min(72, Math.floor((W - 30) / n) - 14) : Math.min(118, Math.floor(W * 0.3));
  const bgap = s.twoVtwo ? Math.floor((W - bw * n) / (n + 1)) : Math.floor((W - bw * 2) / 3);
  const by = top;
  const bh = floorY - by - 6;
  order.forEach((i, k) => drawSeatCard(s, ctx, i, bgap + k * (bw + bgap), by, bw, bh));
  if (!s.twoVtwo) drawAddCpuCards(s, ctx, W, by);
  const naming = [...s.naming.keys()].find((i) => eight && s.slots[i]);
  if (naming !== undefined) {
    // Compact deathmatch cards are too small for the keyboard: it opens over that team's half.
    const half = Math.floor(W / 2);
    const nx = naming % 2 ? half + 6 : 6;
    s.naming.get(naming)!.draw(ctx, nx, 92, half - 12, floorY - 96, performance.now() / 1000);
  }

  bottomPrompt(
    ctx,
    W,
    H,
    s.peer
      ? [
          ["A", "TAKE / PLACE SEAL"],
          ["B", "LEAVE"],
        ]
      : [
          ["A", "TAKE / PLACE SEAL"],
          ["B", "BACK"],
          ["S", "START"],
        ],
  );
  if (s.peer && s.lobby) {
    const lb = s.lobby;
    const r = lb.rules;
    const t =
      lb.status ||
      (lb.phase === "match"
        ? "A MATCH IS UNDER WAY · YOU'LL JOIN THE NEXT ONE"
        : lb.phase === "results"
          ? "THE HOST IS ON THE RESULTS SCREEN · THE LOBBY OPENS WHEN THEY CONTINUE"
          : `${lb.map} · ${r.minutes} MIN · ${r.popCap} SOLDIERS · GOLD X${r.goldRate} · WAITING FOR THE HOST`);
    if (blink || !lb.status) center(ctx, W, t, floorY - 10, "#fff0c0", 0.55);
  }
  if (s.openHint && !s.peer) drawOpenHint(s, ctx, W);
}

/**
 * Smash-style roster grid: one portrait tile per champion, edge to edge (one row, two once the roster passes
 * nine), no names, cards or pins. A tile's border takes the colours of the seals placed on it, else of the hands
 * pointing at it. Returns the y where the grid ends.
 */
function drawRosterRow(s: Screens, ctx: CanvasRenderingContext2D, W: number): number {
  // Every champion, then the RANDOM tile.
  const tiles = [...s.roster, RANDOM_PICK];
  const all = tiles.length;
  const rows = all > 9 ? 2 : 1;
  const per = Math.ceil(all / rows);
  const gap = 2;
  const tw = Math.max(22, Math.min(rows > 1 ? 40 : 46, Math.floor((W - 40 - (per - 1) * gap) / per)));
  const th = Math.round(tw * 0.82);
  const top = 23;
  tiles.forEach((type, k) => {
    const row = Math.floor(k / per);
    const inRow = Math.min(per, all - row * per);
    const col = k - row * per;
    const gx = Math.round((W - (inRow * tw + (inRow - 1) * gap)) / 2);
    const x = gx + col * (tw + gap);
    const y = top + row * (th + gap);
    const hot = hovered(s, `hero:${type}`);
    s.hit(`hero:${type}`, x, y, tw, th);
    // Chips placed on this hero are laid out inside this tile (Screens.drawChips).
    s.shieldAt.set(type, { x: x + tw / 2, y: y + th / 2, w: tw, h: th });
    const sealed = s.slots.flatMap((sl, i) =>
      sl?.ready && !sl.open && sl.hero === type && (i < 2 || (s.twoVtwo && s.championSeat(i)))
        ? [chipColor(i, sl.cpu)]
        : [],
    );
    const hands = s.cursors?.handsOn(`hero:${type}`) ?? [];
    const ring = sealed.length ? sealed : hands;
    ctx.fillStyle = "#120c08";
    ctx.fillRect(x - 1, y - 1, tw + 2, th + 2);
    if (type === RANDOM_PICK) {
      randomTile(ctx, x, y, tw, th, sealed.length > 0 || hot);
      const cols = [...new Set(ring)];
      if (cols.length) tileBorder(ctx, x, y, tw, th, cols);
      else if (hot) {
        ctx.strokeStyle = "#f0d070";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
      }
      return;
    }
    const icon = s.portraits?.icon(type);
    if (icon) {
      // Cover-crop the square portrait to the tile, biased toward the face.
      const iw = (icon as { width: number }).width;
      const ih = (icon as { height: number }).height;
      const sw = iw;
      const sh = Math.min(ih, (iw * th) / tw);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.globalAlpha = sealed.length || hot ? 1 : 0.88;
      ctx.drawImage(icon as CanvasImageSource, 0, (ih - sh) * 0.3, sw, sh, x, y, tw, th);
      ctx.restore();
    }
    // Class glyph in the tile's bottom-left corner.
    const gs = Math.max(7, Math.round(tw * 0.24));
    ctx.fillStyle = "rgba(18,12,8,0.55)";
    ctx.beginPath();
    ctx.arc(x + gs / 2 + 1.5, y + th - gs / 2 - 1.5, gs * 0.62, 0, Math.PI * 2);
    ctx.fill();
    classGlyph(ctx, s.heroes[type]?.class, x + gs / 2 + 1.5, y + th - gs / 2 - 1.5, gs, "#f4e2b0");
    // Border: one band round the tile, split into a run per colour (every CPU is the same grey, so it's one run).
    // Stacking a stripe per seal grew the frame outward over the neighbouring tiles.
    const cols = [...new Set(ring)];
    if (cols.length) tileBorder(ctx, x, y, tw, th, cols);
    else if (hot) {
      ctx.strokeStyle = "#f0d070";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
    }
  });
  return top + rows * (th + gap) + 2;
}

/** A seat's stage while it is on RANDOM: who it'll be is rolled when the match starts. */
function randomStage(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  band(ctx, x, y, w, h, "#000000", 0.35);
  const qs = Math.min(3, h / 22);
  paintedText(ctx, "?", x + w / 2, y + h / 2 - 6 * qs, "#f0c030", qs);
}

/** The RANDOM tile: a big "?" on dark cloth. */
function randomTile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: boolean): void {
  texturedRect(ctx, "cloth", x, y, w, h, lit ? "#5a3a24" : "#3a281c", 0, 0.8);
  const qs = h / 15;
  paintedText(ctx, "?", x + w / 2, y + h / 2 - 5.5 * qs, lit ? "#ffd860" : "#e0b850", qs);
  const ls = Math.min(0.42, (w - 4) / Math.max(1, textWidth("RANDOM", 1, true)));
  drawPlain(ctx, "RANDOM", x + w / 2 - textWidth("RANDOM", ls, true) / 2, y + h - 7, "#f0e0b8", ls, true);
}

/** A 1.5 px frame just inside a tile, its perimeter shared out in equal runs, one per colour (clockwise from top-left). */
function tileBorder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cols: string[]): void {
  const l = x + 0.75;
  const t = y + 0.75;
  const r = x + w - 0.75;
  const b = y + h - 0.75;
  const pts: [number, number][] = [
    [l, t],
    [r, t],
    [r, b],
    [l, b],
    [l, t],
  ];
  const sides = [r - l, b - t, r - l, b - t];
  const per = (2 * (r - l + b - t)) / cols.length;
  // Point at distance d along the perimeter.
  const at = (d: number): [number, number] => {
    let k = 0;
    while (k < 3 && d > sides[k]) d -= sides[k++];
    const [ax, ay] = pts[k];
    const [bx, by] = pts[k + 1];
    const f = Math.min(1, d / sides[k]);
    return [ax + (bx - ax) * f, ay + (by - ay) * f];
  };
  // Perimeter distances of the corners, so each run bends round them.
  const corners = [sides[0], sides[0] + sides[1], sides[0] + sides[1] + sides[2]];
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "miter";
  cols.forEach((c, i) => {
    const d0 = i * per;
    const d1 = (i + 1) * per;
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.moveTo(...at(d0));
    for (const cd of corners) if (cd > d0 && cd < d1) ctx.lineTo(...at(cd));
    ctx.lineTo(...at(d1));
    ctx.stroke();
  });
  ctx.restore();
}

/** 1v1: "+ ADD CPU" cards at the sides switch to 2v2 (not for online guests). */
function drawAddCpuCards(s: Screens, ctx: CanvasRenderingContext2D, W: number, by: number): void {
  for (const [i, bx] of [
    [2, 12],
    [3, W - 12 - 44],
  ] as const) {
    s.portraits?.drop(i);
    if (s.peer) continue;
    const hot = hovered(s, `add:${i}`);
    card(ctx, bx, by + 4, 44, 34, hot ? 0 : i === 2 ? -0.04 : 0.04, hot ? "#c81818" : "#8a8a90", () => {
      for (const [line, dy] of [
        ["+ ADD", 10],
        ["CPU", 19],
      ] as const)
        drawPlain(ctx, line, 22 - textWidth(line, 0.55, true) / 2, dy, hot ? "#8a1810" : "#6a4424", 0.55, true);
    });
    s.hit(`add:${i}`, bx - 2, by + 2, 48, 38);
  }
}

function drawOpenHint(s: Screens, ctx: CanvasRenderingContext2D, W: number): void {
  const sw = Math.min(300, W - 60);
  ctx.save();
  card(ctx, W / 2 - sw / 2, 124, sw, 32, 0.01, "#c81818", () => {
    const t1 = "SEATS STILL OPEN";
    drawPlain(ctx, t1, sw / 2 - textWidth(t1, 1.05, true) / 2, 5, BROWN, 1.05, true);
    const t2 = s.twoVtwo ? "WAIT FOR PLAYERS, + ADD CPU, OR SWITCH TO 1 VS 1" : "WAIT FOR A PLAYER OR + ADD CPU";
    drawPlain(ctx, t2, sw / 2 - textWidth(t2, 0.55, true) / 2, 20, "#8a1810", 0.55, true);
  });
  ctx.restore();
}

/** "THE GRUDGE IS SWORN!" swallowtail banner hung from a rod over a dimmed screen; clicking it starts. */
export function drawReadyBanner(
  s: Screens,
  ctx: CanvasRenderingContext2D,
  W: number,
  _H: number,
  blink: boolean,
): void {
  const bw = Math.min(250, W - 70);
  const bx = W / 2 - bw / 2;
  // Like Smash: the banner (and its dimming) covers only the champion row, so seat cards stay usable below it.
  const by = 36;
  const bh = 46;
  s.hit("go", bx, by, bw, bh);
  ctx.save();
  const dim = ctx.createLinearGradient(0, 8, 0, 104);
  dim.addColorStop(0, "rgba(10, 6, 2, 0)");
  dim.addColorStop(0.2, "rgba(10, 6, 2, 0.45)");
  dim.addColorStop(0.75, "rgba(10, 6, 2, 0.45)");
  dim.addColorStop(1, "rgba(10, 6, 2, 0)");
  ctx.fillStyle = dim;
  ctx.fillRect(0, 8, W, 96);
  const cloth = () => {
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + bw, by);
    ctx.lineTo(bx + bw, by + bh);
    ctx.lineTo(bx + bw * 0.75, by + bh - 7);
    ctx.lineTo(bx + bw / 2, by + bh + 2);
    ctx.lineTo(bx + bw * 0.25, by + bh - 7);
    ctx.lineTo(bx, by + bh);
    ctx.closePath();
  };
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  cloth();
  ctx.fillStyle = "#5a0e0c";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.save();
  cloth();
  ctx.clip();
  texturedRect(ctx, "banner", bx, by, bw, bh + 4, "#8a1a16", 0, 0.6);
  const gr = ctx.createLinearGradient(0, by, 0, by + bh);
  gr.addColorStop(0, "rgba(255, 220, 160, 0.12)");
  gr.addColorStop(1, "rgba(0, 0, 0, 0.35)");
  ctx.fillStyle = gr;
  ctx.fillRect(bx, by, bw, bh + 4);
  ctx.restore();
  // Gold trim inset from the edge.
  ctx.beginPath();
  ctx.moveTo(bx + 3, by + 4);
  ctx.lineTo(bx + bw - 3, by + 4);
  ctx.lineTo(bx + bw - 3, by + bh - 4);
  ctx.lineTo(bx + bw * 0.75, by + bh - 10);
  ctx.lineTo(bx + bw / 2, by + bh - 1.5);
  ctx.lineTo(bx + bw * 0.25, by + bh - 10);
  ctx.lineTo(bx + 3, by + bh - 4);
  ctx.closePath();
  ctx.strokeStyle = "#d8a840";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Rod with brass knobs.
  ctx.fillStyle = BROWN;
  ctx.fillRect(bx - 8, by - 4, bw + 16, 5);
  ctx.fillStyle = "#7a5430";
  ctx.fillRect(bx - 8, by - 4, bw + 16, 2);
  for (const fx of [bx - 10, bx + bw + 10]) {
    ctx.beginPath();
    ctx.arc(fx, by - 1.5, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#e0b850";
    ctx.fill();
    ctx.strokeStyle = "#5a3a10";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.restore();
  artTitle(ctx, "!THE GRUDGE IS SWORN!", "THE GRUDGE IS SWORN!", W / 2, by + 5, 17);
  if (blink) {
    const p = "PRESS START";
    drawPlain(ctx, p, W / 2 - textWidth(p, 0.7, true) / 2, by + 27, "#f4e2b0", 0.7, true);
  }
}

/** Small wooden button centred at cx ("SIT HERE", "+ ADD CPU"). */
function woodButton(
  s: Screens,
  ctx: CanvasRenderingContext2D,
  bid: string,
  t: string,
  cx: number,
  by: number,
  bw = 50,
): void {
  const hot = hovered(s, bid);
  const half = bw / 2;
  const ts = Math.min(0.55, (bw - 4) / Math.max(1, textWidth(t, 1)));
  ctx.fillStyle = INK;
  ctx.fillRect(cx - half - 1, by - 1, bw + 2, 13);
  texturedRect(ctx, "wood", cx - half, by, bw, 11, hot ? "#b08050" : "#6a4a30", 0, 0.8);
  shadowText(ctx, t, cx - textWidth(t, ts) / 2, by + 2 + (0.55 - ts) * 6, hot ? "#fff4b0" : "#e8d8b8", ts);
  s.hit(bid, cx - half - 3, by - 3, bw + 6, 17);
}

// ── Team deathmatch seats ──

/** Eight compact seat cards: blue's four in a 2x2 grid on the left half, red's on the right. */
function drawTdmSeats(s: Screens, ctx: CanvasRenderingContext2D, W: number, y0: number, h: number): void {
  const half = Math.floor(W / 2);
  const gap = 6;
  const cw = Math.floor((half - gap * 3) / 2);
  const ch = Math.floor((h - gap) / 2);
  for (let i = 0; i < 8; i++) {
    // Team deathmatch: blue's seats left, red's right. FFA deathmatch: same grid, seats in order.
    const team = i % 2;
    const k = Math.floor(i / 2);
    const x = team * half + gap + (k % 2) * (cw + gap);
    const y = y0 + Math.floor(k / 2) * (ch + gap);
    drawCompactSeat(s, ctx, i, x, y, cw, ch);
  }
}

/**
 * One deathmatch seat: champion portrait on the left, label / champion name on the right, the kind plaque
 * (pencil, PLAYER / CPU, camera or CPU level) along the bottom. Open seats offer SIT HERE (+ ADD CPU).
 */
function drawCompactSeat(
  s: Screens,
  ctx: CanvasRenderingContext2D,
  i: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const sl = s.slots[i];
  if (!sl) return;
  const team = s.teamOf(i);
  const ink = TEAM_TEXT[team];
  if (sl.open) {
    s.portraits?.drop(i);
    card(ctx, x, y, w, h, 0, TEAM_BRIGHT[team], () => {
      const t = `SEAT ${i + 1} · OPEN`;
      drawPlain(ctx, t, w / 2 - textWidth(t, 0.55, true) / 2, 6, ink, 0.55, true);
    });
    const btns: [string, string][] = s.peer
      ? [[`take:${i}`, "SIT HERE"]]
      : [
          [`sit:${i}`, "SIT HERE"],
          [`seatcpu:${i}`, "+ ADD CPU"],
        ];
    btns.forEach(([bid, t], k) => woodButton(s, ctx, bid, t, x + w / 2, y + 18 + k * 15));
    return;
  }
  const human = sl.joined && !sl.cpu;
  const naming = s.naming.has(i);
  const tagged = !sl.cpu && !!sl.tag;
  const label = tagged ? sl.tag! : `P${i + 1}`;
  const unsealed = !sl.ready && !naming;
  const preview = unsealed && previewing(s, i);
  const ps = h - 16;
  const showHero = !unsealed || preview;
  const rnd = sl.hero === RANDOM_PICK;
  card(ctx, x, y, w, h, 0, chipColor(i, sl.cpu), () => {
    inset(ctx, 4, 4, ps, ps, "#2a2018");
    texturedRect(ctx, "cloth", 4, 4, ps, ps, TEAM_CLOTH[team], 0, 0.7);
    if (showHero && rnd) randomStage(ctx, 4, 4, ps, ps);
    else if (!showHero) {
      band(ctx, 4, 4, ps, ps, "#000000", 0.35);
      drawPlain(ctx, "?", 4 + ps / 2 - textWidth("?", 1.2, true) / 2, 4 + ps / 2 - 6, "#e8d8b8", 1.2, true);
    }
    const rx = ps + 8;
    const rw = w - rx - 3;
    const ls = Math.min(0.75, rw / Math.max(1, textWidth(label, 1, true)));
    drawPlain(ctx, label, rx, 6, ink, ls, true);
    const name = unsealed && !preview ? "CHOOSE" : (s.heroes[sl.hero]?.name ?? sl.hero).toUpperCase();
    const ns = Math.min(0.55, rw / Math.max(1, textWidth(name, 1, true)));
    drawPlain(ctx, name, rx, 17, BROWN, ns, true);
  });
  // X: a local human unplugs; the host can open a CPU's seat (so someone online can sit there).
  const xid = human && sl.local ? `unplug:${i}` : sl.cpu && s.hosting ? `seatopen:${i}` : "";
  if (xid) {
    const bid = xid;
    const hot = hovered(s, bid);
    const ux = x + w - 10;
    const uy = y + 2;
    ctx.fillStyle = "#1a120a";
    ctx.fillRect(ux - 1, uy - 1, 8, 8);
    ctx.fillStyle = hot ? "#b83020" : "#6a3a24";
    ctx.fillRect(ux, uy, 6, 6);
    shadowText(ctx, "X", ux + 3 - textWidth("X", 0.45) / 2, uy + 0.5, hot ? "#fff4b0" : "#e8d8b8", 0.45);
    s.hit(bid, ux - 2, uy - 2, 10, 10);
  }
  if (naming) return;
  const sg = !sl.cpu ? s.signing.get(i) : undefined;
  if (sg) {
    drawSigning(ctx, x + 2, y + 2, w - 4, h - 4, sg[0] === 1, sg[1], performance.now() / 1000);
    return;
  }
  // The champion's live stage in the portrait frame, like the big cards.
  if (showHero && !rnd) drawStage(s, ctx, i, sl, team, x + 4, y + 4, ps, ps, preview);
  else s.portraits?.drop(i);
  if (sl.ready && human) waxSeal(ctx, x + ps, y + ps - 2, 5, chipColor(i, false), "combo");
  // Costumes: small clickable icons under the name for a human's own card while their hand is over it, or for any
  // card whose costume is being flicked (a CPU's by whoever holds its chip).
  const own = s.cursors?.cursors[i];
  const ownHand = !!own?.active && own.x >= x && own.x <= x + w && own.y >= y && own.y <= y + h;
  const flicking = stripOpen(s, i);
  // Anyone may dress a CPU, so its icons show whenever any hand is over its card.
  const anyHand =
    sl.cpu && !!s.cursors?.cursors.some((c) => c.active && c.x >= x && c.x <= x + w && c.y >= y && c.y <= y + h);
  const cl = showHero && ((ownHand && !sl.cpu) || anyHand || flicking) ? costumesOf(sl.hero) : [];
  if (cl.length > 1) {
    const rx = x + ps + 8;
    const sz = Math.min(11, (w - ps - 11) / cl.length - 1.5);
    const cur = Math.max(0, cl.indexOf(sl.costume ?? ""));
    cl.forEach((c, k) => {
      const ix = rx + k * (sz + 1.5);
      const iy = y + 26;
      const ic = costumeIcon(sl.hero, c);
      const bid = `cos:${i}:${k}`;
      const hot = hovered(s, bid);
      ctx.fillStyle = k === cur ? "#f4e2b0" : hot ? "#c89050" : "rgba(40,24,10,0.6)";
      ctx.fillRect(ix - 1, iy - 1, sz + 2, sz + 2);
      if (ic) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.globalAlpha = k === cur || hot ? 1 : 0.75;
        ctx.drawImage(ic, ix, iy, sz, sz);
        ctx.restore();
      }
      s.hit(bid, ix - 1, iy - 1, sz + 2, sz + 2);
    });
  }
  kindPlaque(s, ctx, i, x + w / 2, y + h - 11, sl);
}

// ── Seat card ──

function drawSeatCard(
  s: Screens,
  ctx: CanvasRenderingContext2D,
  i: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const sl = s.slots[i];
  const active = !!sl && (i < 2 || s.twoVtwo);
  const team = s.teamOf(i);
  const ink = TEAM_TEXT[team];
  if (!sl || !active) {
    s.portraits?.drop(i);
    if (!sl) return;
    const hot = hovered(s, `add:${i}`);
    card(ctx, x, y, w, 32, hot ? 0 : team ? 0.03 : -0.03, hot ? "#c81818" : "#8a8a90", () => {
      const t = "+ ADD CPU";
      drawPlain(ctx, t, w / 2 - textWidth(t, 0.6, true) / 2, 13, hot ? "#8a1810" : "#6a4424", 0.6, true);
    });
    s.hit(`add:${i}`, x, y - 2, w, 34);
    return;
  }
  if (sl.open) {
    drawOpenSeat(s, ctx, i, team, ink, x, y, w, h);
    return;
  }
  const commander = !s.championSeat(i);
  const human = sl.joined && !sl.cpu;
  const def = s.heroes[sl.hero];
  const naming = s.naming.has(i);
  const tagged = !sl.cpu && !commander && !!sl.tag;
  const label = tagged ? sl.tag! : `P${i + 1}`;
  const iy = 30;
  const ih = h - iy - 34;
  // An unsealed card (a human's, or a CPU's whose chip someone picked up) is empty, unless the cursor holding its
  // chip is hovering a champion: then that champion is previewed, see-through, until the seal is placed.
  const unsealed = (human || sl.cpu) && !commander && !sl.ready && !naming;
  const preview = unsealed && previewing(s, i);
  const blank = unsealed && !preview;
  card(ctx, x, y, w, h, 0, sl.open ? TEAM_BRIGHT[team] : chipColor(i, sl.cpu), () => {
    const ls = tagged ? Math.min(0.95, (w - 34) / Math.max(1, textWidth(label, 1, true))) : 0.95;
    drawPlain(ctx, label, w / 2 - textWidth(label, ls, true) / 2, 7, ink, ls, true);
    inset(ctx, 5, iy, w - 10, ih, "#2a2018");
    texturedRect(ctx, "cloth", 5, iy, w - 10, ih, TEAM_CLOTH[team], 0, 0.7);
    band(ctx, 5, iy + ih - 10, w - 10, 10, "#000000", 0.25);
    if (naming) return;
    if (blank) {
      band(ctx, 5, iy, w - 10, ih, "#000000", 0.35);
      ["PICK A", "CHAMPION"].forEach((l, k) =>
        drawPlain(ctx, l, w / 2 - textWidth(l, 0.62, true) / 2, iy + ih / 2 - 9 + k * 10, "#e8d8b8", 0.62, true),
      );
      return;
    }
    if (sl.hero === RANDOM_PICK) randomStage(ctx, 5, iy, w - 10, ih);
    // Name under the stage, with the class glyph in front of it.
    const name = (def?.name ?? sl.hero).toUpperCase();
    const cls = commander ? undefined : def?.class;
    const gw = cls ? 10 : 0;
    const ns = Math.min(0.8, (w - 10 - gw) / Math.max(1, textWidth(name, 1, true)));
    const nx = w / 2 - (textWidth(name, ns, true) + gw) / 2 + gw;
    drawPlain(ctx, name, nx, iy + ih + 5, BROWN, ns, true);
    classGlyph(ctx, cls, nx - 5.5, iy + ih + 8.5, 8, BROWN, "rgba(0,0,0,0)");
  });
  /** Little X box in the card's corner. */
  const xBox = (bid: string, tip: string) => {
    const hot = hovered(s, bid);
    const ux = x + w - 11;
    const uy = y + 3;
    ctx.fillStyle = "#1a120a";
    ctx.fillRect(ux - 1, uy - 1, 9, 9);
    ctx.fillStyle = hot ? "#b83020" : "#6a3a24";
    ctx.fillRect(ux, uy, 7, 7);
    shadowText(ctx, "X", ux + 3.5 - textWidth("X", 0.5) / 2, uy + 1, hot ? "#fff4b0" : "#e8d8b8", 0.5);
    s.hit(bid, ux - 2, uy - 2, 11, 11);
    if (hot) shadowText(ctx, tip, Math.max(2, x + w / 2 - textWidth(tip, 0.42) / 2), y - 7, "#f8e8c0", 0.42);
  };
  if (sl.cpu && s.hosting && !commander) xBox(`seatopen:${i}`, "OPEN THIS SEAT");
  if (human && sl.local) xBox(`unplug:${i}`, "UNPLUG · ANY BUTTON REJOINS");
  // Name entry (ours) or a mirrored remote one replaces the card body.
  if (naming) {
    s.portraits?.drop(i);
    s.naming.get(i)!.draw(ctx, x + 3, y + 18, w - 6, h - 20, performance.now() / 1000);
    return;
  }
  const sg = !sl.cpu && !commander ? s.signing.get(i) : undefined;
  if (sg) {
    s.portraits?.drop(i);
    drawSigning(ctx, x + 3, y + 18, w - 6, h - 20, sg[0] === 1, sg[1], performance.now() / 1000);
    return;
  }
  kindPlaque(s, ctx, i, x + w / 2, y + 17, sl);
  if (blank) {
    s.portraits?.drop(i);
    return;
  }
  const fx = x + 5;
  const fy = y + iy;
  const fw = w - 10;
  // RANDOM: no model, talents, abilities or costumes to show (the "?" is in the card body) - just the seal.
  if (sl.hero === RANDOM_PICK) {
    s.portraits?.drop(i);
    if (sl.ready && !commander && human) waxSeal(ctx, fx + fw - 7, fy + ih + 3, 6, chipColor(i, false), "combo");
    return;
  }
  drawStage(s, ctx, i, sl, team, fx, fy, fw, ih, preview);
  if (!commander && hasTree(sl.hero)) {
    const tw = w >= 100 ? 1 : 0.7;
    ctx.save();
    drawTree(ctx, sl.hero, "a", fx + 2, fy + 3, false, tw);
    drawTree(ctx, sl.hero, "b", fx + fw - 2 - Math.round(23 * tw), fy + 3, true, tw);
    ctx.restore();
  }
  // Ability glyphs along the bottom edge (embossed), vector icons until the sheet has loaded.
  (["a", "b", "r", "z"] as const).forEach((a, j) => {
    const cx = x + (w / 4) * (j + 0.5);
    const g = heroGlyph(sl.hero, j);
    if (g) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.globalAlpha = 0.5;
      ctx.drawImage(g.light, cx - 7, y + h - 17 + 0.8, 14, 14);
      ctx.globalAlpha = 1;
      ctx.drawImage(g.dark, cx - 7, y + h - 17, 14, 14);
      ctx.restore();
    } else abilityIcon(ctx, def?.abilities?.[a]?.kind ?? "none", cx, y + h - 10, 7);
  });
  if (!commander) drawCostumeStrip(s, ctx, i, sl, fx, fy, fw, ih);
  if (sl.ready && !commander && human) {
    ctx.save();
    waxSeal(ctx, fx + fw - 7, fy + ih + 3, 6, chipColor(i, false), "combo");
    ctx.restore();
  }
}

/** OPEN seat (online host): waiting card with SIT HERE / + ADD CPU (guests get SIT HERE only). */
function drawOpenSeat(
  s: Screens,
  ctx: CanvasRenderingContext2D,
  i: number,
  team: number,
  ink: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  s.portraits?.drop(i);
  card(ctx, x, y, w, h, team ? 0.012 : -0.012, TEAM_BRIGHT[team], () => {
    const t = `SEAT ${i + 1}`;
    drawPlain(ctx, t, w / 2 - textWidth(t, 0.8, true) / 2, 8, ink, 0.8, true);
    inset(ctx, 6, 24, w - 12, h - 92, "#2a2018");
    texturedRect(ctx, "cloth", 6, 24, w - 12, h - 92, TEAM_CLOTH[team], 0, 0.7);
    band(ctx, 6, 24, w - 12, h - 92, "#000000", 0.45);
    waxSeal(ctx, w / 2, 24 + (h - 92) / 2, 14, "#5a4a3a", "none");
    const lines = s.peer ? ["OPEN SEAT", "WAITING FOR", "A PLAYER"] : ["OPEN SEAT", "WAITING FOR A PLAYER"];
    lines.forEach((l, k) => {
      const sc = k ? 0.48 : 0.68;
      drawPlain(ctx, l, w / 2 - textWidth(l, sc, true) / 2, h - 62 + k * 9, k ? "#6a4424" : BROWN, sc, true);
    });
  });
  const btns: [string, string][] = s.peer
    ? [[`take:${i}`, "SIT HERE"]]
    : [
        [`sit:${i}`, "SIT HERE"],
        [`seatcpu:${i}`, "+ ADD CPU"],
      ];
  btns.forEach(([bid, t], k) => woodButton(s, ctx, bid, t, x + w / 2, y + h - 34 + k * 15 - (btns.length - 1) * 8));
}

/** The hero's live 3D stage render over its painted backdrop, with a team-colour fade and frame. */
function drawStage(
  s: Screens,
  ctx: CanvasRenderingContext2D,
  i: number,
  sl: SelectSlot,
  team: number,
  fx: number,
  fy: number,
  fw: number,
  ih: number,
  ghost = false,
): void {
  if (!s.portraits) return;
  // A on the champion model cycles its costume (app/select.ts selectButton "model").
  if (!ghost) s.hit(`model:${i}`, fx, fy, fw, ih);
  const cv = s.portraits.stage(i, sl.hero, team, sl.ready, sl.costume);
  const k = Math.min(fw / cv.width, (ih + 4) / cv.height);
  const dw = cv.width * k;
  const dh = cv.height * k;
  const bg = stageArt.get(sl.hero);
  ctx.save();
  ctx.beginPath();
  ctx.rect(fx, fy, fw, ih);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (bg?.complete && bg.naturalWidth) {
    // Backdrop covers the frame.
    const bk = Math.max(fw / bg.naturalWidth, ih / bg.naturalHeight);
    const bw = bg.naturalWidth * bk;
    const bh = bg.naturalHeight * bk;
    ctx.drawImage(bg, fx + (fw - bw) / 2, fy + (ih - bh) / 2, bw, bh);
    const tc = TEAM_CLOTH[team] ?? "#444444";
    const gr = ctx.createLinearGradient(0, fy + ih, 0, fy + ih * 0.45);
    gr.addColorStop(0, tc + "a0");
    gr.addColorStop(0.35, tc + "55");
    gr.addColorStop(1, tc + "00");
    ctx.fillStyle = gr;
    ctx.fillRect(fx, fy, fw, ih);
    ctx.strokeStyle = tc;
    ctx.lineWidth = 2;
    ctx.strokeRect(fx + 1, fy + 1, fw - 2, ih - 2);
  }
  if (ghost) ctx.globalAlpha = 0.72;
  ctx.drawImage(cv, fx + (fw - dw) / 2, fy + ih - dh + 3, dw, dh);
  ctx.restore();
}

/** Costume icons along the stage's bottom for a few seconds after a C-stick flick; the current one framed. */
function drawCostumeStrip(
  s: Screens,
  ctx: CanvasRenderingContext2D,
  i: number,
  sl: SelectSlot,
  fx: number,
  fy: number,
  fw: number,
  ih: number,
): void {
  const cl = costumesOf(sl.hero);
  if (cl.length <= 1 || !stripOpen(s, i)) return;
  const cur = Math.max(0, cl.indexOf(sl.costume ?? ""));
  const sz = Math.min(15, (fw - 6) / cl.length - 2);
  const gap = 2;
  const rowW = cl.length * sz + (cl.length - 1) * gap;
  const rx = fx + fw / 2 - rowW / 2;
  const ry = fy + ih - sz - 4;
  ctx.save();
  cl.forEach((c, k) => {
    const ic = costumeIcon(sl.hero, c);
    const ix = rx + k * (sz + gap);
    const on = k === cur;
    if (on) {
      ctx.fillStyle = "rgba(10, 6, 2, 0.75)";
      ctx.fillRect(ix - 1.5, ry - 1.5, sz + 3, sz + 3);
      ctx.strokeStyle = "#f4e2b0";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(ix - 1.5, ry - 1.5, sz + 3, sz + 3);
    }
    if (ic) {
      ctx.globalAlpha = on ? 1 : 0.8;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(ic, ix, ry, sz, sz);
      ctx.globalAlpha = 1;
    }
  });
  ctx.restore();
}

/** Seat kind plaque (PLAYER / CPU / DUMMY / COMMANDER), with CPU difficulty gems or the camera toggle. */
function kindPlaque(s: Screens, ctx: CanvasRenderingContext2D, i: number, cx: number, y: number, sl: SelectSlot) {
  cx = Math.round(cx);
  const dummy = s.training && sl.cpu;
  const label = dummy ? "DUMMY" : sl.cpu ? "CPU" : !s.championSeat(i) ? "COMMANDER" : "PLAYER";
  const pw = Math.max(26, textWidth(label, 0.5, true) + 10);
  const camPl = !sl.cpu && s.cameraMode !== 0 && s.championSeat(i);
  const lvW = 21;
  const camW = 11;
  const extra = sl.cpu && !dummy ? lvW + 3 : camPl ? camW + 3 : 0;
  // Humans get a pencil on the left: sign your name. A CPU seat gets a stool there instead (SIT: a local pad moves
  // onto it), or a chair for an online guest (TAKE: they take the seat over) - its own button in the row, like the
  // pencil, so it never covers the stage or costumes.
  const pen = !sl.cpu && s.championSeat(i);
  const sit = sl.cpu && !dummy && (s.peer || !!s.cursors?.cursors.some((c) => c.active));
  const lead = pen || sit ? camW + 3 : 0;
  const x0 = Math.round(cx - (pw + extra + lead) / 2) + lead;
  if (pen) {
    const zx = x0 - lead;
    const hl = hovered(s, `pen:${i}`);
    ctx.fillStyle = INK;
    ctx.fillRect(zx - 1, y - 1, camW + 2, 10);
    texturedRect(ctx, "parch", zx, y, camW, 8, hl ? "#f0d890" : "#c8b088", 0, 1);
    uiGlyph(ctx, "pencil", zx + camW / 2, y + 4, 9, BROWN);
    s.hit(`pen:${i}`, zx - 2, y - 2, camW + 4, 12);
    if (hl) shadowText(ctx, "SIGN YOUR NAME", cx - textWidth("SIGN YOUR NAME", 0.42) / 2, y - 24, "#f8e8c0", 0.42);
  }
  if (sit) {
    const zx = x0 - lead;
    const bid = s.peer ? `take:${i}` : `sit:${i}`;
    const hl = hovered(s, bid);
    ctx.fillStyle = INK;
    ctx.fillRect(zx - 1, y - 1, camW + 2, 10);
    texturedRect(ctx, "parch", zx, y, camW, 8, hl ? "#f0d890" : "#c8b088", 0, 1);
    uiGlyph(ctx, s.peer ? "take" : "sit", zx + camW / 2, y + 4, 9, BROWN);
    s.hit(bid, zx - 2, y - 2, camW + 4, 12);
    if (hl) {
      const t = s.peer ? "TAKE THIS SEAT" : "SIT HERE · PLAY THIS SEAT";
      shadowText(ctx, t, cx - textWidth(t, 0.42) / 2, y - 24, "#f8e8c0", 0.42);
    }
  }
  const px = x0 + pw / 2;
  ctx.fillStyle = INK;
  ctx.fillRect(px - pw / 2 - 1, y - 1, pw + 2, 10);
  texturedRect(ctx, "wood", px - pw / 2, y, pw, 8, hovered(s, `kind:${i}`) ? "#e0b060" : "#a07040", 0, 1);
  drawPlain(ctx, label, px - textWidth(label, 0.5, true) / 2, y + 1.6, sl.cpu ? "#d8d8e0" : "#f8e8b0", 0.5, true);
  s.hit(`kind:${i}`, px - pw / 2 - 2, y - 2, pw + 4, 12);
  const tip = (t: string) => shadowText(ctx, t, cx - textWidth(t, 0.42) / 2, y - 24, "#f8e8c0", 0.42);
  if (sl.cpu && !dummy) {
    // Difficulty: 1-3 lit gems (yellow / orange / red).
    const lx = x0 + pw + 3;
    const hl = hovered(s, `lvl:${i}`);
    ctx.fillStyle = INK;
    ctx.fillRect(lx - 1, y - 1, lvW + 2, 10);
    texturedRect(ctx, "wood", lx, y, lvW, 8, hl ? "#e0b060" : "#6a4428", 0, 1);
    for (let k = 0; k < 3; k++) {
      const gx = lx + 4 + k * 6.5;
      const gy = y + 4;
      const on = k < sl.level;
      const gem = (r: number, col: string) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(gx, gy - r);
        ctx.lineTo(gx + r * 0.8, gy);
        ctx.lineTo(gx, gy + r);
        ctx.lineTo(gx - r * 0.8, gy);
        ctx.closePath();
        ctx.fill();
      };
      gem(3.2, INK);
      gem(2.3, on ? ["#e8c040", "#e07020", "#d81818"][sl.level - 1] : "#2a1c12");
      if (on) {
        ctx.fillStyle = "rgba(255,255,230,0.75)";
        ctx.fillRect(gx - 0.8, gy - 1.6, 1, 1);
      }
    }
    s.hit(`lvl:${i}`, lx - 2, y - 2, lvW + 4, 12);
    if (hl) tip(`CPU ${["EASY", "NORMAL", "HARD"][sl.level - 1]}`);
  }
  if (camPl) {
    // Camera: a cross (manual d-pad zoom) or an eye (auto zoom).
    const zx = x0 + pw + 3;
    const manual = !!s.zoomModes[i];
    const hl = hovered(s, `cam:${i}`);
    ctx.fillStyle = INK;
    ctx.fillRect(zx - 1, y - 1, camW + 2, 10);
    texturedRect(ctx, "parch", zx, y, camW, 8, hl ? "#f0d890" : "#c8b088", 0, 1);
    uiGlyph(ctx, manual ? "dpadzoom" : "eye", zx + camW / 2, y + 4, 9, BROWN);
    s.hit(`cam:${i}`, zx - 2, y - 2, camW + 4, 12);
    if (hl) tip(manual ? "CAMERA: D-PAD ZOOM" : "CAMERA: AUTO ZOOM");
  }
}
