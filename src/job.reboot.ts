import { JobCreep } from "job.creep";
import { register } from "mycreep";
import { energyDef } from "spawn";

@register
export class Reboot extends JobCreep {
    priority = 10;

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const spawn = _.sample(Game.spawns);
        if (!spawn) return [null, []];
        const energy = spawn.room.energyAvailable;
        const body = energyDef({
            move: 2,
            base: [MOVE, CARRY],
            per: [WORK, CARRY],
            energy,
        });
        return [spawn, body];
    }
}