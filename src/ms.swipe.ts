
import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Scout } from "job.scout";
import { Swiper, swipeTargets } from "job.swiper";

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
        if (this.windingDown) return super.run();

        debug.log("swipe mission! from", this.getRoomName(), "to", this.getRoomName("home"), this.room);

        if(!this.room) {
            this.nJobs(Scout, 1);
        } else if (!swipeTargets(this.room).length) {
            // Nothing left to loot: stop laying, let the swiper finish and die.
            debug.log(this.name, this.roomName, "has no swipe targets left, winding down");
            this.windDown();
        } else {
            this.nJobs(Swiper, 1);
        }
        super.run();
        return "normal";
    }
}
