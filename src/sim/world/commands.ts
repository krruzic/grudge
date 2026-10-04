// Per-player command handling for one tick (step phase 3). Runs once per PlayerSlot, in slot order, before the
// hero controller: economy actions (build/spec/shop), talent picks, morph, commander orders, chat, then the hero's
// own movement/abilities via updateHero.
import type { World, PlayerSlot } from "../world.ts";
import type { Command, Entity } from "../types.ts";
import { FORMATIONS } from "../types.ts";
import { updateHero } from "../heroes.ts";
import { trySpec, tryBuild } from "../structures.ts";
import { gainXp, learn } from "../talents.ts";
import { autoPick } from "./match.ts";

const FORMATION_LABEL = { mass: "LOOSE", column: "COLUMN", line: "LINE", wedge: "WEDGE" };

export function applyPlayerCommand(w: World, slot: PlayerSlot, e: Entity, cmd: Command): void {
  const dt = w.dt;
  if (e.alive && cmd.build) tryBuild(w, e, cmd.build);
  if (e.alive && cmd.spec !== undefined) trySpec(w, e, cmd.spec);
  if (e.alive && cmd.buy) w.arena.buy(e, cmd.buy, cmd.aimAt);
  if (cmd.learn !== undefined && e.hero?.picks.length) learn(w, e, cmd.learn);
  if (e.hero) autoPick(w, e);
  if (cmd.morph && e.alive) w.startMorph(e);
  if (cmd.formation && slot.commander) {
    const ts = w.teams[slot.team];
    const next = FORMATIONS[(FORMATIONS.indexOf(ts.formation ?? "mass") + 1) % FORMATIONS.length];
    ts.formation = next;
    for (const u of w.entities) if (u.unit && u.team === slot.team) u.unit.repathAt = 0;
    w.emit({ type: "notice", team: slot.team, text: `FORMATION · ${FORMATION_LABEL[next]}` });
  }
  if (cmd.say) w.emit({ type: "notice", team: slot.team, text: cmd.say.slice(0, 48) });
  if (e.alive) gainXp(w, e, w.data.talents?.xp.passive * dt);
  if (cmd.directive) {
    // Commander orders always apply; a teammate's order only after the commander has been quiet for a while.
    const ts = w.teams[slot.team];
    if (slot.commander) {
      ts.commanderOrderAt = w.time;
      w.setDirective(slot.team, cmd.directive.type, cmd.directive.dir, e);
    } else if (w.time - ts.commanderOrderAt > w.data.heroes.baseline.commanderPriority) {
      w.setDirective(slot.team, cmd.directive.type, cmd.directive.dir, e);
    } else w.emit({ type: "notice", team: slot.team, text: "COMMANDER HAS ORDERS" });
  }
  if (e.hero) w.tickMorph(e);
  updateHero(w, e, cmd);
}
