import { JobRole } from "job.role";
import { register, task, Task2Ret } from "mycreep";
import { CreepRepair } from "creep.repair";
import { defaultRewalker } from "Rewalker";
import { roomKind, Kind } from "intel";

// Dropped energy smaller than this is not worth a detour while foraging.
const kMinPile = 50;
// Keep this far from a keeper lair when picking things up in an SK room.
const kLairRange = 5;

type Mode = "work" | "gather" | "forage";

declare global {
    interface CreepMemory {
        // Paver mode; absent means "work".
        pmode?: Mode
    }
}

type Forage = Resource | Tombstone | Ruin | AnyStoreStructure | Source;

const rewalker = defaultRewalker();

// Port of role.paver.js to the mission/job system. Spawned by "Once Paver
// <room>" (ms.once.ts), which Remote schedules whenever an unclaimed room on
// its route has construction sites. Three modes (memory.pmode):
//
//   work    walk to the mission room, build any of our sites, then repair
//           roads and containers; when empty, pick gather or forage.
//   gather  refill in the mission room (role.bootstrap.js taskRechargeHarvest:
//           piles, tombstones, stores, then harvest) until full.
//   forage  the mission room is a Source Keeper room or has no source, so
//           energy must come from elsewhere: walk the Rewalker route back
//           toward the spawn room (memory.home) and, in every room on the way,
//           take the nearest energy: dropped piles, tombstones and ruins,
//           stores we may withdraw from, or a source to harvest (sources in
//           SK rooms are ignored, and nothing within kLairRange of a keeper
//           lair is touched). In the home room with nothing found it falls
//           back to taskRechargeHarvest there. Full, it goes back to work.
@register
export class Paver extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        // Body "farmer" is WORK/CARRY/CARRY per MOVE.
        return this.closeSpawn(spawns, { body: "farmer" });
    }

    // Typed view of the legacy prototype mixins.
    get cc(): CreepRepair {
        return this.c as CreepRepair;
    }

    get mode(): Mode {
        return this.memory.pmode || "work";
    }

    set mode(mode: Mode) {
        if (this.memory.pmode === mode) return;
        this.dlog("mode", this.memory.pmode, "->", mode);
        this.memory.pmode = mode;
    }

    get energy(): number {
        return this.c.store[RESOURCE_ENERGY] || 0;
    }

    get full(): boolean {
        return this.c.store.getFreeCapacity() === 0;
    }

    get homeName(): string {
        return this.memory.home || Game.spawns[this.memory.nest]?.room.name || this.mission.roomName;
    }

    // Can the mission room feed a paver? Not an SK room, and it has a source.
    // Without vision assume it can; work mode walks there first anyway.
    get canGather(): boolean {
        const roomName = this.mission.roomName;
        if (roomKind(roomName) === Kind.SourceKeeper) return false;
        const room = Game.rooms[roomName];
        if (!room) return true;
        return room.find(FIND_SOURCES).length > 0;
    }

    start(): Task2Ret {
        const c = this.cc;
        // role.bootstrap.js taskRechargeHarvest and creep.oldrepair.js
        // taskRepairRemote are JS mixins without typings.
        const legacy = c as any;
        const what = c.idleRetreat(WORK) || c.fleeHostiles() || c.taskTask();
        if (what) return "wait";

        switch (this.mode) {
            case "gather": return this.gather(legacy);
            case "forage": return this.forage(legacy);
            default: return this.work(legacy);
        }
    }

    work(legacy: any): Task2Ret {
        if (!this.energy) {
            this.mode = this.canGather ? "gather" : "forage";
            return "start";
        }
        if (this.pos.roomName !== this.mission.roomName) {
            return this.moveRoom(this.mission.roomName);
        }
        this.cc.taskBuildAny() || legacy.taskRepairRemote();
        return "wait";
    }

    gather(legacy: any): Task2Ret {
        if (this.full || !this.canGather) {
            this.mode = this.full ? "work" : "forage";
            return "start";
        }
        if (this.pos.roomName !== this.mission.roomName) {
            return this.moveRoom(this.mission.roomName);
        }
        if (!legacy.taskRechargeHarvest() && this.energy) {
            // Nothing more here; work with what we have.
            this.mode = "work";
            return "start";
        }
        return "wait";
    }

    forage(legacy: any): Task2Ret {
        if (this.full) {
            this.mode = "work";
            return "start";
        }
        const found = this.pos.findClosestByRange(this.forageHere(this.c.room));
        if (found) return this.take(found);

        const homeName = this.homeName;
        if (this.pos.roomName === homeName) {
            if (legacy.taskRechargeHarvest()) return "wait";
            if (this.energy) {
                this.mode = "work";
                return "start";
            }
            this.dlog("nothing to forage at home");
            return "wait";
        }
        const route = rewalker.getRoute(this.pos.roomName, homeName);
        const next = route[1] || homeName;
        return this.moveRoom(next);
    }

    // Energy in `room` a forager may take: piles, tombstones, ruins, stores
    // we may withdraw from, and sources outside SK rooms; nothing near a lair.
    forageHere(room: Room): Forage[] {
        const sk = roomKind(room.name) === Kind.SourceKeeper;
        const lairs = sk ? room.findStructs(STRUCTURE_KEEPER_LAIR) : [];
        const safe = (o: { pos: RoomPosition }) => !lairs.length || !o.pos.findInRange(lairs, kLairRange).length;

        const out: Forage[] = [];
        for (const r of room.find(FIND_DROPPED_RESOURCES)) {
            if (r.resourceType === RESOURCE_ENERGY && r.amount >= kMinPile && safe(r)) out.push(r);
        }
        for (const t of room.find(FIND_TOMBSTONES)) if (t.store[RESOURCE_ENERGY] > 0 && safe(t)) out.push(t);
        for (const r of room.find(FIND_RUINS)) if (r.store[RESOURCE_ENERGY] > 0 && safe(r)) out.push(r);
        for (const s of room.findStructs(STRUCTURE_CONTAINER, STRUCTURE_STORAGE, STRUCTURE_LINK, STRUCTURE_TERMINAL)) {
            const store = s as AnyStoreStructure;
            const mine = (store as any).my !== false; // containers are nobody's
            if (mine && (store.store[RESOURCE_ENERGY] || 0) > 0 && safe(store)) out.push(store);
        }
        if (!sk) {
            for (const src of room.find(FIND_SOURCES)) if (src.energy > 0) out.push(src);
        }
        return out;
    }

    // Pick up, withdraw from, or harvest `target` until it or our room runs out.
    @task
    take(target: Forage): Task2Ret {
        if (this.full) return "start";
        if (target instanceof Source ? target.energy <= 0 :
            target instanceof Resource ? target.amount <= 0 :
                (target.store[RESOURCE_ENERGY] || 0) <= 0) return "start";
        if (!this.pos.isNearTo(target)) {
            this.moveTarget(target, 1);
            return "wait";
        }
        let err: ScreepsReturnCode;
        if (target instanceof Source) err = this.c.harvest(target);
        else if (target instanceof Resource) err = this.c.pickup(target);
        else err = this.c.withdraw(target, RESOURCE_ENERGY);
        if (err !== OK) {
            this.dlog("take failed", err, target);
            return "start";
        }
        // Harvesting continues until full; one pickup or withdraw is the lot.
        return target instanceof Source ? "wait" : "start";
    }

    after() {
        const c = this.cc;
        // Scoop energy dropped or left in tombstones/ruins within reach.
        c.idleNom();
        c.idleBuild() || c.idleRepairAny();
    }
}
