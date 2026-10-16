import { register, task, Task2Ret, getMyCreep } from "mycreep";
import { Trucker } from "job.trucker";
import { energyDef } from "spawn";
import { Harvester } from "job.harvester";

// Energy courier for the Xfer mission (ms.xfer.ts): loads energy from the
// storage of the mission's "home" room and walks it to the mission room.
//
//   - In the home room it fills to full from the storage, then leaves.
//   - Anywhere else, any energy aboard puts it in deposit mode until empty
//     (JobCreep.unloadLatch): the mission room's storage, else its terminal
//     or containers (JobCreep.unloadHome); with none of those whatever
//     structure takes energy (the farmer's taskTransferResources: spawns,
//     extensions, towers), else a pile by the controller (Trucker.dropHome).
//     On the way it tops up structures beside it in the mission room and
//     working creeps beside it (Trucker.idleFillHome / idleShare).
//   - With nowhere in the mission room to store it (no storage, terminal or
//     container with room; a startup room, Startup lays one fedex per
//     pioneer there) the working creeps are fed by hand first: it walks to
//     the creep of ours that takes the most as a hand-out
//     (MyCreep.donatable) and transfers until that one is full, then the
//     next (donate, a @task); with nobody to take any it fills spawns,
//     extensions and towers, and in a room with no container at all it
//     then waits beside the nearest WORK creep rather than drop the load by
//     the controller to decay.
//   - Empty in the mission room with too little life left for another round
//     trip (twice the last measured storage-to-mission-room walk plus kTripBuffer)
//     it recycles at the nearest spawn there, or suicides with none.
//   - While the mission winds down nothing more is loaded: what is aboard is
//     delivered, then the creep recycles in whichever of the two rooms it is in.

// Slack on top of the measured round trip before a fedex counts as too old.
const kTripBuffer = 30;
// The least a creep must be able to take for a fedex to walk to it
// (donate); a pioneer's CARRY is 50 a part. Less than that it gets from
// idleShare if the fedex happens to stand beside it.
const kMinHandout = 50;

declare global {
    interface CreepMemory {
        // Fedex: last tick it stood loading at the home storage.
        tripStart?: number
        // Fedex: ticks its last loaded leg took, storage to the mission room.
        tripLeg?: number
    }
}

@register
export class Fedex extends Trucker {
    // Only from the home room, where the first load is.
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const pool = spawns.filter(s => s.room.name === this.srcName);
        const spawn = _.find(pool, s => !s.spawning) || _.first(pool);
        if (!spawn) return [null, []];
        return [spawn, Fedex.body(spawn.room.energyCapacityAvailable)];
    }

    // CARRY, CARRY, MOVE groups: 33 CARRY and 17 MOVE (2500 energy, 1650 a
    // trip, full speed on roads and half off them), fewer groups while the
    // spawn room's capacity is short of that (30 CARRY at RCL6).
    static body(ecap: number): BodyPartConstant[] {
        return energyDef({ move: 2, per: [CARRY], energy: Math.min(ecap, 2500), max: 33, interleave: true } as any);
    }

    // The room the energy comes from: the mission's "home".
    get srcName(): string {
        return this.mission.getRoomName("home")!;
    }

    // Overrides JobCreep.homeName: a trucker's home is where it unloads, and
    // for a fedex that is the mission room (the mission's "home" is srcName).
    get homeName(): string {
        return this.mission.roomName;
    }

    get tooOld(): boolean {
        const leg = this.memory.tripLeg;
        return leg !== undefined && this.ticksToLive < 2 * leg + kTripBuffer;
    }

    // Set by init() on a tick spent fleeing: start() and the donate task
    // then move nothing, so the flee's move stands.
    fleeing = false;

    // Every tick before a task resumes: retreat once the CARRY parts are
    // gone, flee armed hostiles. Not a reason to drop the task in flight
    // (MyCreep.init): a donation resumes once the danger is past.
    init(): boolean {
        const c = this.cc;
        this.fleeing = !!(c.idleRetreat(CARRY) || c.fleeHostiles());
        return true;
    }

    start(): Task2Ret {
        const c = this.cc;
        if (this.fleeing) return "wait";

        const mem = this.memory;
        const here = this.pos.roomName;
        const inSrc = here === this.srcName;
        const inDest = here === this.homeName;
        const stop = this.mission.windingDown;

        // The leg is the walk, storage to the mission room, measured on
        // arrival: the time spent handing the load out (donate, holdNear)
        // is not travel and must not make the creep count as too old.
        if (inDest && mem.tripStart !== undefined) {
            mem.tripLeg = Game.time - mem.tripStart;
            delete mem.tripStart;
        }

        // Deposit mode: any load outside the home room, a full one inside
        // it, or whatever is aboard once the mission is stopping.
        if (this.unloadLatch(!inSrc || !c.store.getFreeCapacity() || stop)) return this.deliver();

        // Empty from here on.
        if (stop) {
            if (inSrc || inDest) return this.retire();
            return this.moveRoom(this.homeName);
        }
        if (inDest && this.tooOld) return this.retire();
        return this.load();
    }

    // Walk to the home storage and fill up. With the storage dry a partial
    // load leaves anyway; an empty creep waits beside it.
    load(): Task2Ret {
        const c = this.cc;
        const storage = Game.rooms[this.srcName]?.storage;
        if (!storage) {
            if (this.pos.roomName !== this.srcName) return this.moveRoom(this.srcName);
            this.dlog("no storage in", this.srcName);
            return "wait";
        }
        if (!this.pos.isNearTo(storage)) return this.moveTarget(storage, 1);
        this.memory.tripStart = Game.time;
        const amount = Math.min(c.store.getFreeCapacity(), storage.store.energy);
        if (amount <= 0) {
            if (c.store.getUsedCapacity() && this.unloadLatch(true)) return this.deliver();
            return "wait";
        }
        const err = c.withdraw(storage, RESOURCE_ENERGY, amount);
        if (err === OK) c.intents.withdraw = storage;
        else this.log("withdraw failed", err, amount, storage);
        return "wait";
    }

    deliver(): Task2Ret {
        const c = this.cc;
        const dest = this.homeName;
        const ret = this.unloadHome(dest);
        if (ret) return ret;
        // No storage, terminal or container with room: the working creeps
        // take it by hand, else fill anything.
        if (this.pos.roomName !== dest) return this.moveRoom(dest);
        const taker = this.pickTaker();
        if (taker) return this.donate(taker);
        if (c.taskTask() || c.taskTransferResources()) return "wait";
        // No container at all (a startup room): wait for a taker. Else the
        // controller pile.
        if (!this.conts().length) return this.holdNear();
        return this.dropHome();
    }

    // The creep of ours in the mission room to hand energy to: the nearest
    // that takes kMinHandout or more (its job's MyCreep.donatable: a WORK
    // creep's free energy capacity; a Pioneer takes none outside its room),
    // the one taking the most among those equally near. null with none.
    pickTaker(): Creep | null {
        const wants = new Map<string, number>();
        for (const o of this.c.room.find(FIND_MY_CREEPS)) {
            // A spawning creep cannot be handed anything yet.
            if (o.name === this.c.name || o.spawning) continue;
            const n = getMyCreep(o.name).donatable();
            if (n >= kMinHandout) wants.set(o.name, n);
        }
        if (!wants.size) return null;
        // Nearest first; among the equally near the one taking the most.
        const best = _.min(Array.from(wants.keys()), name => this.pos.getRangeTo(Game.creeps[name]) * 10000 - wants.get(name)!);
        return Game.creeps[best] || null;
    }

    // Walk to `taker` and hand over what it takes (donatable), one transfer
    // a tick, until it takes no more, we are empty, or it is gone (runTask
    // restarts then): "start", and deliver() picks the next. Moves nothing
    // on a flee tick (init). The first job on the fixed @task (15 Oct
    // 2026): the pick persists in memory.task2 (name, the taker's id) and
    // resumes each tick without deliver() re-deciding.
    @task
    donate(taker: Creep): Task2Ret {
        const c = this.cc;
        if (!c.store.energy || taker.pos.roomName !== this.homeName) return "start";
        const wants = getMyCreep(taker.name).donatable();
        if (wants <= 0 || (wants < kMinHandout && !this.pos.isNearTo(taker))) return "start";
        if (this.fleeing) return "wait";
        if (!this.pos.isNearTo(taker)) return this.moveTarget(taker, 1);
        if (c.intents.transfer) return "wait";
        const amount = Math.min(c.store.energy, wants);
        const err = c.transfer(taker, RESOURCE_ENERGY, amount);
        if (err === OK) c.intents.transfer = taker;
        else this.log("donate failed", err, amount, taker);
        return "wait";
    }

    // Nobody takes a hand-out right now and no structure takes energy: wait
    // beside the nearest WORK creep of ours that takes hand-outs (not a
    // harvester, not spawning; it empties as it works, and
    // idleShare or the next donate hands over) rather than drop the load by
    // the controller, where it would decay. With nobody to wait for, or
    // the mission winding down, drop it there after all (dropHome) so the
    // creep empties and can retire.
    holdNear(): Task2Ret {
        const workers = this.c.room.find(FIND_MY_CREEPS)
            .filter(o => o.name !== this.c.name && !o.spawning && o.getActiveBodyparts(WORK) > 0
                // A harvester never takes a hand-out (donatable 0).
                && !(getMyCreep(o.name) instanceof Harvester));
        const near = this.pos.findClosestByRange(workers);
        if (!near || this.mission.windingDown) return this.dropHome();
        if (!this.pos.isNearTo(near)) this.moveTarget(near, 1);
        return "wait";
    }

    // Hand the body back at the nearest spawn in this room; suicide with none.
    retire(): Task2Ret {
        const spawn = this.pos.findClosestByRange(this.c.room.findStructs(STRUCTURE_SPAWN) as StructureSpawn[]);
        if (!spawn || !spawn.my) {
            this.log("no spawn to recycle at, suiciding");
            this.c.suicide();
            return "wait";
        }
        if (!this.pos.isNearTo(spawn)) return this.moveTarget(spawn, 1);
        const err = spawn.recycleCreep(this.c);
        if (err !== OK) this.log("recycle failed", err, spawn);
        return "wait";
    }

    // Never nom in the mission room (it would pick its own controller pile
    // back up) and never share in the home room (the load is for the trip).
    after() {
        const here = this.pos.roomName;
        (here !== this.homeName && this.cc.idleNom()) ||
            this.idleFillHome() ||
            (here !== this.srcName && this.idleShare());
    }
}
