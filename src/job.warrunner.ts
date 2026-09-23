import { register, task, Task2Ret } from "mycreep";
import { Warboy } from "job.warboy";

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
        const homeName = this.mission.getRoomName("home");
        if (!homeName) return [null, []];
        const homeSpawns = spawns.filter(s => s.room.name === homeName && s.room.energyAvailable >= Warrunner.cost);
        if (!homeSpawns.length) return [null, []];
        return [_.sample(homeSpawns), Warrunner.body];
    }

    get homeTerminal(): StructureTerminal | null {
        const home = this.mission.getRoom("home");
        return home?.terminal || null;
    }

    start(): Task2Ret {
        if (!RESOURCE_THORIUM) return "wait";
        if (this.shouldDeliver) return this.deliver();

        const loot = this.findLoot();
        if (loot) return this.scavenge(loot);

        const homeName = this.mission.getRoomName("home");
        if (homeName && this.pos.roomName !== homeName) {
            // Carrying something already: the trip is worth more than a top-up.
            if (this.thorium > 0) return this.deliver();
            return this.moveRoom(homeName);
        }
        const terminal = this.homeTerminal;
        if (!terminal) {
            this.dlog("no terminal at home");
            return "wait";
        }
        if ((terminal.store[RESOURCE_THORIUM] || 0) > 0 && this.c.store.getFreeCapacity()) return this.load(terminal);

        // The terminal is empty: a partial load is still worth the trip.
        if (this.thorium > 0) return this.deliver();
        if (!this.pos.inRangeTo(terminal, 2)) this.moveTarget(terminal, 2);
        this.dlog("no thorium to run");
        return "wait";
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
        const err = this.c.withdraw(terminal, T, amount);
        if (err !== OK) this.log("withdraw failed", err, amount, terminal);
        return "wait";
    }
}
