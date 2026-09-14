import { register, Priority, Service } from "process";
import * as debug from "debug";
import { getPowerCreep, MyPowerCreep } from "powercreep";
import { FlagExtra } from "flag";

// Name of the power creep this service manages, and of the flag that picks its home.
export const kFuriosaName = "Furiosa";
// Ticks between spawn-cooldown log lines.
const kLogPace = 100;
// With no child flag to act on, Furiosa waits this close to the Furiosa flag.
const kIdleRange = 5;

interface FuriosaMemory {
    // Room whose power spawn Furiosa is homed on.
    home?: string
}

declare global {
    interface Memory {
        furiosa?: FuriosaMemory
    }
}

// Run the power creep Furiosa. Plain Service (no eggs), scheduled by
// command or a purple flag named "Furiosa":
//
//   scheduleService('Furiosa')
//
// Each tick: keep a home room. A flag named Furiosa pins the home to its room;
// otherwise memory.home stands while that room is ours and has a power spawn,
// and failing that one of our power spawns is picked at random (none: the
// tick ends). If the power creep exists but is not spawned, spawn it at the
// home power spawn once its spawn cooldown (a wall-clock timestamp) has
// passed; MyPowerCreep.spawn records the room in the creep's memory.home.
// Once spawned, the Furiosa flag's child flags (named "<prefix><n>_Furiosa")
// choose her behaviour: sorted by name, the first whose prefix (digits
// stripped) is known runs; unknown prefixes are logged and skipped.
//   swipe   MyPowerCreep.runSwipe(child room, Furiosa flag room); the child flag
//           is removed once runSwipe reports the room empty (false)
// With no usable child flag she walks to within kIdleRange of the Furiosa flag.
@register
export class Furiosa extends Service {
    get memory(): FuriosaMemory {
        return Memory.furiosa = Memory.furiosa || {};
    }

    get homeName(): string | undefined {
        return this.memory.home;
    }

    get home(): Room | undefined {
        return this.homeName ? Game.rooms[this.homeName] : undefined;
    }

    // The wrapper exists whether or not the power creep does; `exists` says.
    get creep(): MyPowerCreep {
        return getPowerCreep(kFuriosaName) as MyPowerCreep;
    }

    get flag(): Flag | undefined {
        return Game.flags[kFuriosaName];
    }

    run(): Priority {
        if (!this.ensureHome()) return "low";
        const pc = this.creep;
        if (!pc.exists) return "low";
        if (!pc.spawned) {
            this.spawnCreep(pc);
            return "low";
        }
        this.lastStatus = this.runChildren(pc);
        return "low";
    }

    lastStatus = "";

    // Behaviour from the Furiosa flag's child flags; see the header. Returns a
    // status string for status().
    runChildren(pc: MyPowerCreep): string {
        const flag = this.flag;
        if (!flag) return "no Furiosa flag";
        const children = _.sortBy(
            _.filter(Game.flags, f => (f as FlagExtra).parentName === flag.name) as FlagExtra[],
            f => f.name);
        for (const child of children) {
            const prefix = child.self.replace(/\d+$/, "").toLowerCase();
            switch (prefix) {
                case "swipe": {
                    const ret = pc.runSwipe(child.pos.roomName, flag.pos.roomName);
                    if (ret === false) {
                        // Nothing left there: drop the flag so the next child takes over.
                        debug.log(this.name, child.pos.roomName, "swiped clean, removing", child.name);
                        child.remove();
                        return `swipe ${child.pos.roomName}: done`;
                    }
                    return `swipe ${child.pos.roomName}: ${ret}`;
                }
                default:
                    debug.log(this.name, "unknown child flag", child.name, "prefix", prefix);
                    continue;
            }
        }
        // Nothing to do: wait within kIdleRange of the Furiosa flag.
        const ret = pc.walkTo(flag.pos, kIdleRange);
        const where = ret === OK ? "at flag" : `to flag ${flag.pos.roomName}`;
        return (children.length ? "no known child flag, " : "no child flags, ") + where;
    }

    // Spawn an unspawned power creep at the home power spawn.
    spawnCreep(pc: MyPowerCreep): boolean {
        const cd = pc.spawnCooldown;
        if (cd > 0) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "spawn cooldown", Math.ceil(cd / 1000), "s left");
            return false;
        }
        const ps = this.home && this.powerSpawn(this.home);
        if (!ps) return false;
        const err = pc.spawn(ps);
        if (err === OK) {
            debug.log(this.name, "spawned", pc.name, "at", ps.pos);
            return true;
        }
        debug.log(this.name, "spawn failed", err, "at", ps.pos);
        return false;
    }

    // True when a home with a power spawn of ours is set (possibly just now).
    ensureHome(): boolean {
        const flag = this.flag;
        if (flag) {
            // The flag decides; it may point at a room without a power spawn,
            // in which case we wait rather than wander off to a random one.
            if (this.memory.home !== flag.pos.roomName) {
                debug.log(this.name, "home", this.homeName || "(none)", "->", flag.pos.roomName, "(flag)");
                this.memory.home = flag.pos.roomName;
            }
            const room = this.home;
            if (room && this.powerSpawn(room)) return true;
            if (Game.time % kLogPace === 0) debug.log(this.name, "flag room", flag.pos.roomName, "has no power spawn of ours");
            return false;
        }

        if (this.home && this.powerSpawn(this.home)) return true;

        const spawns = _.filter(Game.structures, s => s.structureType === STRUCTURE_POWER_SPAWN && s.my) as StructurePowerSpawn[];
        const pick = _.sample(spawns);
        if (!pick) {
            debug.log(this.name, "no power spawn anywhere, no home");
            delete this.memory.home;
            return false;
        }
        debug.log(this.name, "home", this.homeName || "(none)", "->", pick.room.name);
        this.memory.home = pick.room.name;
        return true;
    }

    powerSpawn(room: Room): StructurePowerSpawn | undefined {
        return _.first(room.findStructs(STRUCTURE_POWER_SPAWN) as StructurePowerSpawn[]);
    }

    status(): string {
        const pc = this.creep;
        const creep = pc.exists ? ` creep:${pc.spawned ? pc.room!.name : "unspawned"}` : " creep:none";
        const flag = this.flag ? ` flag:${this.flag.pos.roomName}` : "";
        const doing = this.lastStatus ? ` doing:${this.lastStatus}` : "";
        return super.status() + ` home:${this.homeName || "-"}` + flag + creep + doing;
    }
}
