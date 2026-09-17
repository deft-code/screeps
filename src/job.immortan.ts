import { JobRole } from "job.role";
import { register, task, Task2Ret } from "mycreep";
import { findReactors } from "reactor";



// quotes to add later:
// Mediocre!
// You were chosen.
// You are awaited.

// Warboy quotes
// Witness Me!
// I live, I die, I live again!
// Oh what a day, what a lovely day!


declare global {
    interface Creep {
        // Season 11 seasonal server only.
        claimReactor(target: ReactorObject): ScreepsReturnCode
    }
    interface CreepMemory {
        // Immortan.report: last "intent:code" logged, to avoid a line per tick.
        lastIntent?: string
    }
}

// Season 11 reactor reserver (the warlord the warboys feed). Spawns a
// "immortan" body ([MOVE x5, CLAIM]) near the Reactor mission's "home" room, walks to the sector
// core and reserves the reactor when nobody holds it. Unlike Reserver this
// targets a Reactor room object, not a controller; see ms.reactor.ts for the
// object's shape.
// Thorium on a tile ages whatever stands on it (1 + floor(log10(amount))
// ticks to live per tick), piles, tombstones and ruins included, so a
// reserver parked on a dead warboy's drop pays for it with its own life.
// Under kAgingThorium the log floors to 0 and the tile is harmless.
const kAgingThorium = 10;
// Housekeeping with the CARRY part: top up to this much thorium (just under
// the 10 where a carried load starts aging the creep) from what
// lies within reach while carrying less...
const kHoldThorium = 9;
// ...and feed it to the reactor whenever the reactor holds less than this.
const kFeedBelow = 980;
// A pile can only be picked up whole (up to the CARRY part's 50): take one
// that would overfill kHoldThorium only when empty and the reactor holds no
// more than this, so the whole lot goes straight in next tick.
const kGrabBelow = 900;
function thoriumAt(pos: RoomPosition): number {
    const T = RESOURCE_THORIUM;
    if (!T) return 0;
    return _.sum(pos.lookFor(LOOK_RESOURCES), r => r.resourceType === T ? r.amount : 0)
        + _.sum(pos.lookFor(LOOK_TOMBSTONES), t => t.store[T] || 0)
        + _.sum(pos.lookFor(LOOK_RUINS), r => r.store[T] || 0);
}

@register
export class Immortan extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        // body key "immortan" in spawnold.buildBody: [MOVE x5, CLAIM]; one CLAIM
        // part is all claimReactor needs, and 5 MOVE lets it cross swamps at
        // full speed. Offroad creep: spawns fine from whatever spawns are
        // nearest the mission room.
        return this.closeSpawn(spawns, { body: "immortan" });
    }

    start(): Task2Ret {
        if (this.pos.roomName !== this.mission.roomName) {
            return this.moveRoom(this.mission.roomName);
        }
        const reactor = findReactors(this.c.room)[0];
        if (!reactor) {
            this.log("no reactor in", this.mission.roomName);
            return "wait";
        }
        return this.reserve(reactor);
    }

    // Creep.prototype.claimReactor (seasonal server): needs a live CLAIM part,
    // a Reactor target and range 1. The client stub does no owner check, so
    // whether an owned reactor can be taken over shows up only in the return
    // code; report() logs it.
    @task
    reserve(reactor: ReactorObject): Task2Ret {
        if (reactor.pos.roomName !== this.pos.roomName) return "start";
        if (!this.pos.isNearTo(reactor)) {
            this.moveTarget(reactor, 1);
            return "wait";
        }
        // Standing on thorium: shuffle to a clean tile beside the reactor. The
        // move and the claim below go out in the same tick.
        if (thoriumAt(this.pos) >= kAgingThorium) {
            const spot = this.cleanSpot(reactor);
            if (spot) this.moveDir(this.pos.getDirectionTo(spot));
        }
        this.tend(reactor);
        // Ownership can be taken by anyone; sit here and re-claim the tick it
        // goes. With a rival claimer in the room, claim every tick even while
        // it is ours so their claim never gets a tick to itself.
        if (reactor.my && !this.rivalClaimers()) return "wait";
        this.report("claimReactor", this.c.claimReactor(reactor), reactor);
        return "wait";
    }

    // Beside the reactor: feed it whatever thorium is aboard once it is under
    // kFeedBelow, and while carrying less than kHoldThorium take the
    // difference from a tombstone or ruin within reach. A pile has no amount
    // (pickup takes up to the free 50), so it is only taken when it fits under
    // kHoldThorium, or when empty with the reactor at or under kGrabBelow.
    // Transfer and pickup are separate intents, so both can go out in one tick.
    tend(reactor: ReactorObject) {
        const T = RESOURCE_THORIUM;
        if (!T || !this.c.store.getCapacity()) return;
        const carried = this.c.store[T] || 0;
        if (carried > 0 && reactor.my && (reactor.store[T] || 0) < kFeedBelow) {
            const amount = Math.min(carried, reactor.store.getFreeCapacity(T) || 0);
            if (amount > 0) {
                const err = this.c.transfer(reactor as unknown as Structure, T, amount);
                if (err !== OK) this.log("feed failed", err, amount);
            }
        }
        if (carried >= kHoldThorium) return;
        const want = kHoldThorium - carried;
        const grabAny = carried === 0 && reactor.my && (reactor.store[T] || 0) <= kGrabBelow;
        const pile = this.pos.findInRange(FIND_DROPPED_RESOURCES, 1,
            { filter: r => r.resourceType === T && (r.amount <= want || grabAny) })[0];
        if (pile) {
            this.c.pickup(pile);
            return;
        }
        const tomb = this.pos.findInRange(FIND_TOMBSTONES, 1, { filter: t => t.store[T] > 0 })[0];
        if (tomb) {
            this.c.withdraw(tomb, T, Math.min(want, tomb.store[T]));
            return;
        }
        const ruin = this.pos.findInRange(FIND_RUINS, 1, { filter: r => r.store[T] > 0 })[0];
        if (ruin) this.c.withdraw(ruin, T, Math.min(want, ruin.store[T]));
    }

    // The nearest free, thorium-free, walkable tile beside the reactor, or null.
    cleanSpot(reactor: ReactorObject): RoomPosition | null {
        const room = this.c.room;
        const terrain = Game.map.getRoomTerrain(room.name);
        const spots: RoomPosition[] = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = reactor.pos.x + dx;
                const y = reactor.pos.y + dy;
                if ((dx === 0 && dy === 0) || x < 1 || x > 48 || y < 1 || y > 48) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                const pos = new RoomPosition(x, y, room.name);
                if (pos.isEqualTo(this.pos)) continue;
                if (pos.lookFor(LOOK_CREEPS).length) continue;
                if (_.any(pos.lookFor(LOOK_STRUCTURES), s => _.contains(OBSTACLE_OBJECT_TYPES, s.structureType))) continue;
                if (thoriumAt(pos) >= kAgingThorium) continue;
                spots.push(pos);
            }
        }
        return this.pos.findClosestByRange(spots);
    }

    // Hostile creeps in this room with a live CLAIM part.
    rivalClaimers(): boolean {
        return this.c.room.find(FIND_HOSTILE_CREEPS, { filter: c => c.getActiveBodyparts(CLAIM) > 0 }).length > 0;
    }

    // Log once per distinct (intent, code) so the console shows what happened
    // without a line every tick.
    report(intent: string, err: number, reactor: ReactorObject) {
        const seen = `${intent}:${err}`;
        if (this.memory.lastIntent === seen) return;
        this.memory.lastIntent = seen;
        this.log(intent, "->", err, "owner:", reactor.owner?.username, "my:", reactor.my, "work:", reactor.continuousWork);
    }
}
