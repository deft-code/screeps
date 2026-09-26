import { JobRole } from "job.role";
import { register, Task2Ret } from "mycreep";
import { CreepRepair } from "creep.repair";
import { closeSpawns } from "spawnold";
import { energyDef } from "spawn";
import { isGeneralStoreStruct, isStoreStruct } from "guards";
import type { Remote } from "ms.remote";

// Port of role.trucker.js (team.ts trucker/truckaga) for the Remote mission.
// Shuttles energy from the remote's rsrc containers to the home storage, or
// while home has none (RCL3) into its containers, emptiest first.
// Offroad while empty, so it spawns from the spawns nearest the remote; the
// loaded trip home follows the roads the Remote planned. Never builds or
// repairs: the paver and harvester do that.
@register
export class Trucker extends JobRole {
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

        // More than half full: go home and unload until empty
        // (JobCreep.unloadHome: storage, terminal, else home containers).
        if (this.unloadLatch(c.store.getUsedCapacity() > c.store.getFreeCapacity())) {
            return this.unloadHome(this.homeName) || this.dropHome();
        }

        // Anywhere but the remote, any energy goes home to the pile rather
        // than riding along.
        if (this.pos.roomName !== this.mission.roomName) return this.dropHome() || this.moveRoom(this.mission.roomName);
        // Nothing to load: at half full carry it home and pile it at the
        // controller, else wait by the container.
        const half = c.store.energy * 2 >= c.store.getCapacity();
        return this.load() || (half && this.dropHome()) || this.waitAtCont();
    }

    // With nowhere to unload at home (or nothing to load here) drop the load
    // by the home controller (JobCreep.dropAt), where Hub's pile upgraders
    // burn it. False when empty.
    dropHome(): Task2Ret {
        if (!this.c.store.getUsedCapacity()) return false;
        const home = Game.rooms[this.homeName];
        if (!home) return this.moveRoom(this.homeName);
        if (!home.controller) {
            this.log("no controller to drop at in", this.homeName);
            return "wait";
        }
        return this.dropAt(home.controller);
    }

    // The rsrc container holding the most energy, if any is built.
    fullestCont(): StructureContainer | null {
        const conts = _.compact(this.remote.rsrcMetas().map(m => m.getStructs(STRUCTURE_CONTAINER)[0])) as StructureContainer[];
        if (!conts.length) return null;
        return _.max(conts, k => k.store.energy);
    }

    // Take from the fullest rsrc container; sweep dropped energy on the way.
    // False when there is nothing to take this tick.
    load(): Task2Ret {
        const c = this.cc;
        const dropped = _.find(
            c.room.lookForAtRange(LOOK_RESOURCES, this.pos, 1, true),
            r => r[LOOK_RESOURCES].resourceType === RESOURCE_ENERGY);
        if (dropped && c.goPickup(dropped[LOOK_RESOURCES], false)) return "wait";

        const cont = this.fullestCont();
        if (!cont || !cont.store.energy) return false;
        c.goWithdraw(cont, RESOURCE_ENERGY);
        return "wait";
    }

    // Wait next to the container the harvester is filling.
    waitAtCont(): Task2Ret {
        const cont = this.fullestCont();
        if (cont && !this.pos.isNearTo(cont)) this.moveTarget(cont, 1);
        return "wait";
    }

    // Grab any energy lying next to the path (spilled drop-mining, tombstones),
    // else at home top up whatever structure beside us takes energy, else a
    // working creep beside us.
    after() {
        this.cc.idleNom() || this.idleFillHome() || this.idleShare();
    }

    // In the home room, transfer energy into an adjacent structure with room
    // for it: extensions, spawns, towers and the like first, then general
    // stores (storage, terminal, containers). One transfer per tick.
    idleFillHome(): string | false {
        const c = this.cc;
        if (this.pos.roomName !== this.homeName) return false;
        if (c.intents.transfer || !c.store.energy) return false;
        const structs = c.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true)
            .map(look => look[LOOK_STRUCTURES])
            .filter(s => isStoreStruct(s) && ((s.store as GenericStore).getFreeCapacity(RESOURCE_ENERGY) || 0) > 0) as AnyStoreStructure[];
        const target = _.find(structs, s => !isGeneralStoreStruct(s)) || _.first(structs);
        if (!target) return false;
        return c.goTransfer(target as XferStruct, RESOURCE_ENERGY, false);
    }

    // Hand energy to an adjacent creep of ours that has CARRY and WORK (a
    // worker, paver, harvester...) and room for it. One transfer per tick,
    // the emptiest neighbour first. Lives here for now; meant for
    // creep.carry.ts once every job wants it.
    idleShare(): string | false {
        const c = this.cc;
        if (c.intents.transfer) return false;
        const carried = c.store.energy;
        if (!carried) return false;
        const target = _(this.pos.findInRange(FIND_MY_CREEPS, 1))
            .filter(o => o.name !== c.name
                && o.getActiveBodyparts(CARRY) > 0
                && o.getActiveBodyparts(WORK) > 0
                && o.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
            .max(o => o.store.getFreeCapacity(RESOURCE_ENERGY)) as Creep | number;
        if (!(target instanceof Creep)) return false;
        const amount = Math.min(carried, target.store.getFreeCapacity(RESOURCE_ENERGY));
        const err = c.transfer(target, RESOURCE_ENERGY, amount);
        if (err !== OK) return false;
        c.intents.transfer = target;
        return `share ${amount} ${target.name}`;
    }
}
