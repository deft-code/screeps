import { JobRole } from "job.role";
import { register, task, Task2Ret } from "mycreep";
import { CreepRole } from "creep.role";
import { EnemyCreep } from "creep.enemy";

// Port of role.wolf.js (2017 flag-team era) to the 2022 mission/job system.
// A melee creep spawned near the mission room. It walks to the mission
// room, kills whatever enemy creeps it meets on the way or in the room, then
// tears down any invader core. Farm and Remote lay one through
// paceJobs(Wolf, 1500) while a core stands (team.ts suppressInvaderCore) and
// through paceJobs(Wolf, max(1500 - thostiles, 350)) once armed hostiles have
// camped the room for 300 ticks (team.ts suppressWolf).
//
// A new target is picked from the mission room first, the room it was sent
// to hold, whenever that room is in view (from the wolf itself or any other
// vision), and only then from the room the wolf stands in: armed hostiles,
// then an invader core, then any other enemy creep, in each. A wolf that
// chased something out of its room so goes back for the next intruder
// instead of taking up whatever it finds where the chase ended. A target in
// another room is walked to (moveChase, multi-room) until attack() can take
// it.
//
// The enemy creep it last fought is remembered on the class (lastTarget, an
// EnemyCreep: lost at a global reset). With nothing to fight in its own room
// it goes after that one: to the creep while some other vision shows it, else
// to where it was last seen and, when that is on or beside a room edge, over
// the exit it left by, so an enemy that hops between rooms is followed
// instead of forgotten.
// The exit tile a creep last seen at `pos` left the room by: `pos` itself on
// an edge, else the nearest walkable edge tile beside it; null when `pos` is
// not on or beside an edge.
function exitTile(pos: RoomPosition): RoomPosition | null {
    const terrain = Game.map.getRoomTerrain(pos.roomName);
    let best: RoomPosition | null = null;
    let bestDist = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const x = pos.x + dx;
            const y = pos.y + dy;
            if (x < 0 || x > 49 || y < 0 || y > 49) continue;
            if (x !== 0 && x !== 49 && y !== 0 && y !== 49) continue;
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            // The tile itself, then straight out, then diagonal.
            const dist = Math.abs(dx) + Math.abs(dy);
            if (dist < bestDist) {
                best = new RoomPosition(x, y, pos.roomName);
                bestDist = dist;
            }
        }
    }
    return best;
}

@register
export class Wolf extends JobRole {
    // The enemy creep last attacked; see pursue().
    lastTarget: EnemyCreep | null = null;
    // Stepping over the exit the latest target left by.
    crossing = false;

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        // body key "wolf" in spawnold.buildBody: a close spawn whose room capacity
        // is >= 700, body scaled by energyDef to the energy available there now:
        // n ATTACK + n MOVE (130 per level), at least level 4 (520: sized to max(550, energy
        // available), so a drained room waits) up to level 25 (3250, 50 parts).
        // See docs/spawning.md "Body definitions". Offroad creep: spawns fine from
        // whatever spawns are nearest the mission room.
        return this.closeSpawn(spawns, { body: "wolf" });
    }

    // Typed view of the prototype mixins this job leans on (intents, hurts, melee, activeByType).
    get cc(): CreepRole {
        return this.c as CreepRole;
    }

    start(): Task2Ret {
        const c = this.cc;
        if (this.shouldRetreat()) return this.retreat();

        const target = this.pickTarget();
        if (target) {
            if (target.pos.roomName === this.pos.roomName) return this.attack(target);
            // In the mission room while we are elsewhere: head over, and
            // remember a creep so pursue() keeps after it if it leaves.
            if (target instanceof Creep) this.track(target);
            this.moveChase(target);
            return "wait";
        }

        if (this.pursue()) return "wait";

        if (c.room.name !== this.mission.roomName) {
            return this.moveRoom(this.mission.roomName);
        }
        // role.wolf.js movePeace(team): hold near the room center.
        return this.hold();
    }

    // The rooms to pick a target from, in order: the mission room while it
    // is in view, then the room the wolf is in.
    arenas(): Room[] {
        const here = this.cc.room;
        const home = Game.rooms[this.mission.roomName];
        return home && home !== here ? [home, here] : [here];
    }

    // Armed hostiles first, then the invader core, then any other enemy
    // creep (scouts, haulers), from the first arena that has one. Never
    // Source Keepers: they stay by their lair, Rewalker paths around them,
    // and a wolf that engages one on the way through an SK room never
    // leaves it.
    pickTarget(): Creep | AnyStructure | null {
        for (const room of this.arenas()) {
            const hostile = this.closest(Wolf.hostilesIn(room));
            if (hostile) return hostile;
            const core = _.first(room.findStructs(STRUCTURE_INVADER_CORE));
            if (core) return core;
            const enemy = this.closest(Wolf.enemiesIn(room));
            if (enemy) return enemy;
        }
        return null;
    }

    // The closest of `creeps` by range in the wolf's own room; in another
    // room the first one (ranges across rooms are meaningless).
    closest(creeps: Creep[]): Creep | null {
        if (!creeps.length) return null;
        if (creeps[0].pos.roomName !== this.pos.roomName) return creeps[0];
        return this.pos.findClosestByRange(creeps);
    }

    // Enemy creeps worth a fight in `room`, Source Keepers excluded.
    static enemiesIn(room: Room): Creep[] {
        return (room.enemies || []).filter(e => !e.keeper);
    }

    static hostilesIn(room: Room): Creep[] {
        return (room.hostiles || []).filter(e => !e.keeper);
    }

    // ...in the current room.
    get enemies(): Creep[] {
        return Wolf.enemiesIn(this.cc.room);
    }

    get hostiles(): Creep[] {
        return Wolf.hostilesIn(this.cc.room);
    }

    // Remember `creep` as the latest target, refreshing where it was seen.
    track(creep: Creep) {
        if (this.lastTarget?.id !== creep.id) {
            this.lastTarget = new EnemyCreep(creep);
            this.crossing = false;
        }
        this.lastTarget.pos;
    }

    forget(): false {
        this.lastTarget = null;
        this.crossing = false;
        return false;
    }

    // Nothing to fight here: go after the latest target. True while the
    // chase is on.
    //   - Visible (some other vision shows it in another room): walk to it.
    //   - Out of sight, last seen on or beside a room edge: it left by that
    //     exit, so step over it (crossing). In the room beyond, still not
    //     seeing it, give up.
    //   - Out of sight, last seen anywhere else: walk there; beside the
    //     tile without seeing it (dead, or gone for good) give up.
    pursue(): boolean {
        const target = this.lastTarget;
        if (!target) return false;
        const last = target.pos;
        if (target.c) {
            this.moveChase(target);
            return true;
        }
        if (this.pos.roomName !== last.roomName) {
            if (this.crossing) {
                this.dlog("lost", target.id, "beyond", last);
                return this.forget();
            }
            this.moveChase(target);
            return true;
        }
        const exit = exitTile(last);
        if (!exit) {
            if (this.pos.isNearTo(last)) return this.forget();
            this.moveChase(target);
            return true;
        }
        if (this.pos.isNearTo(exit)) {
            this.crossing = true;
            this.moveDir(this.pos.getDirectionTo(exit));
        } else {
            this.movePos(exit, 1);
        }
        return true;
    }

    // role.wolf.js idleRetreat(TOUGH): a wolf has no TOUGH, so it retreated
    // whenever it had lost 100 hits. Keep fighting while more than half alive
    // and still armed. It retreats to JobCreep.homeName: the mission's home
    // room, else the room it was spawned in.
    shouldRetreat(): boolean {
        const c = this.cc;
        if (!c.melee) return true;
        return c.hurts >= 100 && c.hurts > c.hits;
    }

    @task
    retreat(): Task2Ret {
        const c = this.cc;
        if (c.melee && c.hurts < 100) return "start";
        const homeName = this.homeName;
        const ctrl = Game.rooms[homeName]?.controller;
        if (ctrl) {
            this.moveTarget(ctrl, 3);
        } else {
            this.moveRoom(homeName);
        }
        return "wait";
    }

    @task
    attack(target: Creep | AnyStructure): Task2Ret {
        const c = this.cc;
        if (target.pos.roomName !== this.pos.roomName) return "start";
        if (target instanceof Creep) this.track(target);
        // Armed hostiles outrank everything else; retarget when one appears
        // while we are chewing on a core or an unarmed enemy.
        if (this.hostiles.length && !(target instanceof Creep && target.hostile)) return "start";

        const err = c.attack(target);
        if (err !== OK && err !== ERR_NOT_IN_RANGE) {
            this.log("attack failed", err, target);
            return "start";
        }
        if (err === OK) c.intents.melee = target;
        // moveChase: walk to range 1, then step at the target's square every
        // tick so a fleeing creep stays in reach. Creeps and structures
        // alike: it takes any target.
        this.moveChase(target);
        return "wait";
    }

    hold(): Task2Ret {
        const center = new RoomPosition(25, 25, this.pos.roomName);
        if (this.pos.inRangeTo(center, 3)) return "wait";
        this.movePos(center, 3);
        return "wait";
    }

    // role.wolf.js afterWolf: opportunistic melee on an adjacent enemy, and
    // self-heal if any HEAL part is left, once the main intent is spent.
    after() {
        if (!this.c) return;
        const c = this.cc;
        if (!c.intents.melee) {
            const enemy = this.pos.findClosestByRange(this.enemies);
            if (enemy && this.pos.isNearTo(enemy) && c.attack(enemy) === OK) {
                c.intents.melee = enemy;
            }
        }
        if (!c.intents.melee && c.hurts && c.activeByType.get(HEAL)) {
            if (c.heal(c) === OK) c.intents.melee = c;
        }
    }
}
