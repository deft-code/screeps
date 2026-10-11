import { Harvester } from "job.harvester";
import { register, Task2Ret } from "mycreep";
import { MetaStructure } from "metastruct";
import { CreepMove } from "creep.move";

// The Harvester of the SK farm (ms.skfarm.ts): a Harvester (job.harvester.ts)
// that works the farm's rsrc metas, whose container tiles are the spots
// SkFarm picks furthest from each lair. Everything about mining, building
// the container, repairing around the spot and topping up from the
// container is the Harvester's; this class adds what a keeper room needs:
//
//   - it walks with memory.rewalksk set, so the Rewalker takes it to a spot
//     beside a lair instead of refusing the keeper rings;
//   - keepers are watched every tick (flee): one within kDanger (5) makes
//     it flee until every keeper is kSafe (6) away, and at kSafe it holds
//     still; a lair within kDanger that is under kLairSoon (4) ticks from
//     spawning is fled the same way, so it is clear of the tile the next
//     keeper appears on;
//   - in position with neither a container nor a site on the spot, it lays
//     the container site itself (nothing plans sites in an unowned room).
//
// Other armed enemies still make it retreat as a Harvester would.
//
// Fixed body 4 MOVE, 8 WORK, 1 CARRY (1050): 16 energy a tick against the
// 13.3 a keeper source regenerates, from the same spawns a Harvester would
// use (home room first). It never takes energy off a passing hauler
// (donatable 0): whatever it holds is for the container site and repairs.

const kDanger = 5;
const kSafe = 6;
const kLairSoon = 4;

// The keeper rules every SK farm civilian follows (Skharvester, Sktrucker):
// a Source Keeper within kDanger, or a lair within kDanger under kLairSoon
// ticks from spawning one, is fled (idleFlee) until kSafe away; with a
// keeper at exactly kSafe the creep stands still, or the next step back to
// work would put it at kDanger and it would bounce between the two ranges
// (Oct 2026). True when the creep fled or held this tick.
export function fleeKeepers(c: CreepMove): boolean {
    const keepers = (c.room.enemies || []).filter(e => e.keeper);
    if (_.any(keepers, k => c.pos.inRangeTo(k, kDanger))) {
        c.idleFlee(keepers, kSafe);
        return true;
    }
    if (_.any(keepers, k => c.pos.inRangeTo(k, kSafe))) return true;
    const lairs = (c.room.findStructs(STRUCTURE_KEEPER_LAIR) as StructureKeeperLair[])
        .filter(l => c.pos.inRangeTo(l, kDanger) && l.ticksToSpawn !== undefined && l.ticksToSpawn < kLairSoon);
    if (lairs.length) {
        c.idleFlee(lairs as unknown as Creep[], kSafe);
        return true;
    }
    return false;
}

@register
export class Skharvester extends Harvester {
    static readonly parts: BodyPartConstant[] = [
        MOVE, MOVE, MOVE, MOVE,
        WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
        CARRY,
    ];

    static readonly cost = _.sum(Skharvester.parts, part => BODYPART_COST[part]);

    // The Harvester's spawn choice with this body in place of its scaled one.
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const [spawn] = super.spawn(spawns);
        if (!spawn || spawn.room.energyCapacityAvailable < Skharvester.cost) return [null, []];
        return [spawn, Skharvester.parts];
    }

    donatable(): number {
        return 0;
    }

    init(): boolean {
        if (!this.memory.rewalksk) this.memory.rewalksk = true;
        return true;
    }

    // Source Keepers in the current room.
    get keepers(): Creep[] {
        return (this.cc.room.enemies || []).filter(e => e.keeper);
    }

    // Keepers and lairs about to spawn one come first (fleeKeepers); then
    // the Harvester's own retreat from other armed enemies (keepers left
    // out of that).
    flee(): boolean {
        const c = this.cc;
        if (fleeKeepers(c)) return true;
        if (c.idleRetreat(WORK)) return true;
        const hostiles = (c.room.hostiles || []).filter(h => !h.keeper);
        if (hostiles.length && c.idleFlee(hostiles, c.hurts ? 5 : 3)) return true;
        return false;
    }

    // On the spot with no container and no site: lay the site, then work
    // as a Harvester (it builds the site next tick).
    work(meta: MetaStructure, spot: RoomPosition): Task2Ret {
        const cont = _.first(spot.lookFor(LOOK_STRUCTURES).filter(s => s.structureType === STRUCTURE_CONTAINER));
        const site = _.first(spot.lookFor(LOOK_CONSTRUCTION_SITES).filter(s => s.structureType === STRUCTURE_CONTAINER));
        if (!cont && !site) {
            const err = spot.createConstructionSite(STRUCTURE_CONTAINER);
            if (err !== OK) this.log("container site at", spot, "failed", err);
        }
        return super.work(meta, spot);
    }
}
