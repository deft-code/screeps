import { RoomIntel, cleanIndex } from "intel";
import { theRadar } from "radar";
import { dist } from "routes";
import { log } from "debug";

const tooFar = new Set<string>();
const kMaxDepositRange = 7;

let checkAfter = Game.time + _.random(10, 20);
let lastRecs = 0;

export function depositRun() {
    if (Game.time < checkAfter) return false;
    if (Game.time < Memory.intel.recExpire && _.size(Memory.intel.recs) === lastRecs) return false;

    const created = createDepositTeams();
    if (created) {
        log("Auto deposit mining", created);
        return created;
    } else {
        cleanIndex();
        lastRecs = _.size(Memory.intel.recs);
        return 'cleaned';
    }
}

// Returns Minimum distance to suitable depositfarmer room.
// Returns Infinity when no rooms are suitable
export function depositDist(roomName: string) : number {
    const min = Math.min(..._.filter(
        Game.spawns, s => s.room.controller!.level >= 7).map(
            s => dist(roomName, s.pos.roomName)
        ));
    return min;
}

export function depositMaxCooldownByDist(dist: number): number {
    return 150 - 10 * dist;
}

export function depositMaxCooldown(roomName: string): number {
    return depositMaxCooldownByDist(depositDist(roomName));
}

export function createDepositTeams() {
    for (const roomName of Memory.intel.recs) {
        if (tooFar.has(roomName)) {
            continue;
        }

        const intel = RoomIntel.get(roomName);
        if (!intel) continue;
        const cooldown = intel.depositCooldown;
        if (cooldown === 0 || cooldown > 9) continue;
        const teamName = `deposit_${roomName}`;
        const flag = Game.flags[teamName];
        if (flag) continue;

        const d = depositDist(roomName);
        const max = depositMaxCooldownByDist(d);
        if(cooldown > max || d > kMaxDepositRange) {
            tooFar.add(roomName);
            continue;
        }

        const room = Game.rooms[roomName];
        if (!room) {
            return theRadar.observe(roomName);
        }

        room.log("new flag", teamName, intel.depositPos);
        return room.createFlag(intel.depositPos!, teamName, COLOR_BLUE, COLOR_RED);
    }
    return false;
}