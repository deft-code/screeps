
import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Scout } from "job.scout";
import { Swiper, swipeTargets } from "job.swiper";
import { minSwipePrice, worthSwiping } from "swipeworth";

// Loot a room: "Swipe <target> <home>". A Scout while the target is not
// visible, then one Swiper at a time until the room has nothing left worth
// taking, then wind down.
//
// Worth taking: see swipeworth.ts (energy always; else it must sell for twice
// what energy costs delivered to the home room).
@register
export class Swipe extends Mission {
    get roomName() {
        return this.args[1];
    }

    getRoomName(alias = ""){
        if(alias === "home") return this.args[2];
        return super.getRoomName(alias);
    }

    get home(): string | undefined {
        return this.getRoomName("home") || undefined;
    }

    minPrice(): number {
        return minSwipePrice(this.home);
    }

    // Read by Swiper.
    worth(res: ResourceConstant): boolean {
        return worthSwiping(res, this.home);
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        debug.log("swipe mission! from", this.getRoomName(), "to", this.getRoomName("home"), this.room, "min price", this.minPrice());

        if(!this.room) {
            this.nJobs(Scout, 1);
        } else if (!swipeTargets(this.room, {}, res => this.worth(res)).length) {
            // Nothing left worth looting: stop laying, let the swiper finish and die.
            debug.log(this.name, this.roomName, "has nothing left worth", this.minPrice(), "a unit, winding down");
            this.windDown();
        } else {
            this.nJobs(Swiper, 1);
        }
        super.run();
        return "normal";
    }

    status(): string {
        return super.status() + ` minPrice:${Math.round(this.minPrice())}`;
    }
}
