import { JobRole } from "job.role";
import { register } from "mycreep";

@register
export class Hub extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        if (!this.mission.room?.storage ||
            this.mission.room?.meta.getSpot('hub')) {
            return [null, []];
        }
        return this.localSpawn(spawns, {});
    }
}