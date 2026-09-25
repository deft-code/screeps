import { JobRole } from "job.role";
import { register, Task2Ret } from "mycreep";
import { CreepRepair } from "creep.repair";
import { closeSpawns } from "spawnold";
import { energyDef } from "spawn";
import type { Remote } from "ms.remote";

declare global {
    interface CreepMemory {
        // Trucker is unloading at home: set once over half full, cleared
        // when empty (job.trucker.ts).
        unload?: boolean
        // Home container the trucker is carrying to while home has no storage.
        dropid?: Id<StructureContainer>
    }
}

// Port of role.trucker.js (team.ts trucker/truckaga) for the Remote mission.
// Shuttles energy from the remote's rsrc containers to the home storage, or
// while home has none (RCL3) into its containers, emptiest first.
// Offroad while empty, so it spawns from the spawns nearest the remote; the
// loaded trip home follows the roads the Remote planned. Never builds or
// repairs: the paver and harvester do that.
@register
export class Trucker extends JobRole {
    // Hauling remote energy yields to every other egg; the containers buffer it.
    priority = -1;
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        // A mission's designated spawn room (Farm/Remote args[3]) overrides
        // the nearest-first pool: those spawns and no others.
        const spawnName = this.mission.getRoomName("spawn");
        const pool = spawnName
            ? spawns.filter(s => s.room.name === spawnName)
            : closeSpawns(spawns, this.mission.roomName) as StructureSpawn[];
        const spawn = _.find(pool, s => !s.spawning) || _.first(pool);
        if (!spawn) return [null, []];
        return [spawn, Trucker.body(spawn.room.energyCapacityAvailable)];
    }

    // 2 CARRY per MOVE (full speed on roads when loaded), sized to the spawn
    // room's energy capacity, at most 50 parts, laid out CARRY, CARRY, MOVE,
    // CARRY, CARRY, MOVE, ... so a trucker under fire loses weight and speed
    // together instead of all its CARRY before any MOVE.
    static body(ecap: number): BodyPartConstant[] {
        return energyDef({ move: 2, per: [CARRY], energy: Math.min(ecap, 2500), max: 32, interleave: true } as any);
    }

    get cc(): CreepRepair {
        return this.c as CreepRepair;
    }

    get remote(): Remote {
        return this.mission as Remote;
    }

    get homeName(): string {
        return this.mission.getRoomName("home")!;
    }

    start(): Task2Ret {
        const c = this.cc;
        if (c.idleRetreat(CARRY) || c.fleeHostiles()) return "wait";

        // More than half full: go home and unload until empty.
        const mem = c.memory;
        if (c.store.getUsedCapacity() > c.store.getFreeCapacity()) mem.unload = true;
        if (!c.store.getUsedCapacity()) {
            delete mem.unload;
            delete mem.dropid;
        }
        if (mem.unload) {
            if (this.pos.roomName !== this.homeName) return this.moveRoom(this.homeName);
            const home = Game.rooms[this.homeName];
            const store = home?.storage || home?.terminal;
            if (!store) return this.unloadContainers();
            for (const res of Object.keys(c.store) as ResourceConstant[]) {
                if (c.goTransfer(store, res)) return "wait";
            }
            return "wait";
        }

        if (this.pos.roomName !== this.mission.roomName) return this.moveRoom(this.mission.roomName);
        return this.load();
    }

    // No storage at home (RCL3): carry to the home container with the most
    // free space, then the next, until empty. transfer() without an amount is
    // ERR_FULL unless the whole load fits, so pass what fits.
    unloadContainers(): Task2Ret {
        const c = this.cc;
        const home = Game.rooms[this.homeName]!;
        let cont = c.memory.dropid && Game.getObjectById(c.memory.dropid);
        if (!cont || cont.pos.roomName !== this.homeName || !cont.store.getFreeCapacity()) {
            const conts = (home.findStructs(STRUCTURE_CONTAINER) as StructureContainer[])
                .filter(k => k.store.getFreeCapacity() > 0);
            if (!conts.length) {
                delete c.memory.dropid;
                this.log("no storage or container space in", this.homeName);
                return "wait";
            }
            cont = _.max(conts, k => k.store.getFreeCapacity());
            c.memory.dropid = cont.id;
        }
        if (!this.pos.isNearTo(cont)) return this.moveTarget(cont, 1);
        if (c.intents.transfer) return "wait";
        const res = _.find(Object.keys(c.store), r => c.store[r as ResourceConstant] > 0) as ResourceConstant | undefined;
        if (!res) return "wait";
        const amount = Math.min(c.store[res], cont.store.getFreeCapacity(res));
        if (c.transfer(cont, res, amount) === OK) {
            c.intents.transfer = cont;
            // Pick the next container once this one is full.
            if (amount >= cont.store.getFreeCapacity(res)) delete c.memory.dropid;
        }
        return "wait";
    }

    // Take from the fullest rsrc container; sweep dropped energy on the way.
    load(): Task2Ret {
        const c = this.cc;
        const dropped = _.find(
            c.room.lookForAtRange(LOOK_RESOURCES, this.pos, 1, true),
            r => r[LOOK_RESOURCES].resourceType === RESOURCE_ENERGY);
        if (dropped && c.goPickup(dropped[LOOK_RESOURCES], false)) return "wait";

        const conts = _.compact(this.remote.rsrcMetas().map(m => m.getStructs(STRUCTURE_CONTAINER)[0])) as StructureContainer[];
        const cont = _.max(conts, k => k.store.energy);
        if (!cont || !conts.length) return "wait";
        if (!cont.store.energy) {
            // Wait next to the container the harvester is filling.
            if (!this.pos.isNearTo(cont)) this.moveTarget(cont, 1);
            return "wait";
        }
        c.goWithdraw(cont, RESOURCE_ENERGY);
        return "wait";
    }

    // Grab any energy lying next to the path (spilled drop-mining, tombstones).
    after() {
        this.cc.idleNom();
    }
}
