
import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Scout } from "job.scout";
import { Swiper, swiperBody } from "job.swiper";
import { isRuin, storeOf, swipeTargets, SwipeTarget } from "swipe";
import { Konmari } from "job.konmari";
import { Toxic } from "job.toxic";
import { junkIn, minSwipePrice, Worth, worthSwiping } from "swipeworth";
import { theRadar } from "radar";
import { defaultRewalker, kInvaderUser } from "Rewalker";

// Ticks between sparkJoy looks, plus up to kSparkJoyJitter.
const kSparkJoyPace = 1000;
const kSparkJoyJitter = 100;
// Swipers kept out at once: at least kMinSwipers, up to kMaxSwipers while the
// loot would not be out within kClearTicks (wantSwipers).
const kMinSwipers = 2;
const kMaxSwipers = 8;
const kClearTicks = 20000;
// A swiper's load: the CARRY parts of job.swiper.ts's full body plan.
const kSwiperLoad = swiperBody(Infinity).filter(p => p === CARRY).length * CARRY_CAPACITY;
// A round trip: the route's rooms walked there and back at a tile a tick
// (one MOVE per CARRY, loaded, on plains), plus loading and unloading.
const kTilesPerRoom = 50;
const kTripOverhead = 60;
// A guard sighting stands this long (ticks) with the room out of sight.
const kGuardTTL = CREEP_LIFE_TIME;

// Loot a room: "Swipe <target> <home>". A Scout while the target is not
// visible, then Swipers until the room has nothing left worth taking, then
// wind down.
//
// How many swipers (wantSwipers): enough to carry what is worth taking out
// within kClearTicks, or within half the time the ruins holding it have left,
// whichever is less, from the round-trip estimate and a 1,250-unit load;
// never under kMinSwipers or over kMaxSwipers. That many are kept out at a
// time (paceNJobs: one egg per 1500/(n+1) ticks while under n heads; nJobs
// kept ~2n-1, its n being a TTL sum, and 14 swipers ran W3N4's spawns at 97%
// on 7 Nov 2026). `swipers = n` on the mission fixes the count by hand
// (persisted; null returns to the estimate).
//
// The route (watchRoute): the Rewalker's route from home to the target, home
// excluded, is asked of the radar in the background every tick (served once
// 50 ticks stale), and every room of it in sight is checked for an armed
// creep of another player (ATTACK or RANGED_ATTACK; keepers and invaders are
// not players: the Rewalker prices keeper rooms, missions fight invaders).
// One found holds the mission (guardedBy, `GUARDED` in status): swiper eggs
// are purged and none laid, the swipers at home wait by the exit toward the
// route (job.swiper.ts), the ones out finish their trip. The room seen clear
// lifts the hold; a sighting nothing can refresh lapses after kGuardTTL; so
// does windDown(), whose swipers run through the guard until they die.
// Meanwhile one Toxic (job.toxic.ts, the bait-and-trap mini) is kept per
// guarded room (its egg's memory.troom; re-aimed if the guard moves): once
// one stands in every guarded room drawing its guard (`baited`), the hold
// lifts and the swipers run past. A guard with HEAL outlasts a bait
// (ms.reactor.ts), so against psy372's ranger the toxic is a decoy, not a
// kill.
// psy372's W5N3 ranger (17 RANGED_ATTACK 8 HEAL 25 MOVE, 170 a tick) stripped
// four W6N2 swipers of their CARRY on 7 Nov 2026; every route from W3N4 to
// W6N2 crosses W5N3 or a tower room, so there is nothing to reroute to.
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
            const s = storeOf(t) as unknown as { [res: string]: number };
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

    // The rooms a swiper walks from home to the target, home excluded (ours,
    // with towers), the target included.
    routeRooms(): string[] {
        const home = this.home;
        if (!home) return [this.roomName];
        return defaultRewalker().getRoute(home, this.roomName).slice(1);
    }

    // See the header: memory.guard from the route rooms in sight, the radar
    // asked for the rest.
    watchRoute(rooms: string[]) {
        const guard = this.memory.guard || {};
        const rewalker = defaultRewalker();
        const blind: string[] = [];
        for (const name of rooms) {
            const room = Game.rooms[name];
            if (!room) {
                blind.push(name);
                continue;
            }
            const armed = _.find(room.find(FIND_HOSTILE_CREEPS),
                c => c.hostile && !c.keeper && c.owner.username !== kInvaderUser && !rewalker.isAllied(c));
            if (armed) {
                if (!guard[name]) debug.log(this.name, name, "held by", armed.owner.username, armed.body.map(b => b.type[0]).join(""), "at", armed.pos);
                guard[name] = [armed.owner.username, Game.time];
            } else if (guard[name]) {
                debug.log(this.name, name, "clear of", guard[name][0]);
                delete guard[name];
            }
        }
        for (const name of Object.keys(guard)) {
            if (!_.contains(rooms, name) || guard[name][1] + kGuardTTL < Game.time) delete guard[name];
        }
        if (blind.length) theRadar.observeBackground(...blind);
        if (_.isEmpty(guard)) delete this.memory.guard;
        else this.memory.guard = guard;
    }

    // The route rooms held by an armed player creep.
    get guardedRooms(): string[] {
        return Object.keys(this.memory.guard || {});
    }

    // "<room> by <player>, ..." for them, else null.
    get guardedBy(): string | null {
        const guard = this.memory.guard;
        const rooms = this.guardedRooms;
        return rooms.length ? rooms.map(n => `${n} by ${guard![n][0]}`).join(", ") : null;
    }

    // The mission's toxics and toxic eggs.
    get toxics() {
        const role = Toxic.name.toLowerCase();
        return [...this.roleCreeps(role), ...this.roleEggs(role)];
    }

    // Whether every guarded room has a toxic of the mission standing in it,
    // drawing its guard.
    get baited(): boolean {
        const rooms = this.guardedRooms;
        if (!rooms.length) return false;
        const standing = this.toxics.map(t => t.c?.pos.roomName);
        return rooms.every(r => _.contains(standing, r));
    }

    // What keeps the swipers at home (read by Swiper): the guards, until a
    // toxic stands in each of their rooms; null winding down, when the
    // swipers left are to run until they die rather than sit at home.
    get hold(): string | null {
        if (this.windingDown || this.baited) return null;
        return this.guardedBy;
    }

    // One Toxic per guarded room (memory.troom on the egg), laid one egg at a
    // time as soon as one is short, so a decoy is on its way the tick a guard
    // is seen and a dead one is replaced at once. A toxic or egg aimed at a
    // room no longer guarded is re-aimed at one that lacks its own.
    toxic(rooms: string[]) {
        const role = Toxic.name.toLowerCase();
        const all = this.toxics;
        if (all.length < rooms.length && !this.hasEgg(role)) all.push(this.layEgg(role));
        const taken = new Set<string>();
        const loose = [];
        for (const t of all) {
            const r = t.memory.troom;
            if (r && _.contains(rooms, r) && !taken.has(r)) taken.add(r);
            else loose.push(t);
        }
        for (const r of rooms) {
            if (taken.has(r)) continue;
            const t = loose.shift();
            if (!t) break;
            t.memory.troom = r;
            taken.add(r);
        }
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
        this.watchRoute(this.routeRooms());

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
                const want = this.wantSwipers(targets, worth);
                const guarded = this.guardedRooms;
                if (guarded.length) this.toxic(guarded);
                if (this.hold) {
                    if (this.hasEgg(Swiper.name.toLowerCase())) {
                        this.purgeEggs([Scout.name.toLowerCase(), Konmari.name.toLowerCase(), Toxic.name.toLowerCase()]);
                    }
                } else {
                    this.paceNJobs(Swiper, want);
                }
            }
        }
        super.run();
        return "normal";
    }

    status(): string {
        const guarded = this.guardedBy;
        return super.status() + ` minPrice:${Math.round(this.minPrice())}${this.ignoreEnergy ? " noenergy" : ""}`
            + ` route:${this.routeRooms().join(">")}${guarded ? ` GUARDED:${guarded}${this.baited ? " baited" : " holding"}` : ""} ${this.lastWant}`;
    }
}
