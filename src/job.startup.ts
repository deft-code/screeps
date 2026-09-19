import { JobCreep } from "job.creep";
import { register } from "mycreep";
import { energyDef } from "spawn";

@register
export class Startup extends JobCreep {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        // The mission room's own spawns when it has any (a startup is homed
        // where it hatches, so one born in another owned room works there
        // instead); any spawn otherwise.
        const local = _.filter(spawns, s => s.room.name === this.mission.roomName);
        const spawn = _.sample(local.length ? local : spawns);
        if (!spawn) return [null, []];
        return [spawn, Startup.body(spawn.room.energyCapacityAvailable)];
    }

    // Body for a bootstrap generalist at a room's energy capacity. `max` caps
    // the number of WORK/CARRY pairs in the energyDef branch (>550 energy).
    static body(energy: number, max = 50): BodyPartConstant[] {
        switch (energy) {
            case 300: {
                const mod = Game.time % 3;
                if (mod === 0) return [WORK, WORK, CARRY, MOVE];
                if (mod === 1) return [WORK, CARRY, MOVE, MOVE];
                return [WORK, CARRY, CARRY, MOVE, MOVE];
            }
            case 350: return [WORK, WORK, CARRY, MOVE, MOVE];
            case 400:
            case 450: return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
            case 500: return [WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE];
            case 550: return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
            default:
                return energyDef({
                    move: 2,
                    base: [MOVE, CARRY],
                    per: [WORK, CARRY],
                    energy,
                    max,
                });
        }
    }
}
