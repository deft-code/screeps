import { register } from "mycreep";
import { Wolf } from "job.wolf";
import { closeSpawns } from "spawnold";

// A Wolf sized to the enemy it is sent after: memory.size ATTACK parts and as
// many MOVE. Farm, Remote, Hub and Thorhub lay three per lifetime (paceNJobs(Pup, 3)) while
// enemy creeps with HEAL are in the room and none of them is armed
// (suppress.ts suppressPup), each sized to half the total heal power of those
// enemies: size = heal power / ATTACK_POWER / 2, rounded up. Three of them
// slightly over build against the healing, to kill it sooner. The behaviour
// is Wolf's.

declare global {
    interface CreepMemory {
        // Pup: ATTACK parts asked for, set on the egg by suppressPup (suppress.ts).
        size?: number
    }
}

// ATTACK + MOVE pairs in a 50 part body.
const kMaxSize = 25;
const kPairCost = BODYPART_COST[ATTACK] + BODYPART_COST[MOVE];

@register
export class Pup extends Wolf {
    // As Mini: ahead of the civilian eggs, behind srcers.
    priority = 7;

    // size ATTACK then size MOVE, so it keeps walking while it loses teeth.
    static body(size: number): BodyPartConstant[] {
        const n = Math.max(1, Math.min(kMaxSize, Math.floor(size)));
        return [..._.times(n, () => ATTACK), ..._.times(n, () => MOVE)] as BodyPartConstant[];
    }

    // The nearest spawns whose room can afford the whole body; when none
    // can, the largest room builds as much of it as its capacity allows.
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const size = this.memory.size || 1;
        const near = closeSpawns(spawns, this.mission.roomName) as StructureSpawn[];
        const able = near.filter(s => s.room.energyCapacityAvailable >= size * kPairCost);
        if (able.length) return [_.find(able, s => !s.spawning) || able[0], Pup.body(size)];
        const best = _.max(spawns, s => s.room.energyCapacityAvailable);
        if (!(best instanceof StructureSpawn)) return [null, []];
        return [best, Pup.body(Math.floor(best.room.energyCapacityAvailable / kPairCost))];
    }
}
