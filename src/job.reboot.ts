import { JobCreep } from "job.creep";
import { register } from "mycreep";
import { energyDef } from "spawn";

@register
export class Reboot extends JobCreep {
    priority = 10;

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        // The mission room's own spawns when it has any (its Reboot must be
        // homed there); any spawn otherwise.
        const local = _.filter(spawns, s => s.room.name === this.mission.roomName);
        const spawn = _.sample(local.length ? local : spawns);
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