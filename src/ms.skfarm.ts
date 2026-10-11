import { Mission } from "mission";
import { register, Priority } from "process";
import { Skhunter } from "job.skhunter";
import { Skvulture } from "job.skvulture";
import { Skharvester } from "job.skharvester";
import { Sktrucker } from "job.sktrucker";
import { Scout } from "job.scout";
import { HarvestMission } from "job.harvester";
import { getMetaManager, MetaStructure } from "metastruct";
import { Meta_rsrc } from "metaremote";
import * as debug from "debug";

// Source Keeper farm: "SkFarm <room> <home>". One Skhunter (job.skhunter.ts)
// spawned in the home room walks to the keeper room and kills its Source
// Keepers one at a time; one Skvulture (job.skvulture.ts) follows it and
// hauls the piles and tombstones home; kHarvesters Skharvesters
// (job.skharvester.ts) mine the sources from the rsrc metas below, and
// Sktruckers (job.sktrucker.ts) carry their containers home, as many as
// there are containers holding kTruckEnergy or more. Each is
// paced, one egg per kPace ticks (paceNJobs(x, n, kPace): n eggs per kPace),
// so a death costs the rest of that lifetime rather than keeping the spawn
// busy; kPace is a lifetime less the spawn and walk, so the next one lands
// as the last dies. Harvesting the
// freed sources comes in a later step. Without vision of the keeper room
// one Scout (job.scout.ts, from the home room) parks there, as Farm does,
// so status() and the next steps can read the room.
//
// With vision it works out a standing spot for each source and mineral:
// the walkable tile beside it with the greatest Manhattan distance from
// the nearest keeper lair (spots). They live on the mission instance only
// (computed once per global reset, never in Memory); status() lists them.
//
// Each source spot becomes an rsrc meta (Meta_rsrc, metaremote.ts: the
// container on the spot, targetid() the source) in the room's MetaManager
// (ensureMetas, whenever a source has none or its spot moved), which is
// what Skharvesters (job.skharvester.ts) claim through sourceMetas().
// windDown() deletes them again and drops their container sites.
//
//   scheduleService('SkFarm W25S6 W25S7')   // args[1]=keeper room, args[2]=home room (spawns)
// One hunter and one vulture egg each, and kHarvesters harvester eggs, per
// this many ticks.
const kPace = 1450;
const kHarvesters = 3;
// A container holding this much energy earns a trucker in the pace count.
const kTruckEnergy = 500;

interface SkSpot {
    // What is mined there and where it is.
    kind: "source" | "mineral"
    id: Id<Source> | Id<Mineral>
    pos: RoomPosition
    // The lair the spot keeps away from, and how far (Manhattan).
    lair: RoomPosition
    dist: number
}

// Walkable tiles beside `pos` (terrain only: structures come and go).
function neighbours(pos: RoomPosition): RoomPosition[] {
    const terrain = Game.map.getRoomTerrain(pos.roomName);
    const out: RoomPosition[] = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            const x = pos.x + dx;
            const y = pos.y + dy;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            out.push(new RoomPosition(x, y, pos.roomName));
        }
    }
    return out;
}

function manhattan(a: RoomPosition, b: RoomPosition): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

@register
export class SkFarm extends Mission implements HarvestMission {
    get roomName() {
        return this.args[1];
    }

    getRoomName(alias = "") {
        if (alias === "home") return this.args[2] || null;
        return super.getRoomName(alias);
    }

    // The standing spots, computed on first use with vision (heap only).
    private _spots: SkSpot[] | null = null;

    get spots(): SkSpot[] {
        if (this._spots) return this._spots;
        const room = this.room;
        if (!room) return [];
        const lairs = room.findStructs(STRUCTURE_KEEPER_LAIR) as StructureKeeperLair[];
        if (!lairs.length) return [];
        const spots: SkSpot[] = [];
        const targets: (Source | Mineral)[] = [...room.find(FIND_SOURCES), ...room.find(FIND_MINERALS)];
        for (const t of targets) {
            const lair = _.min(lairs, l => l.pos.getRangeTo(t)) as StructureKeeperLair;
            const tiles = neighbours(t.pos);
            if (!tiles.length) continue;
            const pos = _.max(tiles, p => manhattan(p, lair.pos)) as RoomPosition;
            spots.push({
                kind: t instanceof Source ? "source" : "mineral",
                id: t.id,
                pos,
                lair: lair.pos,
                dist: manhattan(pos, lair.pos),
            });
        }
        this._spots = spots;
        return spots;
    }

    // The rsrc metas for the source spots, made or moved as needed.
    ensureMetas() {
        const room = this.room;
        if (!room) return;
        const man = getMetaManager(this.roomName);
        let dirty = false;
        for (const s of this.spots) {
            if (s.kind !== "source") continue;
            const src = Game.getObjectById(s.id as Id<Source>);
            if (!src) continue;
            const name = `rsrc_${src.pos.xy}`;
            const have = man.getMeta(name);
            if (have && have.myspot === s.pos.xy) continue;
            man.setMeta(Meta_rsrc.make(man, src, s.pos));
            debug.log(this.name, have ? "moved" : "made", name, "at", s.pos);
            dirty = true;
        }
        if (dirty) man.save();
    }

    // The metas the Skharvesters claim (HarvestMission).
    sourceMetas(): MetaStructure[] {
        const man = getMetaManager(this.roomName);
        return _.compact(this.spots.filter(s => s.kind === "source")
            .map(s => man.getMeta(`rsrc_${Game.getObjectById(s.id as Id<Source>)?.pos.xy}`))) as MetaStructure[];
    }

    // The containers standing on the source spots (the harvesters' drops).
    containers(): StructureContainer[] {
        const room = this.room;
        if (!room) return [];
        return _.compact(this.sourceMetas().map(m => _.find(room.unpackPos(m.myspot).lookFor(LOOK_STRUCTURES),
            s => s.structureType === STRUCTURE_CONTAINER))) as StructureContainer[];
    }

    // Drop the metas and their container sites on the way out.
    removeMetas() {
        const man = getMetaManager(this.roomName);
        const room = this.room;
        for (const meta of man.metas.filter(m => /^rsrc_/.test(m.name))) {
            if (room) {
                for (const xy of meta.getSites(STRUCTURE_CONTAINER)) {
                    for (const site of room.unpackPos(xy).lookFor(LOOK_CONSTRUCTION_SITES)) {
                        if (site.my && site.structureType === STRUCTURE_CONTAINER) site.remove();
                    }
                }
            }
            man.deleteMeta(meta.name);
        }
        man.save();
    }

    windDown() {
        this.removeMetas();
        super.windDown();
    }

    run(): Priority {
        if (this.windingDown) return super.run();
        if (!this.room) this.nJobs(Scout, 1);
        this.ensureMetas();
        this.paceNJobs(Skhunter, 1, kPace);
        this.paceNJobs(Skvulture, 1, kPace);
        this.paceNJobs(Skharvester, kHarvesters, kPace);
        this.paceNJobs(Sktrucker, this.containers().filter(k => k.store.energy >= kTruckEnergy).length, kPace);
        super.run();
        return "normal";
    }

    // Keepers alive in the farm room and the hits of the hunter's target,
    // or no vision.
    status(): string {
        const room = this.room;
        if (!room) return super.status() + " no vision";
        const keepers = (room.enemies || []).filter(e => e.keeper);
        const spots = this.spots.map(s => `${s.kind[0]}@${s.pos.x},${s.pos.y}:${s.dist}`).join(" ");
        return super.status() + ` keepers:${keepers.length}` + (keepers.length ? ` top:${_.max(keepers.map(k => k.hits))}` : "") + ` spots:${spots || "-"}`;
    }
}
