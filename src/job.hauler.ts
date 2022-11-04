
import { JobRole } from "job.role";
import { register } from "mycreep";

@register
class Hauler extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn|null, BodyPartConstant[]] {
        const room = this.mission.room;
        if (!room) return [null, []];
        return this.localSpawn(spawns, { energy: Math.min(2500, room.energyCapacityAvailable / 2) });
    }
}