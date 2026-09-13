import { register } from "mycreep";
import { Guard } from "job.guard";

// role.guard.js roleMini/afterMini simply ran the guard logic on the cheap
// fixed "mini" body ([RANGED_ATTACK, MOVE, MOVE, HEAL], 400 energy,
// spawnold.buildBody). Unlike "guard" it does not scale: the first close spawn
// with 400 energy available gets it.
// Farm and Remote lay one through paceJobs(Mini, 1500) while any enemy creep
// has been seen in the room (team.ts suppressMini, memory.tenemies).
@register
export class Mini extends Guard {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        return this.closeSpawn(spawns, { body: "mini" });
    }
}
