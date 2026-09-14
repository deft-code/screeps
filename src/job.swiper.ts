import { JobCreep } from "job.creep";
import { register, task, Task2Ret } from "mycreep";
import { closeSpawns } from "spawnold";
import { energyDef } from "spawn";
import { defaultRewalker } from "Rewalker";

const rewalker = defaultRewalker();

// Ticks a structure that refused a withdraw (hostile rampart on top) is skipped.
const kSkipTicks = 1500;
// Body budget: 25 CARRY + 25 MOVE is the 50-part cap.
const kMaxBodyEnergy = 2500;
// Withdrawing from a nuker is bugged; everything else with a store is fair game.
const kNoSwipe: StructureConstant[] = [STRUCTURE_NUKER];

// Resources a store holds, most plentiful first.
function stocked(store: StoreDefinition | Store<ResourceConstant, false>): ResourceConstant[] {
    const s = store as unknown as { [res: string]: number };
    return _.sortBy(Object.keys(s).filter(res => s[res] > 0), res => -s[res]) as ResourceConstant[];
}

declare global {
    interface CreepMemory {
        // structure id -> tick until which the swiper leaves it alone
        skip?: { [id: string]: number }
    }
}

// Loot an abandoned or hostile base for the Swipe mission
// ("Swipe <target> <home>"). Withdraws any resource, most plentiful first, from
// the cheapest-path structure that is not ours and holds something (spawns,
// extensions, towers, storage, terminal, labs, links, containers...; nukers
// excepted) until full, or until the room has nothing left to take while it
// carries something, then walks straight to the home
// storage (terminal as fallback, drop at the controller failing both) as one
// persisted cross-room task, so a detour through another room resumes it.
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
        return this.mission.getRoomName("home")!;
    }

    get home(): Room | undefined {
        return Game.rooms[this.homeName];
    }

    start(): Task2Ret {
        const c = this.c;
        // Full: carry it home. Walk straight to the store from wherever we
        // are; hopping to the room centre first sent the creep through W3N4's
        // awkward entrance twice and restarted the walk each time.
        if (!c.store.getFreeCapacity()) return this.deliver();
        if (this.pos.roomName !== this.mission.roomName) return this.moveRoom(this.mission.roomName);
        const target = this.pickTarget();
        if (target) return this.withdrawFrom(target);
        // Nothing left to take: deliver whatever we hold rather than idle.
        if (c.store.getUsedCapacity()) return this.deliver();
        this.dlog("nothing to swipe in", this.mission.roomName);
        return "wait";
    }

    // Structures that are not ours, hold anything, have no rampart on top and
    // have not refused us recently.
    findTargets(): AnyStoreStructure[] {
        const skip = this.memory.skip || {};
        return this.c.room.find(FIND_STRUCTURES, {
            filter: (s: AnyStructure) => !(s as OwnedStructure).my &&
                !_.contains(kNoSwipe, s.structureType) &&
                (s as AnyStoreStructure).store !== undefined &&
                stocked((s as AnyStoreStructure).store).length > 0 &&
                !(skip[s.id] > Game.time) &&
                !this.ramparted(s),
        }) as AnyStoreStructure[];
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

    ramparted(s: Structure): boolean {
        return _.any(s.pos.lookFor(LOOK_STRUCTURES), r => r.structureType === STRUCTURE_RAMPART);
    }

    @task
    withdrawFrom(target: AnyStoreStructure): Task2Ret {
        const c = this.c;
        const res = _.first(stocked(target.store));
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

    // Targets need vision of home; as its owner we normally have it. Without
    // it, walk into the room and pick a target once there.
    deliver(): Task2Ret {
        const home = this.home;
        if (!home) return this.moveRoom(this.homeName);
        const store = home.storage || home.terminal;
        if (store) return this.transferTo(store);
        if (home.controller) return this.dropAt(home.controller);
        this.log("nowhere to deliver in", this.homeName);
        return "wait";
    }

    @task
    transferTo(store: StructureStorage | StructureTerminal): Task2Ret {
        const c = this.c;
        if (!c.store.getUsedCapacity()) return "start";
        if (!this.pos.isNearTo(store)) return this.moveTarget(store, 1);
        // One resource per tick, most plentiful first.
        const res = _.first(stocked(c.store))!;
        const err = c.transfer(store, res);
        if (err !== OK) this.log("transfer to", store, "failed", err);
        return "wait";
    }

    @task
    dropAt(ctrl: StructureController): Task2Ret {
        const res = _.first(stocked(this.c.store));
        if (!res) return "start";
        if (this.walkRange(ctrl) !== OK) return "wait";
        this.c.drop(res);
        return "wait";
    }
}
