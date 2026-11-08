import { JobCreep } from "job.creep";
import { register, Task2Ret } from "mycreep";
import { closeSpawns } from "spawnold";
import { nomNearby, questSwipe } from "swipe";
import { anything, Worth, worthless } from "swipeworth";

// The body (swiperBody): kFrontPairs of CARRY, MOVE, then CARRY, MOVE, MOVE
// to the 50-part cap (21 CARRY, 29 MOVE, 2500 energy, 1,050 capacity),
// shortened from the tail to the energy on hand. Damage eats a body from
// the front: a swiper that has lost its front pairs is left with two MOVE
// per CARRY, so it speeds up after a beating and holds that speed, instead
// of crawling home (every CARRY first, until 7 Nov 2026) or losing a CARRY
// and a MOVE a hit for the whole body (interleaved, the same day).
const kFrontPairs = 13;
const kMaxParts = 50;
const kPartCost = BODYPART_COST[CARRY];

// The plan above cut to what `energy` buys, never under one pair.
export function swiperBody(energy: number): BodyPartConstant[] {
    const plan: BodyPartConstant[] = [];
    for (let i = 0; i < kFrontPairs; i++) plan.push(CARRY, MOVE);
    while (plan.length + 3 <= kMaxParts) plan.push(CARRY, MOVE, MOVE);
    const parts = Math.max(2, Math.min(plan.length, Math.floor(energy / kPartCost)));
    return plan.slice(0, parts);
}
// How close to the home exit a swiper waits while the route is held.
const kWaitRange = 4;

// Loot an abandoned or hostile base for the Swipe mission
// ("Swipe <target> <home>"): the swipe quest of swipe.ts in value mode, as
// Furiosa's: the structure holding the most valuable resource (unitValue a
// unit, nearest such on a tie), that resource first, among what the mission
// says is worth the trip (Swipe.worth; anything for a mission without).
// Until 7 Nov 2026 it walked to the nearest target and took its resources
// in random order, so a 1,250 load was Z (450) as often as X (960). Full,
// or holding something
// once the room is dry, it unloads at home (storage, terminal, else the home
// containers, else dropped at the controller) and goes back for more. What
// lies within reach on the way is picked up (nomNearby), unless worthless or
// not worth it by the mission (a Swipe with ignoreEnergy leaves energy).
//
// While the mission reports its route held by an armed player creep and no
// toxic of its own is in that room yet (Swipe.hold), a swiper that is empty
// at home waits within kWaitRange of the home exit toward the target instead
// of walking into the fire; one out on the route finishes its trip. A swiper with no CARRY part left
// (psy372's W5N3 ranger took all 25 of two swipers in Nov 2026) can only
// loop on ERR_FULL, so it suicides.
@register
export class Swiper extends JobCreep {
    // From the spawns nearest home, the body plan above sized to the energy
    // on hand (every part costs kPartCost).
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const close = closeSpawns(spawns, this.homeName) as StructureSpawn[];
        const spawn = _.find(close, s => !s.spawning) || _.first(close);
        if (!spawn) return [null, []];
        return [spawn, swiperBody(spawn.room.energyAvailable)];
    }

    // The mission's pricing (Swipe.worth); anything goes for a mission without.
    get worth(): Worth {
        const m = this.mission as unknown as { worth?: Worth };
        return m.worth ? res => m.worth!(res) : anything;
    }

    // The mission's hold (Swipe.hold: "<room> by <player>"), null for a
    // mission without one, with the route clear, or with a toxic baiting the
    // guard.
    get hold(): string | null {
        const m = this.mission as unknown as { hold?: string | null };
        return m.hold ?? null;
    }

    start(): Task2Ret {
        if (!this.c.getActiveBodyparts(CARRY)) {
            this.log("no CARRY left, suiciding");
            this.c.suicide();
            return "wait";
        }
        const hold = this.hold;
        if (hold && this.pos.roomName === this.homeName && !this.c.store.getUsedCapacity()) {
            this.dlog("route held:", hold, "- waiting at home");
            this.waitByExit();
            return "wait";
        }
        const ret = questSwipe(this, this.mission.roomName, this.homeName, this.worth, "value");
        if (ret === false) this.dlog("nothing to swipe in", this.mission.roomName);
        else this.dlog("swipe:", ret);
        return "wait";
    }

    // Stand within kWaitRange of the middle tile of the home exit toward the
    // mission's room; where the map finds no exit, stay put.
    waitByExit() {
        const home = this.c.room;
        const exit = Game.map.findExit(home.name, this.mission.roomName);
        if (exit < 0) return;
        const tiles = home.find(exit as ExitConstant);
        const mid = tiles[Math.floor(tiles.length / 2)];
        if (mid && !this.pos.inRangeTo(mid, kWaitRange)) this.movePos(mid, kWaitRange);
    }

    after() {
        const worth = this.worth;
        nomNearby(this, res => !worthless(res) && worth(res));
    }
}
