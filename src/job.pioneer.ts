import { Startup } from "job.startup";
import { register } from "mycreep";
import { findSpawns } from "spawnold";

// Largest body a helper room builds: 6 WORK/CARRY pairs + 6 MOVE + [MOVE, CARRY]
// = 20 parts for 1300 energy. A young room's sources cannot feed more WORK.
const kMaxPairs = 6;

// A startup creep for a room other than the one that spawns it. Laid by the
// Startup mission (ms.startup.ts); behaviour is role.bootstrap.js via
// rolePioneer/afterPioneer, exactly like `startup`, but:
// - spawned with the "remote" strategy (spawnold.js remoteSpawns): the nearest
//   spawns *outside* the mission room, so the assisted room's spawn is left
//   for its own creeps;
// - homed on the mission room every tick, since the SpawnDaemon sets
//   memory.home to the spawning room and roleBootstrap works in `home`.
@register
export class Pioneer extends Startup {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const pool = findSpawns(spawns, this.mission.roomName, { spawn: "remote" }) as StructureSpawn[];
        const spawn = _.first(pool);
        if (!spawn) return [null, []];
        return [spawn, Startup.body(spawn.room.energyCapacityAvailable, kMaxPairs)];
    }

    init(): boolean {
        this.memory.home = this.mission.roomName;
        return true;
    }
}
