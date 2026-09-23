import { JobCreep } from "job.creep";
import { CreepCarry } from "creep.carry";
import { register, task, Task2Ret } from "mycreep";
import { energyDef } from "spawn";
import { thoriumMineral } from "reactor";
import type { Thormine } from "ms.thormine";

// Season 11 thorium miner for the Thormine mission (ms.thormine.ts). Spawned
// in the mission room, it harvests that room's thorium mineral (an extractor
// on it, the mission checks) and carries the load to the room's terminal,
// where the mission ships it on. Thorium aboard ages the creep (1 +
// floor(log10(thorium)) ticks to live per tick: 3/tick from 100), so:
//   - it harvests only while the next harvest intent fits in its store. A
//     harvest yields WORK parts x HARVEST_MINERAL_POWER; anything over the
//     free capacity spills on the tile, where it ages the creep for nothing.
//   - it sets off for the terminal once its ticks to live would not cover the
//     walk at kLoadedAging ticks of life per tick, the walk PathFinder-planned
//     from the harvest tile (memoized per tile) plus kTravelBuffer.
// Empty and too old for another loaded walk it waits beside the terminal.
// Once the mineral is mined out (mineralAmount 0, whatever the extractor)
// and its store is empty it walks to a spawn in the room and is recycled,
// so the body's energy comes back instead of aging away.

const kTravelBuffer = 20;
const kLoadedAging = 3;
const kDefaultTravel = 100;
// energyDef's smallest body is level 2 (4 WORK, 2 CARRY, 3 MOVE = 650); a
// spawn needs at least that much to be considered.
const kMinEnergy = 650;

declare global {
    interface CreepMemory {
        // Planned ticks from the harvest tile to the terminal (Thoreater).
        travel?: number
    }
}

// Ticks a body with one MOVE per two other parts needs from `from` to within
// `range` of `goal`, loaded: plains 2, swamps 10, roads 1. Memoized per
// (from tile, goal tile) for the global.
const pathTicks = new Map<string, number>();
function ticksToGoal(from: RoomPosition, goal: RoomPosition, range: number): number {
    const key = `${from.roomName}:${from.xy}>${goal.roomName}:${goal.xy}`;
    let ticks = pathTicks.get(key);
    if (ticks === undefined) {
        const ret = PathFinder.search(from, { pos: goal, range }, { plainCost: 2, swampCost: 10, maxOps: 4000 });
        ticks = ret.incomplete ? kDefaultTravel : ret.cost;
        pathTicks.set(key, ticks);
    }
    return ticks;
}

@register
export class Thoreater extends JobCreep {
    // Two WORK per CARRY and a MOVE per two parts, as big as the mission
    // room's spawns can fill right now: at RCL6 (2300) 14 WORK, 7 CARRY
    // (350 store, under the 1000 aging tier) and 11 MOVE.
    static body(energy: number): BodyPartConstant[] {
        return energyDef({ move: 2, per: [WORK, WORK, CARRY], energy });
    }

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const roomName = this.mission.roomName;
        const local = spawns.filter(s => s.room.name === roomName && s.room.energyAvailable >= kMinEnergy);
        const spawn = _.sample(local);
        if (!spawn) return [null, []];
        return [spawn, Thoreater.body(spawn.room.energyAvailable)];
    }

    get cc(): CreepCarry {
        return this.c as CreepCarry;
    }

    get thorium(): number {
        return RESOURCE_THORIUM ? this.c.store[RESOURCE_THORIUM] || 0 : 0;
    }

    // Thorium one harvest intent yields.
    get harvestYield(): number {
        return this.c.getActiveBodyparts(WORK) * HARVEST_MINERAL_POWER;
    }

    // The next harvest would not all fit: some would land on the tile.
    get wouldSpill(): boolean {
        return this.c.store.getFreeCapacity() < this.harvestYield;
    }

    // Ticks to live at which the loaded walk to the terminal must begin.
    get depositTtl(): number {
        return ((this.memory.travel ?? kDefaultTravel) + kTravelBuffer) * kLoadedAging;
    }

    get tooOld(): boolean {
        return this.ticksToLive < this.depositTtl;
    }

    // Carrying thorium and either full for the next intent or too old to keep mining.
    get shouldDeposit(): boolean {
        return this.thorium > 0 && (this.wouldSpill || this.tooOld);
    }

    get terminal(): StructureTerminal | null {
        return this.mission.room?.terminal || null;
    }

    // The room's thorium is mined out: the mission saw it once and now it is
    // gone (a mined-out thorium mineral vanishes) or empty. False without
    // vision, and for a mission that is not a Thormine.
    get depleted(): boolean {
        const mission = this.mission as Partial<Thormine>;
        return !!mission.minedOut;
    }

    // Plan the walk to the terminal from the tile we harvest on; cheap after
    // the first call on a tile, so it runs every harvest tick.
    planTravel(terminal: StructureTerminal) {
        const travel = ticksToGoal(this.pos, terminal.pos, 1);
        if (travel !== this.memory.travel) {
            this.memory.travel = travel;
            this.log("travel", travel, "ticks to", terminal.pos, "deposit below", this.depositTtl, "ttl");
        }
    }

    start(): Task2Ret {
        if (!RESOURCE_THORIUM) return "wait";
        const roomName = this.mission.roomName;
        if (this.pos.roomName !== roomName) return this.moveRoom(roomName);

        if (this.shouldDeposit) return this.deposit();

        // Mined out and carrying nothing: give the body back.
        if (this.depleted && !this.c.store.getUsedCapacity()) return this.recycle();

        const terminal = this.terminal;
        if (!terminal) {
            this.dlog("no terminal");
            return "wait";
        }
        // Too old for another loaded walk: park beside the terminal, out of
        // the way of the mining spots, and hand over whatever is aboard.
        if (this.tooOld) {
            if (this.thorium > 0) return this.deposit();
            if (!this.pos.inRangeTo(terminal, 2)) this.moveTarget(terminal, 2);
            return "wait";
        }
        const mineral = thoriumMineral(this.c.room);
        if (mineral) return this.harvest(mineral);

        // The extractor is gone (a mined-out mineral recycled above): bank a
        // partial load, then wait.
        if (this.thorium > 0) return this.deposit();
        this.dlog("no thorium to mine");
        return "wait";
    }

    // Mined out and empty: hand the body back at the nearest spawn in the
    // room, or suicide when the room has none left.
    @task
    recycle(): Task2Ret {
        if (this.c.store.getUsedCapacity()) return "start";
        const spawn = this.pos.findClosestByRange(this.c.room.findStructs(STRUCTURE_SPAWN) as StructureSpawn[]);
        if (!spawn) {
            this.log("mined out, no spawn to recycle at, suiciding");
            this.c.suicide();
            return "wait";
        }
        if (!this.pos.isNearTo(spawn)) {
            this.moveTarget(spawn, 1);
            return "wait";
        }
        const err = spawn.recycleCreep(this.c);
        if (err !== OK) this.log("recycle failed", err, spawn);
        return "wait";
    }

    @task
    harvest(mineral: Mineral): Task2Ret {
        if (this.shouldDeposit) return "start";
        if (!mineral.mineralAmount) return "start";
        const err = this.c.harvest(mineral);
        if (err === ERR_NOT_IN_RANGE) {
            this.moveTarget(mineral, 1);
            return "wait";
        }
        const terminal = this.terminal;
        if (terminal) this.planTravel(terminal);
        // ERR_TIRED is the extractor cooldown; ERR_NOT_FOUND means the extractor is gone.
        if (err === ERR_NOT_FOUND) {
            this.log("no extractor on", mineral.pos);
            return "start";
        }
        return "wait";
    }

    // Whatever the tick's task did, take thorium lying within reach: a spill
    // or a dead miner's tombstone on the spot ages whoever stands there.
    after() {
        if (!this.c || !RESOURCE_THORIUM) return;
        if (this.wouldSpill) return;
        this.cc.idleNomType(RESOURCE_THORIUM);
    }

    @task
    deposit(): Task2Ret {
        if (!this.thorium) return "start";
        const terminal = this.terminal;
        if (!terminal) {
            this.log("no terminal in", this.mission.roomName);
            return "wait";
        }
        if (!this.pos.isNearTo(terminal)) {
            this.moveTarget(terminal, 1);
            return "wait";
        }
        // transfer with no amount is ERR_FULL unless the whole load fits.
        const T = RESOURCE_THORIUM!;
        const amount = Math.min(this.thorium, terminal.store.getFreeCapacity(T) || 0);
        if (amount <= 0) {
            this.log("terminal full", terminal);
            return "wait";
        }
        const err = this.c.transfer(terminal, T, amount);
        if (err !== OK) this.log("transfer failed", err, amount, terminal);
        return "wait";
    }
}
