import { JobRole } from "job.role";
import { register, registerAs } from "mycreep";


@register
export class Worker extends JobRole {
    spawn(spawns: StructureSpawn[]) {
        return this.localSpawn(spawns, {});
    }
}