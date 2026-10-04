import type { Mission } from "mission";
import { Micro } from "job.micro";
import { Pup } from "job.pup";
import * as debug from "debug";

// Answers to unarmed enemy creeps in a mission's room, shared by Farm and
// Remote (ms.farm.ts) and by Hub and Thorhub (ms.hub.ts). Both need vision
// of the room and lay nothing while an armed hostile is in it: those are
// for the guards, wolves and towers.

// Enemy creeps must have been seen in the room for this many ticks
// (strat.ts ratchet, memory.tenemies) before a micro is sent.
const kMicroEnemyTicks = 50;

// Enemy creeps in the mission room, Source Keepers excluded; [] without vision.
export function roomEnemies(mission: Mission): Creep[] {
    return (mission.room?.enemies || []).filter(e => !e.keeper);
}

// Enemy creeps seen for kMicroEnemyTicks and none of them armed: one micro
// (RANGED_ATTACK, MOVE; job.micro.ts) per lifetime.
export function suppressMicro(mission: Mission) {
    const room = mission.room;
    if (!room || room.hostiles.length || !roomEnemies(mission).length) return null;
    const t = room.memory.tenemies || 0;
    if (t < kMicroEnemyTicks) return null;
    return mission.paceNJobs(Micro, 1);
}

// Enemy creeps in the room, none armed, some with HEAL: three pups
// (job.pup.ts) per lifetime, each with ATTACK parts for half the heal power
// of those enemies (active HEAL parts, boosts not counted). Two would only
// match the healing; the third slightly over builds to kill it sooner. The
// size rides on the egg.
export function suppressPup(mission: Mission) {
    const room = mission.room;
    if (!room || room.hostiles.length) return null;
    const heal = _.sum(roomEnemies(mission), e => e.getActiveBodyparts(HEAL)) * HEAL_POWER;
    const size = Math.ceil(heal / ATTACK_POWER / 2);
    if (size < 1) return null;
    const egg = mission.paceNJobs(Pup, 3);
    if (egg) {
        Memory.creeps[egg.name].size = size;
        debug.log(mission.name, "pup", egg.name, "size", size, "for", heal, "heal in", room.name);
    }
    return egg;
}
