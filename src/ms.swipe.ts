
import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Scout } from "job.scout";
import { Swiper, swipeTargets } from "job.swiper";
import { Konmari } from "job.konmari";
import { junkIn, minSwipePrice, worthSwiping } from "swipeworth";

// Ticks between sparkJoy looks, plus up to kSparkJoyJitter.
const kSparkJoyPace = 1000;
const kSparkJoyJitter = 100;
// Swipers kept out at once.
const kSwipers = 2;

// Loot a room: "Swipe <target> <home>". A Scout while the target is not
// visible, then kSwipers Swipers at a time until the room has nothing left worth
// taking, then wind down.
//
// Every kSparkJoyPace (+ random kSparkJoyJitter) ticks sparkJoy() looks
// through the home room's storage and terminal for worthless resources (a
// negative buy-order price: nobody bids for them) and, finding any, lays one
// Konmari to carry them out and drop them (job.konmari.ts).
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

    // Does anything in the home stores fail to spark joy? Then one Konmari.
    sparkJoy() {
        if (Game.time < (this.memory.sparkjoy || 0)) return;
        this.memory.sparkjoy = Game.time + kSparkJoyPace + _.random(kSparkJoyJitter);
        const home = this.home ? Game.rooms[this.home] : undefined;
        if (!home) return;
        const junk: string[] = [];
        for (const store of [home.storage, home.terminal]) {
            if (!store || !store.my) continue;
            const s = store.store as unknown as { [res: string]: number };
            for (const res of junkIn(store.store)) junk.push(`${res}x${s[res]}`);
        }
        if (!junk.length) {
            debug.log(this.name, "sparkjoy: nothing worthless in", home.name);
            return;
        }
        const role = Konmari.name.toLowerCase();
        const busy = this.hasEgg(role) || this.hasRole(role);
        debug.log(this.name, "sparkjoy: worthless in", home.name, junk.join(" "), busy ? "(konmari already out)" : "- laying a konmari");
        if (!busy) this.layEgg(role);
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        this.sparkJoy();

        debug.log("swipe mission! from", this.getRoomName(), "to", this.getRoomName("home"), this.room, "min price", this.minPrice());

        if(!this.room) {
            this.nJobs(Scout, 1);
        } else if (!swipeTargets(this.room, {}, res => this.worth(res)).length) {
            // Nothing left worth looting: stop laying, let the swiper finish and die.
            debug.log(this.name, this.roomName, "has nothing left worth", this.minPrice(), "a unit, winding down");
            this.windDown();
        } else {
            this.nJobs(Swiper, kSwipers);
        }
        super.run();
        return "normal";
    }

    status(): string {
        return super.status() + ` minPrice:${Math.round(this.minPrice())}`;
    }
}
