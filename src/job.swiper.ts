import { JobCreep } from "job.creep";
import { register, Task2Ret } from "mycreep";
import { closeSpawns } from "spawnold";
import { energyDef } from "spawn";
import { nomNearby, questSwipe } from "swipe";
import { anything, Worth, worthless } from "swipeworth";

// Body budget: 25 CARRY + 25 MOVE is the 50-part cap.
const kMaxBodyEnergy = 2500;

// Loot an abandoned or hostile base for the Swipe mission
// ("Swipe <target> <home>"): the swipe quest of swipe.ts, choosing targets
// by the cheapest walk and taking what the mission says is worth the trip
// (Swipe.worth; anything for a mission without). Full, or holding something
// once the room is dry, it unloads at home (storage, terminal, else the home
// containers, else dropped at the controller) and goes back for more. What
// lies within reach on the way is picked up (nomNearby), unless worthless or
// not worth it by the mission (a Swipe with ignoreEnergy leaves energy).
@register
export class Swiper extends JobCreep {
    // From the spawns nearest home, one MOVE per CARRY (full speed loaded on
    // plains), sized to the energy on hand up to the 50-part cap.
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const close = closeSpawns(spawns, this.homeName) as StructureSpawn[];
        const spawn = _.find(close, s => !s.spawning) || _.first(close);
        if (!spawn) return [null, []];
        const energy = Math.min(spawn.room.energyAvailable, kMaxBodyEnergy);
        return [spawn, energyDef({ move: 1, per: [CARRY], energy } as any)];
    }

    // The mission's pricing (Swipe.worth); anything goes for a mission without.
    get worth(): Worth {
        const m = this.mission as unknown as { worth?: Worth };
        return m.worth ? res => m.worth!(res) : anything;
    }

    start(): Task2Ret {
        const ret = questSwipe(this, this.mission.roomName, this.homeName, this.worth, "path");
        if (ret === false) this.dlog("nothing to swipe in", this.mission.roomName);
        else this.dlog("swipe:", ret);
        return "wait";
    }

    after() {
        const worth = this.worth;
        nomNearby(this, res => !worthless(res) && worth(res));
    }
}
