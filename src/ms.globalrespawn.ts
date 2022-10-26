import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";

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

        this.nCreeps('startup', 6) || ecap >= 550 && this.nCreeps('asrc', 1);

        super.run();
        return "critical";
    }
}
