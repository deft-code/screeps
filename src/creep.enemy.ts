// An enemy creep remembered across ticks: its id and where it was last seen.
// The Creep object itself is never kept (game objects are stale after the
// tick they were read in); `c` looks it up again each time.
export class EnemyCreep {
    readonly id: Id<Creep>;
    private lastPos: RoomPosition;

    constructor(creep: Creep) {
        this.id = creep.id;
        this.lastPos = new RoomPosition(creep.pos.x, creep.pos.y, creep.pos.roomName);
    }

    // The creep while we have vision of it, else null (out of sight or dead).
    get c(): Creep | null {
        return Game.getObjectById(this.id);
    }

    // Where the creep is now while it is visible (remembered as a fresh
    // RoomPosition), else where it was last seen.
    get pos(): RoomPosition {
        const c = this.c;
        if (c) this.lastPos = new RoomPosition(c.pos.x, c.pos.y, c.pos.roomName);
        return this.lastPos;
    }
}
