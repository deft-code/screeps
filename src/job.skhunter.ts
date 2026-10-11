import { JobCreep } from "job.creep";
import { CreepMove } from "creep.move";
import { register, Task2Ret } from "mycreep";
import { closeSpawns } from "spawnold";

// Source Keeper hunter: the fighter of the SK farm (ms.skfarm, to come). A
// melee creep that walks to the mission room (a keeper room) and kills its
// Source Keepers one at a time, forever.
//
// Every tick, before any movement (init):
//   1. attack an adjacent enemy creep (the keeper it is on, or whatever else
//      stands beside it); attack and heal share a pipeline, so a tick that
//      swings does not heal;
//   2. otherwise heal itself while it is hurt or an enemy is within range 3
//      (the keeper's reach: it starts healing the tick before the hits land);
//   3. otherwise idleHeal (creep.heal.js): an adjacent hurt friendly, else a
//      ranged heal on one within 3.
//
// Then the movement, picked fresh each tick unless a hunt is on:
//   stalk  a keeper is alive: the one with the most hits is the target, the
//          closest among equals (idle keepers all sit at full hits). Hold
//          at range kStalkRange from it until full (see `full`), then hunt it.
//   hunt   (memory.huntid, so it survives ticks and resets) walk beside the
//          target and stay there until it is dead; a second keeper or a hurt
//          body does not change its mind. Plain creep memory, not @task:
//          the decorator belongs to the JobRole bridge, and how Job-style
//          creeps will use it is not decided yet.
//   lair   no keeper alive: go to the lair with the fewest ticksToSpawn,
//          holding at kStalkRange until full, then beside it so the next
//          keeper is in reach the tick it spawns.
//
// Full health counts a heal issued this tick: a hunter that healed itself
// with hurts no larger than its heal power is full now, and steps off the
// same tick as that final heal.
//
// It walks with memory.rewalksk set (init), so the Rewalker plans keeper
// rooms without their keeper layer (walkTo ignoreSK): with it, the tiles
// around a keeper cost 200+ against 2 elsewhere and a walk to a keeper's
// side swept the whole room within its op budget and stopped short
// ("incomplete path", Oct 2026).

// Hold this far from a keeper or its lair while healing up.
const kStalkRange = 4;
// Self-heal when an enemy is within this range even at full health.
const kThreatRange = 3;

declare global {
    interface CreepMemory {
        // Skhunter: the keeper being hunted, until it is dead.
        huntid?: Id<Creep>
    }
}

@register
export class Skhunter extends JobCreep {
    // 25 MOVE, 20 ATTACK, 5 HEAL: 4100 energy, 50 parts (plan F of the Oct
    // 2026 stub simulation, scratchpad skhunter_sim.py). A keeper's damage
    // eats the body from the front: the MOVEs go first, then ATTACKs, and
    // every HEAL comes out of the fight alive, so the walk away heals at the
    // full 60 a tick from the first tick. With 3 of the 4 HEALs in the
    // middle (3930) they died on the fight's last ticks and recovery crawled
    // up from 12 a tick: 86 ticks to kill and walk 25 tiles against 72.
    static readonly body: BodyPartConstant[] = [
        ..._.times(25, () => MOVE),
        ..._.times(20, () => ATTACK),
        ..._.times(5, () => HEAL),
    ] as BodyPartConstant[];

    static readonly cost = _.sum(Skhunter.body, part => BODYPART_COST[part]);

    // As Mini/Micro/Pup: ahead of the civilian eggs, behind srcers.
    priority = 7;

    // The mission's home room when it names one, else the spawns nearest
    // the mission room; among those, one whose room can hold the body and
    // has the energy now. None ready: wait (the egg stays).
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const home = this.mission.getRoomName("home");
        const pool = home
            ? spawns.filter(s => s.room.name === home)
            : closeSpawns(spawns, this.mission.roomName) as StructureSpawn[];
        const able = pool.filter(s => s.room.energyCapacityAvailable >= Skhunter.cost);
        const ready = able.filter(s => !s.spawning && s.room.energyAvailable >= Skhunter.cost);
        if (!ready.length) return [null, []];
        return [_.sample(ready), Skhunter.body];
    }

    // Typed view of the prototype mixins this job leans on (intents, hurts,
    // info, keeper, idleHeal).
    get cc(): CreepMove {
        return this.c as CreepMove;
    }

    // Whether the heal issued this tick was on itself (heap, per tick).
    healedSelf = false;

    // Full health, counting a self-heal issued this tick that covers the
    // damage.
    get full(): boolean {
        const c = this.cc;
        if (!c.hurts) return true;
        return this.healedSelf && c.info.heal >= c.hurts;
    }

    // Source Keepers in the current room.
    get keepers(): Creep[] {
        return (this.cc.room.enemies || []).filter(e => e.keeper);
    }

    get enemies(): Creep[] {
        return this.cc.room.enemies || [];
    }

    // The fight, every tick before the tasks run: attack, else self-heal,
    // else idleHeal. Nothing here moves.
    init(): boolean {
        this.healedSelf = false;
        if (!this.memory.rewalksk) this.memory.rewalksk = true;
        const c = this.cc;
        if (c.intents.melee) return true;
        const enemies = this.enemies;
        const adjacent = this.pos.findClosestByRange(enemies.filter(e => this.pos.isNearTo(e)));
        if (adjacent) {
            if (c.attack(adjacent) === OK) {
                c.intents.melee = adjacent;
                return true;
            }
            this.log("attack failed", adjacent);
        }
        const threatened = _.any(enemies, e => this.pos.inRangeTo(e, kThreatRange));
        if ((c.hurts || threatened) && c.activeByType.get(HEAL)) {
            if (c.heal(c) === OK) {
                c.intents.melee = c;
                this.healedSelf = true;
                return true;
            }
        }
        (c as any).idleHeal();
        return true;
    }

    start(): Task2Ret {
        if (this.pos.roomName !== this.mission.roomName) return this.moveRoom(this.mission.roomName);

        // A hunt on: stay on it until the target is gone, whatever our hits.
        const mem = this.memory;
        const hunted = mem.huntid && Game.getObjectById(mem.huntid);
        if (hunted && hunted.pos.roomName === this.pos.roomName) return this.hunt(hunted);
        delete mem.huntid;

        const keepers = this.keepers;
        if (keepers.length) {
            const target = this.pickKeeper(keepers);
            if (!this.full) return this.stalk(target);
            mem.huntid = target.id;
            this.dlog("hunting", target.id, "at", target.pos);
            return this.hunt(target);
        }

        const lairs = this.cc.room.findStructs(STRUCTURE_KEEPER_LAIR) as StructureKeeperLair[];
        if (!lairs.length) {
            this.log("no keeper lairs in", this.pos.roomName);
            return "wait";
        }
        const lair = _.min(lairs, l => l.ticksToSpawn ?? Infinity) as StructureKeeperLair;
        if (!this.full) return this.stalk(lair);
        if (!this.pos.isNearTo(lair)) this.moveTarget(lair, 1);
        return "wait";
    }

    // The keeper with the most hits; among equals, the closest.
    pickKeeper(keepers: Creep[]): Creep {
        const top = _.max(keepers, k => k.hits) as Creep;
        const best = keepers.filter(k => k.hits === top.hits);
        return this.pos.findClosestByRange(best) || top;
    }

    // Heal up at kStalkRange from `target`: close in when farther, back off
    // when nearer, stand still at the range.
    stalk(target: Creep | StructureKeeperLair): Task2Ret {
        const range = this.pos.getRangeTo(target);
        if (range > kStalkRange) {
            this.moveTarget(target, kStalkRange);
        } else if (range < kStalkRange) {
            this.cc.idleFlee([target as Creep], kStalkRange);
        }
        return "wait";
    }

    // Beside the target until it is dead (start() drops memory.huntid once
    // the id no longer resolves), whatever its own hits. init() already
    // swung at it this tick.
    hunt(target: Creep): Task2Ret {
        if (!this.pos.isNearTo(target)) this.moveTarget(target, 1);
        return "wait";
    }

}
