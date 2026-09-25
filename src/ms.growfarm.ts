import { Farm } from "ms.farm";
import { register, Priority } from "process";
import { getMetaManager } from "metastruct";
import { getSpots } from "spots";
import * as debug from "debug";

const RCL3 = 3;
const RCL4 = 4;
// Energy capacity of a full room at an RCL: one spawn plus its extensions.
function fullCapacity(rcl: number): number {
    return SPAWN_ENERGY_CAPACITY + CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][rcl] * EXTENSION_ENERGY_CAPACITY[rcl];
}
// 800: the Remote's full harvester body.
const kRemoteCapacity = fullCapacity(RCL3);
// 1300: a farm controller with a single free tile takes one reserver at a
// time, so it waits for bodies with more CLAIM.
const kOneSpotCapacity = fullCapacity(RCL4);
// Ticks between "waiting" log lines while the home room is growing.
const kLogPace = 500;

// A Farm for a young home room that evolves into a Remote on the same
// arguments once the home room can afford the Remote's bodies (a full RCL3
// room: the 800-energy harvester; a full RCL4 room when the farm controller
// has a single free tile, so its lone reserver carries more CLAIM) and has a storage built or planned, which
// the Remote's road planner paths to. Farmers, eggs and pacing timers are
// handed over by Mission.evolve; the farmers live out their lives there.
//
// Schedule from the console, arguments as Farm/Remote:
//   scheduleService('GrowFarm W5N8 W6N8')        // args[1]=farm room, args[2]=home room
//   scheduleService('GrowFarm W5N8 W6N8 W7N8')   // optional args[3]=the only room its creeps spawn from
@register
export class GrowFarm extends Farm {
    run(): Priority {
        if (this.windingDown) return super.run();
        if (this.grown()) {
            const cmd = ["Remote", ...this.args.slice(1)].join(" ");
            if (this.evolve(cmd)) return "normal";
        }
        return super.run();
    }

    // The home room has the energy capacity needCapacity() asks for and a
    // storage the Remote can plan its roads to.
    grown(): boolean {
        const homeName = this.getRoomName("home");
        const home = homeName ? Game.rooms[homeName] : undefined;
        if (!home?.controller?.my) return false;
        const need = this.needCapacity();
        if (need === null || home.energyCapacityAvailable < need) return false;
        if (!home.storage && getMetaManager(home.name).getSite(STRUCTURE_STORAGE) === null) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "waiting: no storage planned in", home.name);
            return false;
        }
        return true;
    }

    // Home energy capacity to evolve at: a full RCL3 room, or a full RCL4
    // room when the farm controller has a single free tile around it. null
    // while the farm room is invisible (its controller is unknown).
    needCapacity(): number | null {
        const room = this.room;
        if (!room) return null;
        const ctrl = room.controller;
        if (ctrl && getSpots(ctrl.pos).length <= 1) return kOneSpotCapacity;
        return kRemoteCapacity;
    }

    status(): string {
        if (this.windingDown) return super.status();
        const home = Game.rooms[this.getRoomName("home") || ""];
        const ecap = home ? home.energyCapacityAvailable : "?";
        return super.status() + ` ecap:${ecap}/${this.needCapacity() ?? "?"}`;
    }
}
