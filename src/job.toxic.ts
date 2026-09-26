import { register, task, Task2Ret } from "mycreep";
import { Guard } from "job.guard";
import { toXY } from "Rewalker";

// A bait-and-trap skirmisher on the fixed 'mini' body [RANGED_ATTACK, MOVE,
// MOVE, HEAL] (400 energy, spawnold.buildBody), spawned by Once:
//
//   scheduleService('Once Toxic W25S5')     // one; 'Once Toxic W25S5 3' for three in turn
//
// It runs a mode machine in memory.tmode:
//   travel  the start mode: walk to the mission room. There, hostiles (armed
//           enemies, room.hostiles) mean bait, none means harass.
//   bait    hold range 5 from the nearest hostile: flee (idleFlee) when
//           closer, close in when farther, shooting whatever comes within 3.
//           Within 2 tiles of an exit with a hostile within 5 it becomes trap.
//           If nothing bites, it takes a little risk to start the chase:
//           memory.tstill counts ticks in bait at full health while the
//           nearest hostile stands still (memory.tfoe, its tile) and nothing
//           hits or chases the bait; at 10 the held range drops to 4, at 20
//           to 3. Damage, a flee or the hostile moving resets it. Stepping in
//           by itself does not, or it would step straight back out.
//   trap    stand on the tile just inside the nearest exit (trapSpot: one
//           step in from the border tile, never on it, where a step back
//           crosses the room line) and shoot what comes into range. Back to
//           bait when no hostile is within kTrapRange, so it never camps an
//           empty corner.
//   heal    entered from bait or trap once every RANGED_ATTACK part is gone:
//           out by the nearest exit (getting out matters more than where to;
//           it self-heals, so it would be full long before reaching home),
//           then in the next room keep range 5 from every exit tile and from
//           any hostile (one idleFlee from both) and sit there self-healing
//           (Guard.after) until full, then travel again.
//   harass  no hostiles in the room: engage the nearest assaulter (an unarmed
//           enemy with more than one WORK or HEAL, room.assaulters); else heal
//           a hurt friendly; else hold within 5 of the room's centroid
//           (Guard.hold: only after 3 idle ticks). Hostiles arriving switch it
//           back to bait.
// Guard.after() adds the opportunistic shot and heal every tick in any mode.
const kBaitRange = 5;
// bait: ticks still at full health before closing to range 4, then 3.
const kStillClose = 10;
const kStillCloser = 20;
const kTrapRange = 7;
const kExitRange = 2;
const kCentroidRange = 5;
// heal mode, outside the mission room: keep this far from exits and hostiles.
const kExitFlee = 5;

type ToxicMode = "travel" | "bait" | "trap" | "heal" | "harass";

declare global {
    interface CreepMemory {
        tmode?: ToxicMode
        // bait: ticks at full health without fleeing or taking damage while
        // the nearest hostile (tfoe, its packed xy) has not moved.
        tstill?: number
        tfoe?: number
    }
}

function edgeRange(pos: RoomPosition): number {
    return Math.min(pos.x, pos.y, 49 - pos.x, 49 - pos.y);
}

@register
export class Toxic extends Guard {
    // As Mini: ahead of the civilian eggs, behind srcers.
    priority = 7;
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        return this.closeSpawn(spawns, { body: "mini" });
    }

    get mode(): ToxicMode {
        return this.memory.tmode || "travel";
    }
    set mode(m: ToxicMode) {
        if (m === this.memory.tmode) return;
        this.dlog("mode", this.mode, "->", m);
        this.memory.tmode = m;
        delete this.memory.tstill;
        delete this.memory.tfoe;
    }

    get disarmed(): boolean {
        return !this.cc.activeByType.get(RANGED_ATTACK);
    }

    get hostiles(): Creep[] {
        return this.c.room.hostiles || [];
    }

    // Guard.start wraps this with the hold() idle bookkeeping.
    decide(): Task2Ret {
        if (this.mode === "heal") return this.healUp();
        if ((this.mode === "bait" || this.mode === "trap") && this.disarmed) {
            this.mode = "heal";
            return this.healUp();
        }
        if (this.c.room.name !== this.mission.roomName) {
            this.mode = "travel";
            return this.moveRoom(this.mission.roomName);
        }
        switch (this.mode) {
            case "bait": return this.bait();
            case "trap": return this.trap();
            case "harass": return this.harass();
        }
        // travel, arrived: pick by what is here.
        this.mode = this.hostiles.length ? "bait" : "harass";
        return "again";
    }

    // The range bait holds: 5, closing to 4 then 3 the longer nothing bites.
    get baitRange(): number {
        const still = this.memory.tstill || 0;
        if (still >= kStillCloser) return kBaitRange - 2;
        if (still >= kStillClose) return kBaitRange - 1;
        return kBaitRange;
    }

    bait(): Task2Ret {
        const c = this.cc;
        const hostiles = this.hostiles;
        const near = this.pos.findClosestByRange(hostiles);
        if (!near) {
            this.mode = "harass";
            return "again";
        }
        const range = this.pos.getRangeTo(near);
        if (range <= kBaitRange && edgeRange(this.pos) <= kExitRange) {
            this.mode = "trap";
            return "again";
        }
        if (range <= 3) this.shoot(near, range);
        const hold = this.baitRange;
        const foe = toXY(near.pos);
        if (c.hits < c.hitsMax || foe !== this.memory.tfoe) {
            this.memory.tstill = 0;
        } else {
            this.memory.tstill = (this.memory.tstill || 0) + 1;
        }
        this.memory.tfoe = foe;
        if (range < hold) {
            // Being chased: the bait is working, keep the full distance.
            this.memory.tstill = 0;
            c.idleFlee(hostiles, kBaitRange);
        } else if (range > hold) {
            this.moveTarget(near, hold);
        }
        return "wait";
    }

    trap(): Task2Ret {
        const near = this.pos.findClosestByRange(this.hostiles);
        if (!near) {
            this.mode = "harass";
            return "again";
        }
        const range = this.pos.getRangeTo(near);
        if (range > kTrapRange) {
            this.mode = "bait";
            return "again";
        }
        if (range <= 3) this.shoot(near, range);
        if (edgeRange(this.pos) !== 1) {
            const spot = this.trapSpot();
            if (spot) this.movePos(spot, 0);
        }
        return "wait";
    }

    // The walkable tile one step inside the nearest exit tile, or null.
    trapSpot(): RoomPosition | null {
        const room = this.c.room;
        const t = Game.map.getRoomTerrain(room.name);
        const exits = _.sortBy(room.find(FIND_EXIT), e => this.pos.getRangeTo(e));
        for (const e of exits) {
            const x = e.x === 0 ? 1 : e.x === 49 ? 48 : e.x;
            const y = e.y === 0 ? 1 : e.y === 49 ? 48 : e.y;
            if (t.get(x, y) & TERRAIN_MASK_WALL) continue;
            return new RoomPosition(x, y, room.name);
        }
        return null;
    }

    harass(): Task2Ret {
        if (this.hostiles.length) {
            this.mode = "bait";
            return "again";
        }
        const room = this.c.room;
        const target = this.pos.findClosestByRange(room.assaulters || []);
        if (target) return this.engage(target);
        const hurt = this.pickHurt();
        if (hurt) return this.healCreep(hurt);
        return this.hold(kCentroidRange);
    }

    // Out of the mission room and off its edge, then sit until full health.
    healUp(): Task2Ret {
        const c = this.cc;
        if (c.hits >= c.hitsMax) {
            this.mode = "travel";
            return "again";
        }
        const hostiles = this.hostiles;
        if (this.pos.roomName === this.mission.roomName) {
            const exit = this.pos.findClosestByRange(FIND_EXIT);
            if (exit) this.movePos(exit, 0);
            return "wait";
        }
        // Away from the exits (a border tile bounces it back, and the enemy
        // may follow through one) and from anything armed in this room.
        const threats: { pos: RoomPosition }[] = hostiles.filter(h => h.pos.inRangeTo(this.pos, kExitFlee));
        if (edgeRange(this.pos) <= kExitFlee) {
            for (const exit of this.c.room.find(FIND_EXIT)) {
                if (exit.inRangeTo(this.pos, kExitFlee)) threats.push({ pos: exit });
            }
        }
        if (threats.length && c.idleFlee(threats as Creep[], kExitFlee) !== false) return "wait";
        this.stepOffEdge();
        return "wait";
    }

    // An exit tile bounces the creep back across the border next tick.
    stepOffEdge() {
        const { x, y } = this.pos;
        if (x === 0) this.moveDir(RIGHT);
        else if (x === 49) this.moveDir(LEFT);
        else if (y === 0) this.moveDir(BOTTOM);
        else if (y === 49) this.moveDir(TOP);
    }
}
