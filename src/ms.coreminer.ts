import { Mission } from "mission";
import { register, Priority } from "process";
import { Scout } from "job.scout";
import { Prospector, ProspectMission, roomMineral, roomStock, wantProspector } from "job.prospector";

// CoreMiner: mines the ordinary mineral of a sector's centre room (the
// "core" room, x5y5: three sources, a mineral, no controller, no keepers)
// from a home room.
//
//   scheduleService('CoreMiner W5N5 W3N4')   // args[1]=core room, args[2]=home room (spawns, stock)
//
// One Scout (job.scout.ts) from home parks in the room every kScoutPace
// ticks for vision. With vision, one Prospector (job.prospector.ts) per
// kProspectPace mines the mineral and carries it home, laid only while
// job.prospector's wantProspector holds (mineral left, home under 50k of it,
// no armed enemy in the room; the keeper-tombstone rule does not apply, the
// room has no lairs) and the room holds no hostile creep of anyone's and no
// invader core: a hostile in the core room means no prospector, armed or
// not (Nov 2026). A living prospector keeps its own retreat rule (job's
// `threatened`). The prospector needs an extractor on the mineral; whoever
// built one, it harvests through it.
//
// Winds down by hand (windDown()); nothing here ends the mission.

const kScoutPace = 1400;
const kProspectPace = 1450;

@register
export class CoreMiner extends Mission implements ProspectMission {
    get roomName() {
        return this.args[1];
    }

    getRoomName(alias = "") {
        if (alias === "home") return this.args[2] || null;
        return super.getRoomName(alias);
    }

    // Any tile beside the mineral.
    mineralSpot(): RoomPosition | null {
        return null;
    }

    // Anyone else's creep, or an invader core, in the room.
    get hostile(): boolean {
        const room = this.room;
        if (!room) return false;
        if (room.find(FIND_HOSTILE_CREEPS).length) return true;
        return room.find(FIND_HOSTILE_STRUCTURES, { filter: s => s.structureType === STRUCTURE_INVADER_CORE }).length > 0;
    }

    run(): Priority {
        if (this.windingDown) return super.run();
        this.paceJobs(Scout, kScoutPace);
        const room = this.room;
        if (room && !this.hostile && wantProspector(room, this.getRoom("home"))) {
            this.paceNJobs(Prospector, 1, kProspectPace);
        }
        super.run();
        return "normal";
    }

    status(): string {
        const room = this.room;
        const mineral = roomMineral(room);
        const home = this.getRoom("home");
        const parts = [super.status()];
        if (!room) parts.push("no vision");
        else {
            parts.push(mineral ? `${mineral.mineralType}:${mineral.mineralAmount}` : "no mineral");
            parts.push(this.hostile ? "HOSTILE" : "clear");
            if (mineral && home) parts.push(`home:${roomStock(home, mineral.mineralType)}`);
        }
        return parts.join(" ");
    }
}
