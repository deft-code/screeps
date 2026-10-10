import { Harvester } from "job.harvester";
import { register, Task2Ret } from "mycreep";
import { MetaStructure } from "metastruct";

// The Harvester of the SK farm (ms.skfarm.ts): a Harvester (job.harvester.ts)
// that works the farm's rsrc metas, whose container tiles are the spots
// SkFarm picks furthest from each lair. Everything about mining, building
// the container, repairing around the spot and topping up from the
// container is the Harvester's; this class adds what a keeper room needs:
//
//   - it walks with memory.rewalksk set, so the Rewalker takes it to a spot
//     beside a lair instead of refusing the keeper rings;
//   - keepers are watched every tick (flee): one within kDanger makes it
//     flee until every keeper is kSafe away; a lair within kDanger that is
//     under kLairSoon ticks from spawning is fled the same way, so it is
//     clear of the tile the next keeper appears on;
//   - in position with neither a container nor a site on the spot, it lays
//     the container site itself (nothing plans sites in an unowned room).
//
// Other armed enemies still make it retreat as a Harvester would.

const kDanger = 4;
const kSafe = 5;
const kLairSoon = 3;

@register
export class Skharvester extends Harvester {
    init(): boolean {
        if (!this.memory.rewalksk) this.memory.rewalksk = true;
        return true;
    }

    // Source Keepers in the current room.
    get keepers(): Creep[] {
        return (this.cc.room.enemies || []).filter(e => e.keeper);
    }

    // Keepers and lairs about to spawn one come first; then the Harvester's
    // own retreat from other armed enemies (keepers left out of that).
    flee(): boolean {
        const c = this.cc;
        const keepers = this.keepers;
        if (_.any(keepers, k => this.pos.inRangeTo(k, kDanger))) {
            c.idleFlee(keepers, kSafe);
            return true;
        }
        const lairs = (c.room.findStructs(STRUCTURE_KEEPER_LAIR) as StructureKeeperLair[])
            .filter(l => this.pos.inRangeTo(l, kDanger) && l.ticksToSpawn !== undefined && l.ticksToSpawn < kLairSoon);
        if (lairs.length) {
            c.idleFlee(lairs as unknown as Creep[], kSafe);
            return true;
        }
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
