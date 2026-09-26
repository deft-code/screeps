import { JobCreep } from "job.creep";
import { register, task, Task2Ret } from "mycreep";
import { closeSpawns } from "spawnold";
import { energyDef } from "spawn";
import { defaultRewalker } from "Rewalker";
import { CreepRepair } from "creep.repair";
import { anything, worthless, Worth } from "swipeworth";

const rewalker = defaultRewalker();

// Ticks a structure that refused a withdraw (hostile rampart on top) is skipped.
const kSkipTicks = 1500;
// Body budget: 25 CARRY + 25 MOVE is the 50-part cap.
const kMaxBodyEnergy = 2500;
// Withdrawing from a nuker is bugged; everything else with a store is fair game.
const kNoSwipe: StructureConstant[] = [STRUCTURE_NUKER];

// Structures in `room` a swiper may loot: not ours, holding anything `worth`
// taking, no rampart on top, not in `skip` (structure id -> tick until which
// it is left alone). Shared with ms.swipe.ts, which winds the mission down
// when empty.
export function swipeTargets(room: Room, skip: { [id: string]: number } = {}, worth: Worth = anything): AnyStoreStructure[] {
    return room.find(FIND_STRUCTURES, {
        filter: (s: AnyStructure) => !(s as OwnedStructure).my &&
            !_.contains(kNoSwipe, s.structureType) &&
            (s as AnyStoreStructure).store !== undefined &&
            stocked((s as AnyStoreStructure).store, worth).length > 0 &&
            !(skip[s.id] > Game.time) &&
            !_.any(s.pos.lookFor(LOOK_STRUCTURES), r => r.structureType === STRUCTURE_RAMPART),
    }) as AnyStoreStructure[];
}

// Resources a store holds that are `worth` taking, in random order (so a loot
// run mixes what it takes).
function stocked(store: StoreDefinition | Store<ResourceConstant, false>, worth: Worth = anything): ResourceConstant[] {
    const s = store as unknown as { [res: string]: number };
    return _.shuffle(Object.keys(s).filter(res => s[res] > 0 && worth(res as ResourceConstant))) as ResourceConstant[];
}

declare global {
    interface CreepMemory {
        // structure id -> tick until which the swiper leaves it alone
        skip?: { [id: string]: number }
    }
}

// Loot an abandoned or hostile base for the Swipe mission
// ("Swipe <target> <home>"). Withdraws any resource, picked at random, from
// the cheapest-path structure that is not ours and holds something (spawns,
// extensions, towers, storage, terminal, labs, links, containers...; nukers
// excepted) until full, or until the room has nothing left to take while it
// carries something, then unloads at home until empty (JobCreep.unloadHome:
// storage, terminal, else the home containers with the most free space;
// dropped at the controller failing all of them).
// Withdrawing from a hostile structure only fails when a hostile rampart
// covers it; those are skipped for kSkipTicks.
@register
export class Swiper extends JobCreep {
    // From the spawns nearest home, one MOVE per CARRY (full speed loaded on
    // plains), sized to the energy on hand up to the 50-part cap.
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const close = closeSpawns(spawns, this.homeName) as StructureSpawn[];
        const spawn = _.find(close, s => !s.spawning) || _.first(close);
        if (!spawn) return [null, []];
        const energy = Math.min(spawn.room.energyAvailable, kMaxBodyEnergy);
        return [spawn, energyDef({ move: 1, per: [CARRY], energy } as any)];
    }

    get homeName(): string {
        return this.getHomeRoomName();
    }

    get home(): Room | undefined {
        return Game.rooms[this.homeName];
    }

    start(): Task2Ret {
        const c = this.c;
        // Full: carry it home. Walk straight to the store from wherever we
        // are; hopping to the room centre first sent the creep through W3N4's
        // awkward entrance twice and restarted the walk each time.
        if (this.unloadLatch(!c.store.getFreeCapacity())) return this.deliver();
        if (this.pos.roomName !== this.mission.roomName) return this.moveRoom(this.mission.roomName);
        const target = this.pickTarget();
        if (target) return this.withdrawFrom(target);
        // Nothing left to take: deliver whatever we hold rather than idle.
        if (this.unloadLatch(true)) return this.deliver();
        this.dlog("nothing to swipe in", this.mission.roomName);
        return "wait";
    }

    // Structures that are not ours, hold anything, have no rampart on top and
    // have not refused us recently.
    findTargets(): AnyStoreStructure[] {
        return swipeTargets(this.c.room, this.memory.skip, this.worth);
    }

    // The mission's pricing (Swipe.worth); anything goes for a mission without.
    get worth(): Worth {
        const m = this.mission as unknown as { worth?: Worth };
        return m.worth ? res => m.worth!(res) : anything;
    }

    // The candidate with the cheapest path: one PathFinder search over every
    // candidate at range 1. planWalk stores that path as the creep's walk,
    // so withdrawFrom's moveTarget to the same tile follows it unchanged.
    // Falls back to range when the search fails.
    pickTarget(): AnyStoreStructure | null {
        const targets = this.findTargets();
        if (!targets.length) return null;
        const i = rewalker.planWalk(this.c, targets.map(t => ({ pos: t.pos, range: 1 })));
        if (i >= 0) return targets[i];
        this.dlog("planWalk failed", i, "falling back to range");
        return this.pos.findClosestByRange(targets);
    }

    @task
    withdrawFrom(target: AnyStoreStructure): Task2Ret {
        const c = this.c;
        const res = _.first(stocked(target.store, this.worth));
        if (!res || !c.store.getFreeCapacity()) return "start";
        if (!this.pos.isNearTo(target)) return this.moveTarget(target, 1);
        const err = c.withdraw(target, res);
        if (err === OK) return "wait";
        if (err === ERR_NOT_OWNER) {
            const skip = this.memory.skip = this.memory.skip || {};
            skip[target.id] = Game.time + kSkipTicks;
            this.log(target.structureType, "at", target.pos, "is covered, skipping");
            return "start";
        }
        this.log("withdraw from", target.structureType, "at", target.pos, "failed", err);
        return "start";
    }

    // Home stores first (unloadHome); with nowhere to put it, drop it at the
    // home controller (JobCreep.dropAt).
    deliver(): Task2Ret {
        const ret = this.unloadHome(this.homeName);
        if (ret) return ret;
        const ctrl = this.home?.controller;
        if (ctrl) return this.dropAt(ctrl);
        this.log("nowhere to deliver in", this.homeName);
        return "wait";
    }

    get cc(): CreepRepair {
        return this.c as CreepRepair;
    }

    // Grab what lies within reach (a pile, then a tombstone, then a ruin),
    // except the worthless: a Konmari drops that along this very road.
    after() {
        const c = this.cc;
        if (!c.store.getFreeCapacity() || c.intents.pickup || c.intents.withdraw) return;
        const pile = _.find(c.room.lookForAtRange(LOOK_RESOURCES, c.pos, 1, true),
            spot => !worthless(spot[LOOK_RESOURCES].resourceType));
        if (pile) {
            c.goPickup(pile[LOOK_RESOURCES], false);
            return;
        }
        for (const look of [LOOK_TOMBSTONES, LOOK_RUINS] as (LOOK_TOMBSTONES | LOOK_RUINS)[]) {
            for (const spot of c.room.lookForAtRange(look, c.pos, 1, true)) {
                const holder = (spot as any)[look] as Tombstone | Ruin;
                const res = _.first(stocked(holder.store, r => !worthless(r)));
                if (!res) continue;
                c.goWithdraw(holder, res, false);
                return;
            }
        }
    }
}
