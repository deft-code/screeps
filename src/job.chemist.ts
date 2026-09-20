import { JobRole } from "job.role";
import { register, task, Task2Ret } from "mycreep";

// A lab is filled up to this much of its planned mineral, and up to
// kBoostFill while it is boosting. Both sit under the amounts at which
// struct.lab's mineralDrain() wants the lab emptied again (900 and 2400).
const kLabFill = 800;
const kBoostFill = 2400;
// Energy is only taken from a store holding more than this.
const kEnergyReserve = 5000;

type Depot = StructureStorage | StructureTerminal;
type Fillable = StructureLab | StructureNuker;
type Stray = Resource | Tombstone | Ruin | StructureContainer;

declare global {
    interface CreepMemory {
        // Chemist: the load in hand was gathered off the floor, it goes to the storage.
        stray?: boolean
    }
}

function nonEnergy(store: StoreDefinition): ResourceConstant | undefined {
    return _.find(Object.keys(store) as ResourceConstant[], r => r !== RESOURCE_ENERGY && store[r] > 0);
}

// Lab tender, the job-layer port of role.chemist.js. One per Hub room with a
// terminal and a lab (Chemist.want). What each lab should hold is decided
// elsewhere: lab.planType, with mineralFill()/mineralDrain() as the
// thresholds (struct.lab.js). Empty-handed, the first of:
//
//   1. empty a lab that wants draining (wrong contents, or product piled up)
//   2. carry a lab's planned mineral to it, from the terminal, else the storage
//   3. top up lab energy, from whichever of storage/terminal holds more
//   4. carry ghodium to the nuker (haulers already bring its energy)
//   5. gather stray non-energy from the nearest pile, tombstone, ruin or
//      container (energy is the haulers' business)
//
// then wait within range 3 of the terminal. With something in hand it goes to
// whatever wants it (lab, nuker) and otherwise back into the terminal, storage
// when that is full; a gathered load (memory.stray) goes the other way round,
// storage first. One resource per trip, except when gathering.
@register
export class Chemist extends JobRole {
    static want(room: Room | null | undefined): number {
        if (!room?.controller?.my || !room.terminal?.my) return 0;
        return room.findStructs(STRUCTURE_LAB).length ? 1 : 0;
    }

    // spawnold's 'chemist' body: 10 CARRY, 5 MOVE.
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        return this.localSpawn(spawns, { body: "chemist" });
    }

    get labs(): StructureLab[] {
        const room = this.mission.room;
        return room ? room.findStructs(STRUCTURE_LAB) as StructureLab[] : [];
    }

    get nuker(): StructureNuker | null {
        const room = this.mission.room;
        return room && _.first(room.findStructs(STRUCTURE_NUKER)) as StructureNuker || null;
    }

    // Terminal first: minerals live there, the storage only holds strays.
    get depots(): Depot[] {
        const room = this.mission.room;
        return _.filter([room?.terminal, room?.storage], s => s && s.my) as Depot[];
    }

    depotWith(res: ResourceConstant): Depot | null {
        if (res === RESOURCE_ENERGY) {
            const rich = _.last(_.sortBy(this.depots, d => d.store.energy));
            return rich && rich.store.energy > kEnergyReserve ? rich : null;
        }
        return _.find(this.depots, d => d.store[res] > 0) || null;
    }

    // Units of its planned mineral a lab still wants; 0 when it wants none.
    labWant(lab: StructureLab): number {
        if (!lab.planType || !lab.mineralFill()) return 0;
        return Math.max(0, (lab.boost ? kBoostFill : kLabFill) - (lab.mineralAmount || 0));
    }

    // Who takes this resource off our hands, other than the depots.
    sinkFor(res: ResourceConstant): Fillable | null {
        if (res === RESOURCE_ENERGY) {
            return _.find(this.labs, l => l.store.getFreeCapacity(RESOURCE_ENERGY) > 0) || null;
        }
        const lab = _.find(this.labs, l => l.planType === res && this.labWant(l) > 0);
        if (lab) return lab;
        const nuker = this.nuker;
        if (res === RESOURCE_GHODIUM && nuker && nuker.store.getFreeCapacity(RESOURCE_GHODIUM) > 0) return nuker;
        return null;
    }

    // Non-energy lying about the room: piles, tombstones, ruins, containers.
    findStray(): Stray | null {
        const room = this.mission.room;
        if (!room) return null;
        const strays: Stray[] = [
            ...room.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType !== RESOURCE_ENERGY }),
            ...room.find(FIND_TOMBSTONES, { filter: t => nonEnergy(t.store) }),
            ...room.find(FIND_RUINS, { filter: r => nonEnergy(r.store) }),
            ...(room.findStructs(STRUCTURE_CONTAINER) as StructureContainer[]).filter(c => nonEnergy(c.store)),
        ];
        return this.pos.findClosestByRange(strays);
    }

    start(): Task2Ret {
        const c = this.c;
        const room = this.mission.room;
        if (!room) return "wait";
        if (this.pos.roomName !== room.name) return this.moveRoom(room.name);

        const held = _.find(Object.keys(c.store) as ResourceConstant[], r => c.store[r] > 0);
        if (!held) delete this.memory.stray;
        if (held) {
            const sink = this.sinkFor(held);
            if (sink) return this.fill(sink, held);
            const depots = this.memory.stray ? this.depots.slice().reverse() : this.depots;
            const depot = _.find(depots, d => d.store.getFreeCapacity() > 0);
            if (depot) return this.stash(depot);
            this.log("nowhere to put", held);
            return "wait";
        }

        const drain = _.find(this.labs, l => l.mineralType && l.mineralDrain());
        if (drain) return this.drain(drain);

        for (const lab of this.labs) {
            const want = this.labWant(lab);
            const depot = want > 0 && this.depotWith(lab.planType!);
            if (depot) return this.fetch(depot, lab.planType!, want);
        }

        const thirst = _.sum(this.labs, l => l.store.getFreeCapacity(RESOURCE_ENERGY));
        if (thirst > 0) {
            const depot = this.depotWith(RESOURCE_ENERGY);
            if (depot) return this.fetch(depot, RESOURCE_ENERGY, thirst);
        }

        const nuker = this.nuker;
        const ghodium = nuker ? nuker.store.getFreeCapacity(RESOURCE_GHODIUM) : 0;
        if (ghodium > 0) {
            const depot = this.depotWith(RESOURCE_GHODIUM);
            if (depot) return this.fetch(depot, RESOURCE_GHODIUM, ghodium);
        }

        if (room.storage?.my) {
            const stray = this.findStray();
            if (stray) return this.gather(stray);
        }

        // Nothing to do: keep off the spawn's doorstep.
        if (room.terminal) this.walkRange(room.terminal);
        return "wait";
    }

    @task
    fetch(depot: Depot, res: ResourceConstant, amount: number): Task2Ret {
        const c = this.c;
        const n = Math.min(amount, c.store.getFreeCapacity(), depot.store[res] || 0);
        if (n <= 0) return "start";
        if (!this.pos.isNearTo(depot)) return this.moveTarget(depot, 1);
        const err = c.withdraw(depot, res, n);
        if (err !== OK) this.log("withdraw", n, res, "from", depot, "failed", err);
        // The load shows in the store next tick; start() delivers it then.
        return "wait";
    }

    @task
    fill(sink: Fillable, res: ResourceConstant): Task2Ret {
        const c = this.c;
        const free = (sink.store as Store<ResourceConstant, false>).getFreeCapacity(res) || 0;
        const n = Math.min(c.store[res] || 0, free);
        // Plans change under way (a boost ends, the target moves on).
        if (n <= 0 || this.sinkFor(res) !== sink) return "start";
        if (!this.pos.isNearTo(sink)) return this.moveTarget(sink, 1);
        const err = c.transfer(sink, res, n);
        if (err !== OK) {
            this.log("transfer", n, res, "to", sink, "failed", err);
            return "start";
        }
        return "wait";
    }

    @task
    drain(lab: StructureLab): Task2Ret {
        const c = this.c;
        const res = lab.mineralType;
        if (!res || !lab.mineralDrain() || !c.store.getFreeCapacity()) return "start";
        if (!this.pos.isNearTo(lab)) return this.moveTarget(lab, 1);
        const err = c.withdraw(lab, res);
        if (err !== OK) this.log("drain", res, "from", lab, "failed", err);
        return "wait";
    }

    // Everything but energy out of a stray, until full or it is clean; the
    // load then goes to the storage (start(), memory.stray).
    @task
    gather(stray: Stray): Task2Ret {
        const c = this.c;
        if (!c.store.getFreeCapacity()) return "start";
        const pile = stray instanceof Resource;
        const res = pile ? (stray as Resource).resourceType : nonEnergy((stray as Tombstone).store);
        if (!res || res === RESOURCE_ENERGY) return "start";
        if (!this.pos.isNearTo(stray)) return this.moveTarget(stray, 1);
        const err = pile ? c.pickup(stray as Resource) : c.withdraw(stray as Tombstone, res);
        if (err !== OK) {
            this.log("gather", res, "from", stray, "failed", err);
            return "start";
        }
        this.memory.stray = true;
        return "wait";
    }

    @task
    stash(depot: Depot): Task2Ret {
        const c = this.c;
        const res = _.find(Object.keys(c.store) as ResourceConstant[], r => c.store[r] > 0);
        if (!res || !depot.store.getFreeCapacity()) return "start";
        if (!this.pos.isNearTo(depot)) return this.moveTarget(depot, 1);
        const err = c.transfer(depot, res, Math.min(c.store[res], depot.store.getFreeCapacity()));
        if (err !== OK) this.log("stash", res, "in", depot, "failed", err);
        return "wait";
    }
}
