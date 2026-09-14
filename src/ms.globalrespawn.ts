import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Worker } from "job.worker";
import { Ctrl } from "job.ctrl";
import { Hub } from "job.hub";
import { Reboot } from "job.reboot";
import { Upgrader } from "job.upgrader";
import { CtrlHauler } from "job.ctrlhauler";

// Room of the spawn named Home, or of any spawn when none carries that name
// (shard2's spawns are Spawn1-3, and the mission threw every tick there,
// leaving its creeps unrun and unreplaced).
function homeSpawn(): StructureSpawn | undefined {
    return Game.spawns.Home || _.first(_.values(Game.spawns) as StructureSpawn[]);
}

@register
export class GlobalRespawn extends Mission {
    get roomName(): string {
        const spawn = homeSpawn();
        if (!spawn) throw new Error("GlobalRespawn: no spawns at all");
        return spawn.room.name;
    }

    get room() {
        return Game.rooms[this.roomName];
    }

    run(): Priority {
        if (this.windingDown) return super.run();
        const rcl = this.room.controller?.level || 0;
        const ecap = this.room.energyCapacityAvailable;

        if (!this.creeps.length) {
            this.nJobs(Reboot, 1);
        }

        this.nCreeps('startup', Math.max(1, 6 - rcl)) ||
            ecap >= 550 && (this.nCreeps('bsrc', 1) || this.nCreeps('asrc', 1)) ||
            this.nCreeps('hauler', 2);

        this.nJobs(Worker, 1);
        this.nJobs(Ctrl, 1);

        this.room.storage && this.nJobs(Hub, 1);
        this.nJobs(Upgrader, Upgrader.want(this.room));
        this.nJobs(CtrlHauler, CtrlHauler.want(this));

        super.run();
        return "critical";
    }
}
