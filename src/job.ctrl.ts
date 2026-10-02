import { EnergyReserve, RCL2Energy } from "constants";
import { JobRole } from "job.role";
import { kebabCase } from "lodash";
import { register } from "mycreep";
import { Mission } from "mission";

// Room energy at which a ctrl may spawn even if the room holds more.
const kFullEnough = 5000;

@register
export class Ctrl extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn| null, BodyPartConstant[]] {
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

        return this.localSpawn(spawns, {
            boosts: [RESOURCE_CATALYZED_GHODIUM_ACID],
            ecap: cap
        });
    }
}