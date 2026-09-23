import { JobRole } from "job.role";
import { register, Task2Ret } from "mycreep";
import { CreepRepair } from "creep.repair";
import { getMetaManager, MetaStructure } from "metastruct";
import type { Remote } from "ms.remote";
import { findSpawns } from "spawnold";

declare global {
    interface CreepMemory {
        // Name of the rsrc meta this harvester works (job.harvester.ts).
        rsrc?: string
    }
}

// Port of role.harvester.js (team.ts harvester/harvestaga) for the Remote
// mission. Spawns in the home room, walks to the remote, claims an rsrc meta
// (metaremote.ts) and stands on its container tile drop-mining the source:
// harvest overflow lands in the container. Builds the container site and
// repairs the container, withdrawing from it for that. Never carries energy
// away; that is the trucker's job.
@register
export class Harvester extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        // Harvesters are road-bound (3 MOVE for 10 parts) and the Remote's roads
        // run from the "home" room, so spawn there when it has spawns; fall back
        // to the nearest spawns ("local") otherwise. Every other job is offroad
        // and uses closeSpawn.
        // TODO: lift this into a JobRole.homeSpawn that takes a TS body builder
        // once another job needs home-preferring spawns with a custom body.
        // A mission's designated spawn room (Farm/Remote args[3]) overrides
        // both: those spawns and no others.
        const spawnName = this.mission.getRoomName("spawn");
        const homeName = this.mission.getRoomName("home");
        let pool: StructureSpawn[];
        if (spawnName) {
            pool = spawns.filter(s => s.room.name === spawnName);
        } else {
            pool = homeName ? spawns.filter(s => s.room.name === homeName) : [];
            if (!pool.length) pool = findSpawns(spawns, this.mission.roomName, { spawn: "local" }) as StructureSpawn[];
        }
        const spawn = _.find(pool, s => !s.spawning) || _.first(pool);
        if (!spawn) return [null, []];
        return [spawn, Harvester.body(spawn.room.energyCapacityAvailable)];
    }

    // A reserved source regenerates 10 energy/tick: 6 WORK with slack, 1 CARRY
    // so building and repairing work, 3 MOVE. Smaller homes get the floor.
    static body(ecap: number): BodyPartConstant[] {
        const full: BodyPartConstant[] = [WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE];
        const floor: BodyPartConstant[] = [WORK, WORK, WORK, CARRY, MOVE, MOVE];
        if (ecap >= 900) return full;
        if (ecap >= 550) return [WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE];
        return floor;
    }

    get cc(): CreepRepair {
        return this.c as CreepRepair;
    }

    get remote(): Remote {
        return this.mission as Remote;
    }

    // The rsrc meta this creep works, if it still exists.
    get meta(): MetaStructure | null {
        const name = this.c.memory.rsrc;
        if (!name) return null;
        return getMetaManager(this.mission.roomName).getMeta(name);
    }

    start(): Task2Ret {
        const c = this.cc;
        if (c.idleRetreat(WORK) || c.fleeHostiles()) return "wait";
        if (this.pos.roomName !== this.mission.roomName) {
            return this.moveRoom(this.mission.roomName);
        }

        let meta = this.meta;
        if (!meta) {
            meta = this.claim();
            if (!meta) return "wait";
            if (this.c.memory.rsrc !== meta.name) {
                // Every source is taken: shadow the one whose harvester dies first.
                this.movePos(this.spot(meta), 1);
                return "wait";
            }
        }
        const spot = this.spot(meta);
        if (!this.pos.isEqualTo(spot)) return this.movePos(spot, 0);
        return this.work(meta, spot);
    }

    spot(meta: MetaStructure): RoomPosition {
        const room = Game.rooms[this.mission.roomName]!;
        return room.unpackPos(meta.getSpot("rsrc"));
    }

    // Claim a free rsrc meta (recorded in memory). If all are claimed, return
    // the one whose current harvester has the fewest ticks to live, unclaimed.
    claim(): MetaStructure | null {
        const metas = this.remote.rsrcMetas();
        if (!metas.length) return null;
        const others = this.remote.roleCreeps("harvester").filter(h => h.name !== this.name);
        const owner = new Map<string, Creep>();
        for (const h of others) {
            const name = Memory.creeps[h.name]?.rsrc;
            const creep = h.c;
            if (name && creep) owner.set(name, creep);
        }
        const free = metas.find(m => !owner.has(m.name));
        if (free) {
            this.c.memory.rsrc = free.name;
            this.log("claimed", free.name);
            return free;
        }
        return _.min(metas, m => owner.get(m.name)!.ticksToLive || 0);
    }

    work(meta: MetaStructure, spot: RoomPosition): Task2Ret {
        const c = this.c;
        const src = Game.getObjectById(meta.targetid() as unknown as Id<Source>);
        if (!src) {
            this.log("no source for", meta.name);
            return "wait";
        }
        const site = _.first(spot.lookFor(LOOK_CONSTRUCTION_SITES).filter(s => s.my && s.structureType === STRUCTURE_CONTAINER));
        const cont = _.first(spot.lookFor(LOOK_STRUCTURES).filter(s => s.structureType === STRUCTURE_CONTAINER)) as StructureContainer | undefined;

        if (site) {
            if (c.store.energy >= c.getActiveBodyparts(WORK) * BUILD_POWER) {
                c.build(site);
            } else {
                c.harvest(src);
            }
            return "wait";
        }
        if (cont && cont.hits < cont.hitsMax) {
            if (c.store.energy) {
                c.repair(cont);
            } else if (cont.store.energy) {
                c.withdraw(cont, RESOURCE_ENERGY);
            } else {
                c.harvest(src);
            }
            return "wait";
        }
        if (src.energy && (!cont || cont.store.getFreeCapacity(RESOURCE_ENERGY) > 0)) {
            c.harvest(src);
        }
        return "wait";
    }

    // Idle work only in the remote itself: on the way there the harvester
    // would otherwise build and repair whatever it passes in the home room.
    after() {
        if (this.pos.roomName !== this.mission.roomName) return;
        const c = this.cc;
        c.idleNom() || c.idleBuild() || c.idleRepairAny();
    }
}
