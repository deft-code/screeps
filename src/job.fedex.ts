import { register, Task2Ret } from "mycreep";
import { Trucker } from "job.trucker";
import { energyDef } from "spawn";

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
//   - Empty in the mission room with too little life left for another round
//     trip (twice the last measured storage-to-unload leg plus kTripBuffer)
//     it recycles at the nearest spawn there, or suicides with none.
//   - While the mission winds down nothing more is loaded: what is aboard is
//     delivered, then the creep recycles in whichever of the two rooms it is in.

// Slack on top of the measured round trip before a fedex counts as too old.
const kTripBuffer = 30;

declare global {
    interface CreepMemory {
        // Fedex: last tick it stood loading at the home storage.
        tripStart?: number
        // Fedex: ticks its last loaded leg took, storage to empty.
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

    // CARRY, MOVE x 25 (2500 energy, 1250 a trip, full speed off the roads),
    // fewer pairs while the spawn room's capacity is short of that (23 at RCL6).
    static body(ecap: number): BodyPartConstant[] {
        return energyDef({ move: 1, per: [CARRY], energy: Math.min(ecap, 2500), max: 25, interleave: true } as any);
    }

    // The room the energy comes from: the mission's "home".
    get srcName(): string {
        return this.mission.getRoomName("home")!;
    }

    // Trucker's "home" is where it unloads: for a fedex the mission room.
    get homeName(): string {
        return this.mission.roomName;
    }

    get tooOld(): boolean {
        const leg = this.memory.tripLeg;
        return leg !== undefined && this.ticksToLive < 2 * leg + kTripBuffer;
    }

    start(): Task2Ret {
        const c = this.cc;
        if (c.idleRetreat(CARRY) || c.fleeHostiles()) return "wait";

        const mem = this.memory;
        const here = this.pos.roomName;
        const inSrc = here === this.srcName;
        const inDest = here === this.homeName;
        const stop = this.mission.windingDown;

        // Deposit mode: any load outside the home room, a full one inside
        // it, or whatever is aboard once the mission is stopping.
        if (this.unloadLatch(!inSrc || !c.store.getFreeCapacity() || stop)) return this.deliver();

        // Empty from here on.
        if (inDest && mem.tripStart !== undefined) {
            mem.tripLeg = Game.time - mem.tripStart;
            delete mem.tripStart;
        }
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
        // No storage, terminal or container with room: fill anything.
        if (this.pos.roomName !== dest) return this.moveRoom(dest);
        if (c.taskTask() || c.taskTransferResources()) return "wait";
        return this.dropHome();
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
