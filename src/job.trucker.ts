import { JobRole } from "job.role";
import { register, Task2Ret } from "mycreep";
import { CreepRepair } from "creep.repair";
import { closeSpawns } from "spawnold";
import { energyDef } from "spawn";
import type { Remote } from "ms.remote";

// Port of role.trucker.js (team.ts trucker/truckaga) for the Remote mission.
// Shuttles energy from the remote's rsrc containers to the home storage.
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
    // room's energy capacity, at most 50 parts.
    static body(ecap: number): BodyPartConstant[] {
        return energyDef({ move: 2, per: [CARRY], energy: Math.min(ecap, 2500), max: 32 } as any);
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

        // More than half full: go home and unload.
        if (c.store.getUsedCapacity() > c.store.getFreeCapacity()) {
            if (this.pos.roomName !== this.homeName) return this.moveRoom(this.homeName);
            const home = Game.rooms[this.homeName];
            const store = home?.storage || home?.terminal;
            if (!store) {
                this.log("no storage in", this.homeName);
                return "wait";
            }
            for (const res of Object.keys(c.store) as ResourceConstant[]) {
                if (c.goTransfer(store, res)) return "wait";
            }
            return "wait";
        }

        if (this.pos.roomName !== this.mission.roomName) return this.moveRoom(this.mission.roomName);
        return this.load();
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
