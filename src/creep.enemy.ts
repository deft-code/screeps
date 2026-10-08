import { atExit, positionAtDirection } from "Rewalker";

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
}
