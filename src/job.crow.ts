import { Guard, kRetreatHurts } from "job.guard";
import { register, task, Task2Ret } from "mycreep";
import type { Capture } from "ms.capture";

// Crow: the Capture mission's fighter (ms.capture.ts). A Guard on a fixed
// full-size body, 25 MOVE, 24 RANGED_ATTACK, 1 HEAL (5100 energy), MOVE
// first so damage costs speed only once the weapons are gone. Spawned only
// in the mission's home room (an RCL7+ room, Capture picks it); the
// SpawnDaemon holds the egg until the room has the whole cost in hand.
//
// Behaviour is Guard's (hunt, duel, kite, heal, opportunistic fire and
// healing in after()) with the mission's mode laid over it:
//   staging: walk to within kStageRange of the mission's staging flag
//     (staging_<flag>, in the room before the target on the route home) and
//     wait there. An enemy that comes within 3 is engaged as a Guard on its
//     way would engage it, but never chased out of range.
//   attack: Guard.decide in the target room; with nothing to fight or heal
//     it holds within kFlagRange of the mission flag instead of the room
//     centre.
// Retreating from damage (Guard.shouldRetreat) goes to the staging flag in
// either mode, not to the home controller.
const kStageRange = 2;
const kFlagRange = 3;
const kMoves = 25;
const kRanged = 24;

declare global {
    interface CreepMemory {
        // Crow: the Capture mode its current task was started under.
        cmode?: string
    }
}

@register
export class Crow extends Guard {
    static readonly body: BodyPartConstant[] = [
        ..._.times(kMoves, () => MOVE),
        ..._.times(kRanged, () => RANGED_ATTACK),
        HEAL,
    ] as BodyPartConstant[];

    // Ranged attack power of a fresh crow: what an egg or a hatch counts for.
    static readonly power = kRanged * RANGED_ATTACK_POWER;

    get capture(): Capture {
        return this.mission as Capture;
    }

    // The full body from a home room spawn, an idle one when there is a
    // choice; no home spawn (the home room was lost) leaves the egg waiting.
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const home = this.mission.getRoomName("home");
        const pool = spawns.filter(s => s.room.name === home);
        if (!pool.length) return [null, Crow.body];
        return [_.find(pool, s => !s.spawning) || pool[0], Crow.body];
    }

    // A mode change drops whatever task was running (a hunt deep in the
    // target room would otherwise run on until its target was gone), so
    // decide() re-reads the mode this tick.
    init(): boolean {
        const mode = this.capture.mode;
        if (this.memory.cmode !== mode) {
            this.memory.cmode = mode;
            delete this.memory.task2;
        }
        return true;
    }

    decide(): Task2Ret {
        if (this.shouldRetreat()) return this.retreat();
        if (this.capture.mode !== "attack") return this.stage();
        return super.decide();
    }

    // Staging: walk to within kStageRange of the staging flag (the staging
    // room without one) and wait there. Nothing on the way is chased:
    // shooting and healing within reach are after()'s opportunistic pass
    // (the first crows chased a hurt skhunter around the keeper room
    // instead, Oct 2026).
    stage(): Task2Ret {
        const flag = this.capture.stagingFlag;
        if (!flag) {
            const staging = this.mission.getRoomName("staging");
            if (staging && this.pos.roomName !== staging) return this.moveRoom(staging);
            return "wait";
        }
        if (this.pos.inRangeTo(flag.pos, kStageRange)) return "wait";
        this.movePos(flag.pos, kStageRange);
        return "wait";
    }

    // Hurt: fall back to the staging flag (the staging room without one)
    // and heal up there; back to work once under the threshold.
    @task
    retreat(): Task2Ret {
        if (this.cc.hurts < kRetreatHurts) return "start";
        const flag = this.capture.stagingFlag;
        if (flag) {
            this.movePos(flag.pos, kStageRange);
        } else {
            const staging = this.mission.getRoomName("staging") || this.homeName;
            if (this.pos.roomName !== staging) this.moveRoom(staging);
        }
        return "wait";
    }

    // Opportunistic fire (Guard.after) leaves Source Keepers alone: the
    // staging room may be a keeper room (W25S6), and a keeper beside the
    // path is not the fight.
    potshots(): Creep[] {
        return (this.c.room.enemies || []).filter(e => !e.keeper);
    }

    // Nothing to fight or heal in the target room: hold near the mission
    // flag; anywhere else (or without a flag) Guard's hold near the centre.
    hold(range = kFlagRange): Task2Ret {
        const flag = this.capture.flag;
        if (!flag || flag.pos.roomName !== this.pos.roomName) return super.hold(range);
        this.holding = true;
        if (this.pos.inRangeTo(flag.pos, range)) return "wait";
        this.movePos(flag.pos, range);
        return "wait";
    }
}
