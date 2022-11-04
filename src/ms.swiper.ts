
import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Scout } from "job.scout";
import { Swiper } from "job.swiper";

@register
export class GlobalRespawn extends Mission {
    get roomName(): string {
        return Game.spawns.Spawn1.room.name;
    }

    get room() {
        return Game.rooms[this.roomName];
    }

    get homeName() {
        return this.args[1] || this.roomName;
    }

    get home() {
        return Game.rooms[this.homeName];
    }

    run(): Priority {
        if(!this.room) {
            this.nJobs(Scout, 1);
        } else {
            this.nJobs(Swiper, 1);
        }
        return "normal";
    }
}
