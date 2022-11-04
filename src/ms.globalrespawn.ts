import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Worker } from "job.worker";
import { Ctrl } from "job.ctrl";
import { Hub } from "job.hub";

@register
export class GlobalRespawn extends Mission {
    get roomName(): string {
        return Game.spawns.Spawn1.room.name;
    }

    get room() {
        return Game.rooms[this.roomName];
    }

    run(): Priority {
        const rcl = this.room.controller?.level || 0;
        const ecap = this.room.energyCapacityAvailable;

        this.nCreeps('startup', Math.max(2, 6 - rcl)) ||
            ecap >= 550 && (this.nCreeps('bsrc', 1) || this.nCreeps('asrc', 1)) ||
            this.nCreeps('hauler', 1) ;

        this.nJobs(Worker, 1);
        this.nJobs(Ctrl, 1);

        this.room.storage && this.nJobs(Hub, 1);

        this.nCreeps('scout', 1);

        super.run();
        return "critical";
    }
}
