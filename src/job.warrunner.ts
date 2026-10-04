import { register, task, Task2Ret } from "mycreep";
import { Warboy, kTravelBuffer } from "job.warboy";
import { findReactors } from "reactor";

// Season 11 thorium runner for the ReactorDepot mission (ms.reactordepot.ts).
// A Warboy without WORK parts: instead of mining it loads thorium from the
// home room's terminal (filled by Thormine shipments, ms.thormine.ts) and
// walks the load to the sector core's reactor. Delivery, the leave-early
// rules (ticks to live against the planned walk at 3 ticks of life per tick
// carrying 100+, the reactor about to run dry) and the scavenging of loose
// thorium on the way are Warboy's, inherited.

@register
export class Warrunner extends Warboy {
    // 9 CARRY and 9 MOVE (900 energy): the same 450 load as a warboy, so the
    // reactor's landing check (ms.reactor fuel) and aging tier stay the same,
    // at full speed off the roads. CARRY last so the load is guarded.
    static readonly body: BodyPartConstant[] = [
        MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY];

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

    // Our reactor, visible, will have room for a full load by the time we
    // have walked it there: it burns 1 a tick over the planned walk (the plan
    // less its buffer). False without vision or while the reactor is not ours.
    get reactorHasRoom(): boolean {
        const T = RESOURCE_THORIUM!;
        const room = Game.rooms[this.mission.roomName];
        const reactor = room && findReactors(room)[0];
        if (!reactor || !reactor.my) return false;
        const walk = Math.max(0, (this.memory.travel ?? 0) - kTravelBuffer);
        const atLanding = Math.max(0, (reactor.store[T] || 0) - walk);
        return atLanding + this.c.store.getCapacity() <= (reactor.store.getCapacity(T) || 1000);
    }

    // Withdraw as much thorium as fits from the home terminal. The walk to
    // the reactor is planned from the terminal's side (Warboy.planTravel), so
    // a loaded runner knows when its ticks to live run short.
    @task
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

    // Put any thorium back in the home terminal, then hand the body back at
    // the nearest spawn (suicide with no spawn in the room). Never recycled
    // loaded: the thorium would drop at the spawn and age whatever passes.
    @task
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
