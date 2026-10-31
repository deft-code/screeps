import { register, taskbroken, Task2Ret } from "mycreep";
import { Warboy, kTravelBuffer } from "job.warboy";
import { findReactors } from "reactor";
import { dodgeKeepers } from "job.skharvester";
import { defaultRewalker } from "Rewalker";
import { roomKind, Kind } from "intel";
import type { Reactor } from "ms.reactor";

// Season 11 thorium runner for the ReactorDepot mission (ms.reactordepot.ts).
// A Warboy without WORK parts: instead of mining it loads thorium from the
// home room's terminal (filled by Thormine shipments, ms.thormine.ts) and
// walks the load to the sector core's reactor. Delivery, the leave-early
// rules (ticks to live against the planned walk at 3 ticks of life per tick
// carrying 100+, the reactor about to run dry) and the scavenging of loose
// thorium on the way are Warboy's, inherited.
//
// The core is contested (since 29 Oct 2026, to get the reactor burning the
// moment the room is retaken): a loaded runner reads the mission's militant
// count (Reactor.ourMilitants / enemyMilitants, our ATTACK or RANGED_ATTACK
// creeps in the core against the enemy's, keepers excepted) each tick, gate():
//   go    - no enemy militant, or more of ours than theirs (or no vision):
//           deliver as before;
//   hold  - as many of theirs as ours: in the core, carry on to the reactor;
//           outside it, wait at the edge (below);
//   back  - more of theirs: leave the core for the edge.
// The edge is the room before the core on the Rewalker route from home
// (waitAtEdge): the runner stands within kEdgeRange of the exit tiles into
// the core, dodging keepers when that room is a Source Keeper room, and
// goes in again the tick the balance allows. Waiting while its ticks to
// live fall under the loaded walk (deliverTtl) it goes home instead and
// puts the thorium back in the terminal (retire). It also loads and sets
// out while the reactor is not ours (reactorHasRoom) and feeds it whoever
// holds it (Warboy.deliver).
const kEdgeRange = 2;

@register
export class Warrunner extends Warboy {
    // 9 CARRY and 9 MOVE (900 energy): the same 450 load as a warboy, so the
    // reactor's landing check (ms.reactor fuel) and aging tier stay the same,
    // at full speed off the roads. CARRY and MOVE alternate, so damage takes
    // capacity and speed together (until 12 Oct 2026 every MOVE went first
    // and a hurt runner was a loaded cripple).
    static readonly body: BodyPartConstant[] = _.flatten(_.times(9, () => [CARRY, MOVE])) as BodyPartConstant[];

    static readonly cost = _.sum(Warrunner.body, part => BODYPART_COST[part]);

    // Thorium one warrunner carries per trip.
    static readonly tripLoad = _.filter(Warrunner.body, part => part === CARRY).length * CARRY_CAPACITY;

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const homeName = this.homeName;
        const homeSpawns = spawns.filter(s => s.room.name === homeName && s.room.energyAvailable >= Warrunner.cost);
        if (!homeSpawns.length) return [null, []];
        return [_.sample(homeSpawns), Warrunner.body];
    }

    get homeTerminal(): StructureTerminal | null {
        return Game.rooms[this.homeName]?.terminal || null;
    }

    start(): Task2Ret {
        // Warboy.init fled a shooter this tick: nothing else.
        if (this.fleeing) return "wait";
        if (!RESOURCE_THORIUM) return "wait";
        const homeName = this.homeName;
        // At home, too old for another trip and not already walking a full
        // load out (that one left in time and has the buffer to land): unload
        // and recycle. The mission lays the replacement before this.
        if (this.pos.roomName === homeName && this.tooOld && this.c.store.getFreeCapacity()) return this.retire();
        if (this.shouldDeliver) return this.deliver();

        const loot = this.findLoot();
        if (loot) return this.scavenge(loot);

        if (this.pos.roomName !== homeName) {
            // Carrying something already: the trip is worth more than a top-up.
            if (this.thorium > 0) return this.deliver();
            return this.moveRoom(homeName);
        }
        const terminal = this.homeTerminal;
        if (!terminal) {
            this.dlog("no terminal at home");
            return "wait";
        }
        if ((terminal.store[RESOURCE_THORIUM] || 0) > 0 && this.c.store.getFreeCapacity()) {
            // Wait by the terminal, unloaded (so ageing 1 a tick, not 3),
            // until the reactor can take the whole load when it lands. The
            // walk is planned here so tooOld (above) can retire a waiter.
            if (!this.pos.inRangeTo(terminal, 2)) {
                this.moveTarget(terminal, 2);
                return "wait";
            }
            this.planTravel();
            if (!this.reactorHasRoom) {
                this.dlog("waiting for room in the reactor");
                return "wait";
            }
            return this.load(terminal);
        }

        // The terminal is empty: a partial load is still worth the trip.
        if (this.thorium > 0) return this.deliver();
        if (!this.pos.inRangeTo(terminal, 2)) this.moveTarget(terminal, 2);
        this.dlog("no thorium to run");
        return "wait";
    }

    // The reactor, visible, will have room for a full load by the time we
    // have walked it there: it burns 1 a tick over the planned walk (the plan
    // less its buffer). False without vision. One that is not ours counts
    // as empty (since 29 Oct 2026: the load should be waiting when the
    // immortan takes it; before, the runner waited at the terminal).
    get reactorHasRoom(): boolean {
        const T = RESOURCE_THORIUM!;
        const room = Game.rooms[this.mission.roomName];
        const reactor = room && findReactors(room)[0];
        if (!reactor) return false;
        if (!reactor.my) return true;
        const walk = Math.max(0, (this.memory.travel ?? 0) - kTravelBuffer);
        const atLanding = Math.max(0, (reactor.store[T] || 0) - walk);
        return atLanding + this.c.store.getCapacity() <= (reactor.store.getCapacity(T) || 1000);
    }

    // Withdraw as much thorium as fits from the home terminal. The walk to
    // the reactor is planned from the terminal's side (Warboy.planTravel), so
    // a loaded runner knows when its ticks to live run short.
    @taskbroken
    load(terminal: StructureTerminal): Task2Ret {
        if (this.shouldDeliver) return "start";
        const T = RESOURCE_THORIUM!;
        const free = this.c.store.getFreeCapacity();
        const amount = Math.min(free, terminal.store[T] || 0);
        if (amount <= 0) return "start";
        if (!this.pos.isNearTo(terminal)) {
            this.moveTarget(terminal, 1);
            return "wait";
        }
        this.planTravel();
        // The plan may show we are too old for the trip: start() retires us.
        if (this.tooOld) return "start";
        const err = this.c.withdraw(terminal, T, amount);
        if (err !== OK) this.log("withdraw failed", err, amount, terminal);
        return "wait";
    }

    // Too old to carry a load from the terminal to the reactor (3 ticks of
    // life per tick loaded): it would die on the way and drop it. Only once
    // the walk has been planned from beside the terminal.
    get tooOld(): boolean {
        return this.memory.travel !== undefined && this.ticksToLive < this.deliverTtl;
    }

    get reactorMission(): Reactor {
        return this.mission as unknown as Reactor;
    }

    // Whether the militant balance in the core lets a loaded runner go in.
    gate(): "go" | "hold" | "back" {
        const m = this.reactorMission;
        if (!m.room) return "go";
        const ours = m.ourMilitants;
        const enemy = m.enemyMilitants;
        if (enemy > ours) return "back";
        if (enemy === 0 || ours > enemy) return "go";
        return "hold";
    }

    // The room before the core on the route from home (home itself when
    // the core is next door).
    get edgeRoom(): string {
        const route = defaultRewalker().getRoute(this.homeName, this.mission.roomName);
        return route.length > 1 ? route[route.length - 2] : this.homeName;
    }

    // Warboy.deliver behind the gate: in the core, "back" sends the runner
    // out to the edge, anything else carries on to the reactor; outside it,
    // only "go" walks in, the rest wait at the edge, or go home to unload
    // once too old for the loaded walk.
    @taskbroken
    deliver(): Task2Ret {
        if (!this.thorium) return "start";
        const core = this.mission.roomName;
        const gate = this.gate();
        if (this.pos.roomName === core) {
            if (gate !== "back") return super.deliver();
            this.dlog("falling back: enemy militants outnumber ours");
            return this.waitAtEdge();
        }
        if (gate === "go") return super.deliver();
        if (this.ticksToLive < this.deliverTtl) {
            this.dlog("too old to wait out the core; unloading at home");
            return this.retire();
        }
        return this.waitAtEdge();
    }

    // Stand within kEdgeRange of the exit into the core from the edge room,
    // out of the keepers' reach when it is a Source Keeper room.
    waitAtEdge(): Task2Ret {
        const edge = this.edgeRoom;
        if (this.pos.roomName !== edge) return this.moveRoom(edge);
        if (roomKind(edge) === Kind.SourceKeeper && dodgeKeepers(this.cc)) return "wait";
        const exit = this.exitTile(edge, this.mission.roomName);
        if (exit && !this.pos.inRangeTo(exit, kEdgeRange)) this.movePos(exit, kEdgeRange);
        this.dlog("waiting at the edge of", edge, "for", this.mission.roomName, this.gate());
        return "wait";
    }

    // The nearest exit tile of `from` into `to`, null when the rooms do not touch.
    exitTile(from: string, to: string): RoomPosition | null {
        const dir = Game.map.findExit(from, to);
        if (dir === ERR_NO_PATH || dir === ERR_INVALID_ARGS) return null;
        return this.pos.findClosestByRange(dir as ExitConstant);
    }

    // Put any thorium back in the home terminal, then hand the body back at
    // the nearest spawn (suicide with no spawn in the room). Never recycled
    // loaded: the thorium would drop at the spawn and age whatever passes.
    @taskbroken
    retire(): Task2Ret {
        if (this.thorium > 0) {
            const terminal = this.homeTerminal;
            if (terminal) {
                if (!this.pos.isNearTo(terminal)) {
                    this.moveTarget(terminal, 1);
                    return "wait";
                }
                const err = this.c.transfer(terminal, RESOURCE_THORIUM!);
                if (err !== OK) this.log("unload failed", err, terminal);
                return "wait";
            }
            this.dlog("no terminal to unload into");
        }
        const spawn = this.pos.findClosestByRange(this.c.room.findStructs(STRUCTURE_SPAWN) as StructureSpawn[]);
        if (!spawn) {
            this.log("no spawn to recycle at, suiciding");
            this.c.suicide();
            return "wait";
        }
        if (!this.pos.isNearTo(spawn)) {
            this.moveTarget(spawn, 1);
            return "wait";
        }
        const err = spawn.recycleCreep(this.c);
        if (err !== OK) this.log("recycle failed", err, spawn);
        return "wait";
    }
}
