import { JobCreep } from "job.creep";
import { register } from "mycreep";
import { energyDef } from "spawn";

@register
export class Startup extends JobCreep {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const spawn = _.sample(Game.spawns);
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
