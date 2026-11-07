
import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Scout } from "job.scout";
import { Swiper } from "job.swiper";
import { isRuin, swipeTargets, SwipeTarget } from "swipe";
import { Konmari } from "job.konmari";
import { junkIn, minSwipePrice, Worth, worthSwiping } from "swipeworth";

// Ticks between sparkJoy looks, plus up to kSparkJoyJitter.
const kSparkJoyPace = 1000;
const kSparkJoyJitter = 100;
// Swipers kept out at once: at least kMinSwipers, up to kMaxSwipers while the
// loot would not be out within kClearTicks (wantSwipers).
const kMinSwipers = 2;
const kMaxSwipers = 8;
const kClearTicks = 20000;
// A swiper's load: the 25 CARRY of job.swiper.ts's capped body.
const kSwiperLoad = 25 * CARRY_CAPACITY;
// A round trip: the route's rooms walked there and back at a tile a tick
// (one MOVE per CARRY, loaded, on plains), plus loading and unloading.
const kTilesPerRoom = 50;
const kTripOverhead = 60;

// Loot a room: "Swipe <target> <home>". A Scout while the target is not
// visible, then Swipers until the room has nothing left worth taking, then
// wind down.
//
// How many swipers (wantSwipers): enough to carry what is worth taking out
// within kClearTicks, or within half the time the ruins holding it have left,
// whichever is less, from the round-trip estimate and a 1,250-unit load;
// never under kMinSwipers or over kMaxSwipers. `swipers = n` on the mission
// fixes the count by hand (persisted; null returns to the estimate).
//
// `ignoreEnergy = true` (persisted) takes energy off the worth list: its
// containers and energy-only ruins are not targets, the swipers do not pick
// energy up on the way, and the mission winds down once the other loot is
// gone instead of staying to contest the energy with whoever harvests the
// room (psy372's harvesters in W6N2, Nov 2026).
//
// Every kSparkJoyPace (+ random kSparkJoyJitter) ticks sparkJoy() looks
// through the home room's storage and terminal for worthless resources (a
// negative buy-order price: nobody bids for them) and, finding any, lays one
// Konmari to carry them out and drop them (job.konmari.ts).
//
// Worth taking: see swipeworth.ts (energy always, unless ignored; else it
// must sell for twice what energy costs delivered to the home room).
@register
export class Swipe extends Mission {
    // This tick's estimate, for status.
    private lastWant = "";

    get ignoreEnergy(): boolean {
        return !!this.memory.noenergy;
    }

    set ignoreEnergy(on: boolean) {
        if (on) this.memory.noenergy = true;
        else delete this.memory.noenergy;
    }

    // A fixed swiper count, or null for the estimate.
    get swipers(): number | null {
        return this.memory.swipers ?? null;
    }

    set swipers(n: number | null) {
        if (n && n > 0) this.memory.swipers = Math.floor(n);
        else delete this.memory.swipers;
    }

    // Ticks of a swiper's round trip between home and the target room.
    tripTicks(): number {
        const home = this.home;
        const route = home ? Game.map.findRoute(home, this.roomName) : ERR_NO_PATH;
        const rooms = route === ERR_NO_PATH ? Game.map.getRoomLinearDistance(home || this.roomName, this.roomName) : route.length;
        return 2 * rooms * kTilesPerRoom + kTripOverhead;
    }

    // Swipers for the loot in `targets` (see the header).
    wantSwipers(targets: SwipeTarget[], worth: Worth): number {
        let units = 0;
        let decay = Infinity;
        for (const t of targets) {
            const s = t.store as unknown as { [res: string]: number };
            for (const res of Object.keys(s)) if (s[res] > 0 && worth(res as ResourceConstant)) units += s[res];
            if (isRuin(t)) decay = Math.min(decay, t.ticksToDecay);
        }
        const trips = Math.ceil(units / kSwiperLoad);
        const trip = this.tripTicks();
        const window = Math.min(kClearTicks, decay / 2);
        const fixed = this.swipers;
        const n = fixed ?? Math.min(kMaxSwipers, Math.max(kMinSwipers, Math.ceil(trips * trip / window)));
        this.lastWant = `loot:${units} trips:${trips} trip:${trip} decay:${decay === Infinity ? "-" : decay} swipers:${n}${fixed ? " (fixed)" : ""}`;
        return n;
    }
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
        if (res === RESOURCE_ENERGY && this.ignoreEnergy) return false;
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
        } else {
            const worth: Worth = res => this.worth(res);
            const targets = swipeTargets(this.room, {}, worth);
            if (!targets.length) {
                // Nothing left worth looting: stop laying, let the swipers finish and die.
                debug.log(this.name, this.roomName, "has nothing left worth", this.minPrice(), "a unit, winding down");
                this.windDown();
            } else {
                this.nJobs(Swiper, this.wantSwipers(targets, worth));
            }
        }
        super.run();
        return "normal";
    }

    status(): string {
        return super.status() + ` minPrice:${Math.round(this.minPrice())}${this.ignoreEnergy ? " noenergy" : ""} ${this.lastWant}`;
    }
}
