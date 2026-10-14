import { Razer } from "job.razer";
import { register, Task2Ret } from "mycreep";
import { fleeKeepers } from "job.skharvester";
import type { CreepMove } from "creep.move";
import type { Loot } from "ms.loot";

// Opens the cans for the Loot mission (ms.loot.ts): a Razer that only takes
// down the ramparts shielding containers, the ones an invader stronghold
// leaves over its loot (withdraw through a hostile rampart is
// ERR_NOT_OWNER). Fixed body WORK, WORK, MOVE x kUnits (32 WORK, 16 MOVE,
// 4000 energy: 1600 hits a tick), from a spawn in the mission's home room
// (else the spawns nearest the mission room) with the whole cost in hand.
//
// In the mission room it dismantles the covering rampart with the cheapest
// walk (Razer.raze over targets()); the tick it finds no covered container
// left (Loot.coveredRamparts, so vision is implied: it is standing there)
// it decommissions: back to its origin spawn to be recycled (Razer.decomm).
// It stomps nothing. Keepers and lairs about to spawn one are fled first
// (fleeKeepers), as the farm creeps do.
const kUnits = 16;

@register
export class Canopener extends Razer {
    static readonly body: BodyPartConstant[] = _.flatten(_.times(kUnits, () => [WORK, WORK, MOVE])) as BodyPartConstant[];

    static readonly cost = _.sum(Canopener.body, part => BODYPART_COST[part]);

    // No idle grace: the covered containers are known the tick they are seen.
    idleTicks = 1;

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const spawn = this.readySpawn(spawns, Canopener.cost);
        return spawn ? [spawn, Canopener.body] : [null, []];
    }

    get loot(): Loot {
        return this.mission as Loot;
    }

    get cc(): CreepMove {
        return this.c as CreepMove;
    }

    start(): Task2Ret {
        if (fleeKeepers(this.cc)) return "wait";
        return super.start();
    }

    // The ramparts over the mission room's containers.
    targets(): Structure[] {
        return this.loot.coveredRamparts();
    }

    stomp(): Task2Ret | null {
        return null;
    }
}
