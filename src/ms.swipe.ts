
import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Scout } from "job.scout";
import { Swiper } from "job.swiper";

@register
export class Swipe extends Mission {
    get roomName() {
        return this.args[1];
    }

    getRoomName(alias = ""){
        if(alias === "home") return this.args[2];
        return super.getRoomName(alias);
    }

    run(): Priority {

        debug.log("swipe mission! from", this.getRoomName(), "to", this.getRoomName("home"), this.room);

        if(!this.room) {
            this.nJobs(Scout, 1);
        } else {
            this.nJobs(Swiper, 1);
        }
        super.run();
        return "normal";
    }
}
