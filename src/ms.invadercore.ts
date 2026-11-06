import { Mission } from "mission";
import { register, Priority } from "process";
import { Scout } from "job.scout";
import { defaultRewalker } from "Rewalker";
import { theRadar } from "radar";
import * as debug from "debug";

// InvaderCore <room> [home]: look at a stronghold and evolve into the
// mission that fits its invader core's level. Vision through the radar
// (theRadar.observeNow each tick) while it has an observer, else a Scout
// from home. With the room in sight the mission evolves (Mission.evolve:
// the scout goes along) into the sibling for the core's level; a level
// with no sibling yet, or a room with no core, is logged every kLogPace
// ticks and the mission waits.
//
//   scheduleService('InvaderCore W4N6 W3N4')   // args[1]=stronghold room, args[2]=home (spawns and labs)
//
// Without a home the owned room with a spawn nearest by Rewalker route is
// taken (homeName).
//
// Siblings so far: InvaderCoreThree (ms.invadercorethree.ts) for level 3.
const kLogPace = 100;
const kSiblings: { [level: number]: string } = {
    3: "InvaderCoreThree",
};

const rewalker = defaultRewalker();

@register
export class InvaderCore extends Mission {
    get roomName() {
        return this.args[1];
    }

    // The home named, else the owned room with a spawn nearest the target.
    get homeName(): string | null {
        if (this.args[2]) return this.args[2];
        const rooms = _.uniq(_.map(Game.spawns, s => s.room.name));
        if (!rooms.length) return null;
        return _.min(rooms, r => rewalker.getRouteDist(r, this.roomName));
    }

    getRoomName(alias = "") {
        if (alias === "home" || alias === "spawn") return this.homeName;
        return super.getRoomName(alias);
    }

    get core(): StructureInvaderCore | null {
        return _.first(this.room?.findStructs(STRUCTURE_INVADER_CORE) || []) || null;
    }

    run(): Priority {
        if (this.windingDown) return super.run();
        const room = this.room;
        if (room) {
            const core = this.core;
            const sibling = core && kSiblings[core.level];
            if (sibling) {
                debug.log(this.name, this.roomName, "has a level", core!.level, "core; evolving into", sibling);
                this.evolve(`${sibling} ${this.roomName} ${this.homeName || ""}`.trim());
                return super.run();
            }
            if (Game.time % kLogPace === 0) {
                debug.log(this.name, this.roomName, core ? `has a level ${core.level} core; no sibling mission for that yet` : "has no invader core");
            }
        }
        if (theRadar.observers.size) theRadar.observeNow(this.roomName);
        else if (!room) this.nJobs(Scout, 1);
        super.run();
        return "normal";
    }

    status(): string {
        const core = this.core;
        return super.status() + ` home:${this.homeName || "-"} visible:${!!this.room} core:${core ? "level " + core.level : this.room ? "none" : "?"}`;
    }
}
