import { atExit, positionAtDirection } from "Rewalker";
import type { CreepMove } from "creep.move";

// Militant creeps (the Assault missions, Oct 2026): creeps built to fight,
// Source Keepers included (callers that walk keeper rooms filter
// creep.keeper themselves). Active: an ATTACK or RANGED_ATTACK part still
// working (Creep.hostile). Inactive: every weapon part broken, or a healer
// with no weapon at all. Haulers, harvesters, scouts and claimers are
// neither. The wick shoots the active ones first, then the inactive.
export function isActiveMilitant(c: Creep): boolean {
    return !!(c as CreepMove).hostile;
}

export function isInactiveMilitant(c: Creep): boolean {
    if (isActiveMilitant(c)) return false;
    return _.any(c.body, p => p.type === ATTACK || p.type === RANGED_ATTACK || p.type === HEAL);
}

export function isMilitant(c: Creep): boolean {
    return isActiveMilitant(c) || isInactiveMilitant(c);
}

// The militant enemy creeps of `room` (its enemies list, else a find),
// Source Keepers left out.
export function militantsIn(room: Room): Creep[] {
    return (room.enemies || room.find(FIND_HOSTILE_CREEPS)).filter(e => !e.keeper && isMilitant(e));
}

// The tile on the far side of a room exit: where a creep that stood on
// `exit` and vanished has gone. An edge with no room beyond (the tile is
// then a wall nobody could have stood on) answers the tile itself.
function acrossExit(exit: RoomPosition): RoomPosition {
    const dir = exit.x === 0 ? LEFT : exit.x === 49 ? RIGHT : exit.y === 0 ? TOP : BOTTOM;
    if (!Game.map.describeExits(exit.roomName)?.[dir]) return exit;
    return positionAtDirection(exit, dir);
}

// An enemy creep remembered across ticks: its id and where it was last seen.
// The Creep object itself is never kept (game objects are stale after the
// tick they were read in); `c` looks it up again each time.
export class EnemyCreep {
    readonly id: Id<Creep>;
    private lastPos: RoomPosition;
    // The tick the creep was last visible.
    seenAt: number;

    constructor(creep: Creep) {
        this.id = creep.id;
        this.lastPos = new RoomPosition(creep.pos.x, creep.pos.y, creep.pos.roomName);
        this.seenAt = Game.time;
    }

    // The creep while we have vision of it, else null (out of sight or dead).
    get c(): Creep | null {
        return Game.getObjectById(this.id);
    }

    // Where the creep is now while it is visible (remembered as a fresh
    // RoomPosition), else where it was last seen; a creep that vanished from
    // an exit tile left the room, so that case answers the tile across the
    // exit in the next room. The remembered tile itself is never changed
    // (lastSeen).
    get pos(): RoomPosition {
        const c = this.c;
        if (c) {
            this.lastPos = new RoomPosition(c.pos.x, c.pos.y, c.pos.roomName);
            this.seenAt = Game.time;
        } else if (atExit(this.lastPos)) {
            return acrossExit(this.lastPos);
        }
        return this.lastPos;
    }

    // The tile the creep was last seen on, as recorded.
    get lastSeen(): RoomPosition {
        this.pos;
        return this.lastPos;
    }

    // The militant kinds above, read off the live creep; false out of sight.
    get activeMilitant(): boolean {
        const c = this.c;
        return !!c && isActiveMilitant(c);
    }

    get inactiveMilitant(): boolean {
        const c = this.c;
        return !!c && isInactiveMilitant(c);
    }

    get militant(): boolean {
        return this.activeMilitant || this.inactiveMilitant;
    }
}
