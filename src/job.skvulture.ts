import { JobCreep } from "job.creep";
import { CreepCarry } from "creep.carry";
import { register, Task2Ret } from "mycreep";
import { closeSpawns } from "spawnold";
import { roomCenterPos } from "intel";

// Source Keeper room scavenger for the SK farm (ms.skfarm.ts): the hauler
// that follows the Skhunter (job.skhunter.ts) around and picks the room
// clean. Body [CARRY, MOVE] x 17 (1700 energy, 850 carry), spawned in
// the mission's home room (else the spawns nearest the mission room), only
// when that room has the whole cost in hand.
//
// Each tick, in order:
//   flee    a keeper within kFleeRange: step away until every keeper is
//           kFleeRange + 1 off (idleFlee), nothing else this tick.
//   home    full, or under kRetireTTL ticks to live: carry the load home
//           (JobCreep.unloadHome: storage, terminal, else a container; a
//           home with nowhere to put it gets the load dropped at its
//           controller). memory.unload latches the trip until it is empty,
//           so a partial transfer does not send it back half loaded. Empty
//           and too old for another trip it waits in the home room.
//   loot    the locked target (memory.vid, memory.vkind "pile" | "tomb"):
//           walk beside it and pickup (a pile) or withdraw energy (a
//           tombstone). The lock holds until the id goes bad: the object is
//           gone or holds no energy. Only then is a new one picked: the
//           largest, by energy, of the mission room's energy piles and
//           tombstones with energy. A bigger pile appearing elsewhere does
//           not change its mind.
//   follow  nothing to loot: within kFollowRange of the mission's Skhunter,
//           else within kCenterRange of the mission room's centre
//           (intel.center, roomCenterPos).
// After all of that, outside the home room, idleNom takes whatever energy
// lies within reach (after()).
//
// It walks with memory.rewalksk set (init): the Rewalker plans the keeper
// room without its keeper layer, as the hunter does, so the walk to a pile
// beside a lair is the straight one. The flee is its own search.

const kFleeRange = 4;
const kRetireTTL = 100;
const kFollowRange = 2;
const kCenterRange = 3;
const kUnits = 17;

type VultureKind = "pile" | "tomb";

declare global {
    interface CreepMemory {
        // Skvulture: the locked loot target and what it is.
        vid?: Id<Resource> | Id<Tombstone>
        vkind?: VultureKind
    }
}

@register
export class Skvulture extends JobCreep {
    static readonly body: BodyPartConstant[] = _.flatten(_.times(kUnits, () => [CARRY, MOVE])) as BodyPartConstant[];

    static readonly cost = _.sum(Skvulture.body, part => BODYPART_COST[part]);

    // The mission's home room when it names one, else the spawns nearest
    // the mission room; one idle with the whole cost in hand, else wait.
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const home = this.mission.getRoomName("home");
        const pool = home
            ? spawns.filter(s => s.room.name === home)
            : closeSpawns(spawns, this.mission.roomName) as StructureSpawn[];
        const ready = pool.filter(s => !s.spawning && s.room.energyAvailable >= Skvulture.cost);
        if (!ready.length) return [null, []];
        return [_.sample(ready), Skvulture.body];
    }

    // Typed view of the prototype mixins this job leans on (idleFlee, keeper, idleNom).
    get cc(): CreepCarry {
        return this.c as CreepCarry;
    }

    // Away from home, grab energy within reach each tick (idleNom: an
    // adjacent pile, tombstone or ruin) whatever the main task did; at home
    // it is unloading, and would only pick up what it just put down.
    after() {
        if (!this.c || this.pos.roomName === this.homeName) return;
        this.cc.idleNom();
    }

    init(): boolean {
        if (!this.memory.rewalksk) this.memory.rewalksk = true;
        return true;
    }

    // Source Keepers in the current room.
    get keepers(): Creep[] {
        return (this.cc.room.enemies || []).filter(e => e.keeper);
    }

    get full(): boolean {
        return this.c.store.getFreeCapacity() === 0;
    }

    get carrying(): number {
        return this.c.store.getUsedCapacity();
    }

    start(): Task2Ret {
        const c = this.cc;
        const near = this.keepers.filter(k => this.pos.inRangeTo(k, kFleeRange));
        if (near.length) {
            c.idleFlee(this.keepers, kFleeRange + 1);
            return "wait";
        }

        const old = this.ticksToLive < kRetireTTL;
        if (this.unloadLatch(this.full || (old && this.carrying > 0))) return this.goHome();
        if (old) return this.retire();

        const target = this.target();
        if (target) return this.loot(target);
        return this.follow();
    }

    // Carry the load home; a home with nowhere to put it gets it dropped
    // at the controller.
    goHome(): Task2Ret {
        const homeName = this.homeName;
        const ret = this.unloadHome(homeName);
        if (ret !== null) return ret;
        const ctrl = Game.rooms[homeName]?.controller;
        if (ctrl) return this.dropAt(ctrl);
        this.log("nowhere to unload in", homeName);
        return "wait";
    }

    // Too old for another trip and empty: wait in the home room.
    retire(): Task2Ret {
        const homeName = this.homeName;
        if (this.pos.roomName !== homeName) return this.moveRoom(homeName);
        const center = roomCenterPos(homeName);
        if (!this.pos.inRangeTo(center, kCenterRange)) this.movePos(center, kCenterRange);
        return "wait";
    }

    // The locked target while its id is good, else a fresh pick (or null).
    target(): Resource | Tombstone | null {
        const mem = this.memory;
        const kept = mem.vid ? Game.getObjectById(mem.vid) : null;
        if (kept && Skvulture.energyOf(kept) > 0) return kept;
        delete mem.vid;
        delete mem.vkind;
        const room = Game.rooms[this.mission.roomName];
        if (!room) return null;
        const piles = room.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0 });
        const tombs = room.find(FIND_TOMBSTONES, { filter: t => t.store[RESOURCE_ENERGY] > 0 });
        const all: (Resource | Tombstone)[] = [...piles, ...tombs];
        if (!all.length) return null;
        const pick = _.max(all, o => Skvulture.energyOf(o)) as Resource | Tombstone;
        mem.vid = pick.id;
        mem.vkind = pick instanceof Resource ? "pile" : "tomb";
        this.dlog("locked", mem.vkind, pick.id, "with", Skvulture.energyOf(pick), "at", pick.pos);
        return pick;
    }

    static energyOf(o: Resource | Tombstone): number {
        if (o instanceof Resource) return o.resourceType === RESOURCE_ENERGY ? o.amount : 0;
        return o.store[RESOURCE_ENERGY] || 0;
    }

    // Beside the target, take from it: pickup for a pile (no amount: it
    // takes what fits), withdraw what fits for a tombstone.
    loot(target: Resource | Tombstone): Task2Ret {
        if (!this.pos.isNearTo(target)) {
            this.moveTarget(target, 1);
            return "wait";
        }
        const c = this.c;
        let err: ScreepsReturnCode;
        if (this.memory.vkind === "pile") {
            err = c.pickup(target as Resource);
        } else {
            const amount = Math.min(Skvulture.energyOf(target), c.store.getFreeCapacity());
            err = c.withdraw(target as Tombstone, RESOURCE_ENERGY, amount);
        }
        if (err !== OK) this.log(this.memory.vkind, "loot failed", err, target);
        return "wait";
    }

    // Nothing to loot: stay with the mission's hunter, else near the
    // mission room's centre.
    follow(): Task2Ret {
        const hunter = _.find(this.mission.roleCreeps("skhunter"), h => !!h.c);
        if (hunter) {
            if (!this.pos.inRangeTo(hunter.pos, kFollowRange)) this.moveTarget(hunter, kFollowRange);
            return "wait";
        }
        const center = roomCenterPos(this.mission.roomName);
        if (!this.pos.inRangeTo(center, kCenterRange)) this.movePos(center, kCenterRange);
        return "wait";
    }
}
