import { EnergyReserve, RCL2Energy } from "constants";
import { JobCreep } from "job.creep";
import { register, Task2Ret } from "mycreep";
import { Mission } from "mission";
import { buildBody, findSpawns } from "spawnold";
import { isStoreStruct } from "guards";

// Room energy at which a ctrl may spawn even if the room holds more.
const kFullEnough = 5000;

// The controller upgrader of GlobalRespawn/Hub: stands on the room's `ctrl`
// spot (Meta_ctrl, beside the controller link and container) and upgrades
// every tick. Pure job (Nov 2026; before, role.ctrl.js through the JobRole
// bridge): each tick, in this order,
//
//   1. walk to the ctrl spot (within 3 of the controller when the room has
//      none);
//   2. fill: when the creep holds less energy than one full-power upgrade
//      uses (WORK parts, 15 at RCL8), withdraw from an adjacent store, the
//      storage first, else the store it drew from last (kept on the heap,
//      never in memory), else the fullest adjacent one. The engine
//      processes a withdraw before an upgrade, so the energy counts this
//      tick, but the API refuses an upgrade while the creep's `carry` view
//      shows none: an empty creep that withdrew nudges `carry.energy` so
//      its upgrade goes out too (measured 4 Nov 2026: a tick started empty
//      scored the full 4 GCL instead of 0);
//   3. upgrade.
//
// No boosts. Spawns only with the room full (energyAvailable at least
// min(capacity, kFullEnough)), sized by Hub.ctrlCap or the RCL/storage rules
// in spawn().
@register
export class Ctrl extends JobCreep {
    // The store drawn from last; re-picked when gone, empty or not adjacent.
    private sourceId?: Id<AnyStoreStructure>;

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const room = this.mission.room;
        if (!room) return [null, []];

        // Wait for a full room, so a room still refilling never gets a
        // smaller ctrl than it could have had. No ctrl body costs more than
        // kFullEnough, so a bigger room need not fill past that.
        if (room.energyAvailable < Math.min(room.energyCapacityAvailable, kFullEnough)) return [null, []];

        // A mission may pin the size (Hub.ctrlCap; Thorhub keeps it small).
        // Otherwise full size while the room has no storage (all energy is
        // for the controller anyway); small at RCL8 or while the storage is
        // below the reserve.
        const pinned = (this.mission as Mission & { ctrlCap?(room: Room): number | null }).ctrlCap?.(room);
        let cap = room.energyCapacityAvailable;
        if (pinned != null) {
            cap = pinned;
        } else if (room.controller!.level > 7) {
            cap = RCL2Energy;
        } else if (room.storage && room.storage.store.energy < EnergyReserve) {
            cap = RCL2Energy;
        }

        // The 'ctrl' body of spawnold's table from a local spawn (or the
        // mission's pinned spawn room), sized to cap.
        const eggMem: any = { spawn: this.mission.getRoomName("spawn") || "local", body: this.role, ecap: cap };
        const possible = findSpawns(spawns, this.mission.roomName, eggMem) as StructureSpawn[];
        const maxRCL = Math.max(...possible.map(s => s.room.controller!.level));
        return buildBody(possible, eggMem, { maxRCL }) as [StructureSpawn | null, BodyPartConstant[]];
    }

    // Energy one full-power upgrade uses this tick.
    get power(): number {
        const c = this.c;
        const work = c.getActiveBodyparts(WORK) * UPGRADE_CONTROLLER_POWER;
        const ctrl = c.room.controller;
        return ctrl && ctrl.level >= 8 ? Math.min(work, CONTROLLER_MAX_UPGRADE_PER_TICK) : work;
    }

    start(): Task2Ret {
        const c = this.c;
        const ctrl = c.room.controller;
        if (!ctrl || !ctrl.my) {
            this.dlog("no controller of ours in", c.room.name);
            return "wait";
        }
        const spot = c.room.getSpot(this.role);
        if (spot) {
            if (!this.pos.isEqualTo(spot)) {
                this.walkTo(spot, 0);
                return "wait";
            }
        } else if (!this.pos.inRangeTo(ctrl, 3)) {
            this.walkTo(ctrl.pos, 3);
            return "wait";
        }
        this.fill();
        if (c.carry.energy) this.upgradeController(ctrl);
        return "wait";
    }

    // Top up for a full-power upgrade (see the header).
    fill(): void {
        const c = this.c;
        if (c.store.energy >= this.power) return;
        const src = this.pickSource();
        if (!src) return;
        const amount = Math.min(c.store.getFreeCapacity(RESOURCE_ENERGY), src.store.energy);
        if (amount <= 0) return;
        if (this.withdraw(src, RESOURCE_ENERGY, amount) !== OK) {
            this.sourceId = undefined;
            return;
        }
        if (!c.store.energy) c.carry.energy = 1;
    }

    // An adjacent store with energy: the storage, else the one used last,
    // else the fullest. Towers, extensions and spawns are never drawn from.
    pickSource(): AnyStoreStructure | null {
        const c = this.c;
        const near = c.room.lookForAtRange(LOOK_STRUCTURES, c.pos, 1, true)
            .map(spot => spot[LOOK_STRUCTURES])
            .filter(s => s.structureType !== STRUCTURE_TOWER && s.structureType !== STRUCTURE_EXTENSION
                && s.structureType !== STRUCTURE_SPAWN)
            .filter(s => isStoreStruct(s) && s.store.energy > 0) as AnyStoreStructure[];
        const pick = near.find(s => s.structureType === STRUCTURE_STORAGE)
            || near.find(s => s.id === this.sourceId)
            || _.max(near, s => s.store.energy);
        if (!pick || (pick as unknown) === -Infinity) {
            this.sourceId = undefined;
            return null;
        }
        this.sourceId = pick.id;
        return pick;
    }
}
