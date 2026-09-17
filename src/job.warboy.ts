import { JobCreep } from "job.creep";
import { CreepCarry } from "creep.carry";
import { register, task, Task2Ret } from "mycreep";
import { findReactors, thoriumMineral } from "reactor";

// Season 11 thorium runner. Spawned in the Reactor mission's "home" room, it
// gathers thorium -- scavenging what lies on the ground or in tombstones and
// ruins around it (dead warboys drop their load) before harvesting at that
// room's extractor -- until it is full or too old for another round, then walks
// the load to the sector core and transfers it into the reactor, but only while
// the reactor is ours. Thorium on the creep's tile (its store included) ages it
// faster: ticksToLive drops 1 + floor(log10(thorium)) per tick, so 2/tick from
// 10, 3/tick from 100 and 4/tick from 1000; the body is capped below 1000 carry.

// A warboy sets off to deliver when its ticks to live would not cover the walk
// to the reactor. The walk is planned once it starts harvesting (memoized per
// standing tile, see ticksToReactor), padded by kTravelBuffer ticks, and
// scaled by kLoadedAging because a creep carrying 100..999 thorium loses 3
// ticks to live per tick. Before any plan exists kDefaultTravel stands in.
const kTravelBuffer = 50;
const kLoadedAging = 3;
const kDefaultTravel = 300;

declare global {
    interface CreepMemory {
        // Planned ticks from the harvest tile to the reactor (Warboy).
        travel?: number
    }
}

// Ticks a 1:1 MOVE body needs from `from` to within `range` of `goal`: plains
// and roads 1, swamps 5. Memoized per (from tile, goal tile) for the global.
const pathTicks = new Map<string, number>();
function ticksToReactor(from: RoomPosition, goal: RoomPosition, range: number): number {
    const key = `${from.roomName}:${from.xy}>${goal.roomName}:${goal.xy}`;
    let ticks = pathTicks.get(key);
    if (ticks === undefined) {
        const ret = PathFinder.search(from, { pos: goal, range }, { plainCost: 1, swampCost: 5, maxOps: 20000 });
        ticks = ret.incomplete ? kDefaultTravel : ret.cost;
        pathTicks.set(key, ticks);
    }
    return ticks;
}

@register
export class Warboy extends JobCreep {
    // Fixed RCL6 shape (2250 of the 2300 an RCL6 room can hold): 9 WORK,
    // 9 CARRY and a MOVE for each, so a full warboy walks plains at full
    // speed off the roads. 450 carry keeps it under the 4/tick aging tier.
    // Ordered so parts die front to back: harvest power first, then spare
    // MOVEs while the CARRY/MOVE tail holds 1:1 for full speed, cargo last.
    static readonly body: BodyPartConstant[] = [
        WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, // 9 work
        MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, // 9 move
        CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, // 4 carry move
        CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, // 4 carry move
        MOVE, CARRY] // Final part is carry to guard thorium

    static readonly cost = _.sum(Warboy.body, part => BODYPART_COST[part]);

    // Thorium one warboy carries per trip.
    static readonly tripLoad = _.filter(Warboy.body, part => part === CARRY).length * CARRY_CAPACITY;

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const homeName = this.mission.getRoomName("home");
        if (!homeName) return [null, []];
        const homeSpawns = spawns.filter(s => s.room.name === homeName && s.room.energyAvailable >= Warboy.cost);
        if (!homeSpawns.length) return [null, []];
        return [_.sample(homeSpawns), Warboy.body];
    }

    get cc(): CreepCarry {
        return this.c as CreepCarry;
    }

    get thorium(): number {
        return RESOURCE_THORIUM ? this.c.store[RESOURCE_THORIUM] || 0 : 0;
    }

    // Ticks to live at which the loaded walk to the reactor must begin.
    get deliverTtl(): number {
        return (this.memory.travel ?? kDefaultTravel + kTravelBuffer) * kLoadedAging;
    }

    // Carrying thorium and either full or too old to keep gathering.
    get shouldDeliver(): boolean {
        return this.thorium > 0 && (!this.c.store.getFreeCapacity() || this.ticksToLive < this.deliverTtl);
    }

    // Where a delivery ends: beside the reactor when we can see the core,
    // else somewhere in the middle of the core room.
    get reactorGoal(): [RoomPosition, number] {
        const core = this.mission.roomName;
        const room = Game.rooms[core];
        const reactor = room && findReactors(room)[0];
        return reactor ? [reactor.pos, 1] : [new RoomPosition(25, 25, core), 15];
    }

    // Plan the walk home from the tile we harvest on; cheap after the first
    // call on a tile, so it can run every harvest tick.
    planTravel() {
        const [goal, range] = this.reactorGoal;
        const travel = ticksToReactor(this.pos, goal, range) + kTravelBuffer;
        if (travel !== this.memory.travel) {
            this.memory.travel = travel;
            this.log("travel", travel, "ticks to", goal, "deliver below", this.deliverTtl, "ttl");
        }
    }

    start(): Task2Ret {
        if (!RESOURCE_THORIUM) return "wait";
        if (this.shouldDeliver) return this.deliver();

        const loot = this.findLoot();
        if (loot) return this.scavenge(loot);

        const mineral = thoriumMineral(this.mission.getRoom("home"));
        if (mineral) return this.harvest(mineral);

        // Nothing left to gather: a partial load is still worth the trip.
        if (this.thorium > 0) return this.deliver();

        const homeName = this.mission.getRoomName("home");
        if (homeName && this.pos.roomName !== homeName) return this.moveRoom(homeName);
        // Home is visible and its thorium is gone (or its extractor is): nothing left to do.
        this.dlog("no thorium to run");
        return "wait";
    }

    // Thorium lying around in this room: loose piles, tombstones, ruins.
    findLoot(): Resource | Tombstone | Ruin | null {
        const room = this.c.room;
        const T = RESOURCE_THORIUM!;
        const loot: (Resource | Tombstone | Ruin)[] = [
            ...room.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === T }),
            ...room.find(FIND_TOMBSTONES, { filter: t => t.store[T] > 0 }),
            ...room.find(FIND_RUINS, { filter: r => r.store[T] > 0 }),
        ];
        return this.pos.findClosestByRange(loot);
    }

    @task
    scavenge(loot: Resource | Tombstone | Ruin): Task2Ret {
        if (!this.c.store.getFreeCapacity() || this.shouldDeliver) return "start";
        const T = RESOURCE_THORIUM!;
        const left = loot instanceof Resource ? loot.amount : loot.store[T];
        if (!left) return "start";
        const err = loot instanceof Resource ? this.c.pickup(loot) : this.c.withdraw(loot, T);
        if (err === ERR_NOT_IN_RANGE) {
            this.moveTarget(loot, 1);
            return "wait";
        }
        if (err !== OK) this.log("scavenge failed", err, loot);
        return "wait";
    }

    @task
    harvest(mineral: Mineral): Task2Ret {
        if (!this.c.store.getFreeCapacity() || this.shouldDeliver) return "start";
        if (!mineral.mineralAmount) return "start";
        const err = this.c.harvest(mineral);
        if (err === ERR_NOT_IN_RANGE) {
            this.moveTarget(mineral, 1);
            return "wait";
        }
        this.planTravel();
        // ERR_TIRED is the extractor cooldown; ERR_NOT_FOUND means the extractor is gone.
        if (err === ERR_NOT_FOUND) {
            this.log("no extractor on", mineral.pos);
            return "start";
        }
        return "wait";
    }

    // Whatever the tick's task did, grab thorium lying within reach: a pile
    // or a dead warboy's tombstone beside the path costs nothing to take.
    after() {
        if (!this.c || !RESOURCE_THORIUM) return;
        this.cc.idleNomType(RESOURCE_THORIUM);
    }

    @task
    deliver(): Task2Ret {
        if (!this.thorium) return "start";
        const roomName = this.mission.roomName;
        if (this.pos.roomName !== roomName) return this.moveRoom(roomName);

        const reactor = findReactors(this.c.room)[0];
        if (!reactor) {
            this.log("no reactor in", roomName);
            return "wait";
        }
        // Feed only our own reactor; otherwise wait beside it for the Immortan.
        if (!reactor.my) {
            if (!this.pos.inRangeTo(reactor, 2)) this.moveTarget(reactor, 2);
            return "wait";
        }
        const err = this.c.transfer(reactor as unknown as Structure, RESOURCE_THORIUM!);
        if (err === ERR_NOT_IN_RANGE) {
            this.moveTarget(reactor, 1);
            return "wait";
        }
        // ERR_FULL: the reactor holds 1000; stand by until it burns some.
        if (err !== OK && err !== ERR_FULL) this.log("transfer failed", err, reactor);
        return "wait";
    }
}
