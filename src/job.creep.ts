import { Mission } from "mission";
import { MyCreep, task, Task2Ret } from "mycreep";
import { Service } from "process";
import { defaultRewalker, fromXY } from "Rewalker";

interface HasPos {
    pos: RoomPosition
}

declare global {
    interface CreepMemory {
        // Unloading at home: set by unloadLatch, cleared once empty.
        unload?: boolean
        // Home container being carried to while home has no storage/terminal space.
        dropid?: Id<StructureContainer>
        // Hurt friendly being healed (pickHurt), cleared once healed or gone.
        healid?: Id<Creep>
    }
}

// pickHurt looks this far for a hurt friendly before searching the room:
// rangedHeal reach.
const kHealRange = 3;

type UnloadStore = StructureStorage | StructureTerminal | StructureContainer;

const rewalker = defaultRewalker();

export class JobCreep extends MyCreep {
    get mission(): Mission {
        return Service.getType<Mission>(this.memory.mission)!; 
    }
    eggRun() {}

    // The room this creep calls home: the mission's "home" room, else its
    // "spawn" room, else the room of the spawn it came from (memory.nest,
    // "egg" until it hatches), else any spawn's room, picked at random (a
    // mission such as Once names neither; an egg then spawns anywhere and
    // the nest answers from then on).
    getHomeRoomName(): string {
        const mission = this.mission;
        const named = mission?.getRoomName("home") || mission?.getRoomName("spawn");
        if (named) return named;
        const nest = Game.spawns[this.memory.nest];
        if (nest) return nest.room.name;
        return _.sample(Game.spawns).room.name;
    }

    moveRoom(roomName: string = "", xy = 2525, range = 20): Task2Ret {
        return this.movePos(fromXY(xy, roomName || this.mission.roomName), range);
    }

    moveTargetRoom(target: HasPos | null): Task2Ret {
        if (!target) return "start";
        const x = this.pos.x;
        const y = this.pos.y;
        if (target.pos.roomName === this.pos.roomName) {
            if (x === 0) {
                this.moveDir(RIGHT);
            } else if (x === 49) {
                this.moveDir(LEFT);
            } else if (y === 0) {
                this.moveDir(BOTTOM);
            } else if (y === 49) {
                this.moveDir(TOP);
            }
            this.dlog('moveRoom done');
            return "start";
        }

        const ox = target.pos.x;
        const oy = target.pos.y;
        const range = Math.max(1, Math.min(ox, oy, 49 - ox, 49 - oy) - 1);
        return this.moveTarget(target, range);
    }

    moveDir(dir: DirectionConstant): Task2Ret {
        const ret = this.c.move(dir);
        if (ret === ERR_BUSY || ret === ERR_TIRED) {
            return "wait";
        }
        if (ret === OK) {
            return "wait";
        }
        return "start";
    }


    moveTarget(obj: HasPos, range: number): Task2Ret {
        return this.movePos(obj.pos, range);
    }

    movePos(pos: RoomPosition, range: number): Task2Ret {
        const ret = rewalker.walkTo(this.c, pos, range);
        if (ret === OK) return "start";
        return "wait";
    }

    walkRange(target: HasPos) {
        return rewalker.walkTo(this.c, target.pos, 3);
    }

    // Latch for unloadHome: true from the tick `begin` holds until the creep
    // is empty, so a partial transfer does not send it back half loaded.
    unloadLatch(begin: boolean): boolean {
        const mem = this.c.memory;
        if (!this.c.store.getUsedCapacity()) {
            delete mem.unload;
            delete mem.dropid;
            return false;
        }
        if (begin) mem.unload = true;
        return !!mem.unload;
    }

    // Carry everything to the home room: the storage, else the terminal,
    // else (a young room: RCL3 has neither) the home container with the most
    // free space, then the next, until empty. Walks straight to the chosen
    // store from wherever the creep is; without vision of home it walks into
    // the room first. null when home has nowhere to put it: the caller's
    // fallback. transfer() without an amount is ERR_FULL unless the whole
    // load fits, so every transfer passes what fits.
    unloadHome(homeName: string): Task2Ret | null {
        const home = Game.rooms[homeName];
        if (!home) return this.moveRoom(homeName);
        const dest = this.unloadStore(home);
        if (!dest) return null;
        if (!this.pos.isNearTo(dest)) return this.moveTarget(dest, 1);
        const c = this.c;
        const res = _.find(Object.keys(c.store) as ResourceConstant[], r => c.store[r] > 0);
        if (!res) return "wait";
        const free = dest.store.getFreeCapacity(res) || 0;
        const amount = Math.min(c.store[res], free);
        const err = c.transfer(dest, res, amount);
        if (err !== OK) this.log("transfer to", dest, "failed", err);
        // A container this fills is done with: pick the next one.
        if (dest.structureType === STRUCTURE_CONTAINER && amount >= free) delete c.memory.dropid;
        return "wait";
    }

    // Nowhere to unload: walk to within 3 of `ctrl` and drop what we carry
    // there, one resource per tick, until empty. Shared by Swiper.deliver
    // and Trucker (the pile then feeds Hub's pile upgraders).
    @task
    dropAt(ctrl: StructureController): Task2Ret {
        const c = this.c;
        const res = _.find(Object.keys(c.store) as ResourceConstant[], r => c.store[r] > 0);
        if (!res) return "start";
        if (this.walkRange(ctrl) !== OK) return "wait";
        c.drop(res);
        return "wait";
    }

    // The friendly to heal, or null when none in the room is hurt. Sticks to
    // the one picked before while it is still here and still hurt; otherwise
    // the most damaged within kHealRange, else the most damaged in the room.
    // Shared by Guard and Toxic.
    pickHurt(): Creep | null {
        const mem = this.c.memory;
        const kept = mem.healid && Game.getObjectById(mem.healid);
        if (kept && kept.pos.roomName === this.pos.roomName && kept.hits < kept.hitsMax) return kept;
        const hurt = this.c.room.find(FIND_MY_CREEPS).filter(f => f.hits < f.hitsMax);
        if (!hurt.length) {
            delete mem.healid;
            return null;
        }
        const near = hurt.filter(f => f.pos.inRangeTo(this.pos, kHealRange));
        const pick = _.max(near.length ? near : hurt, f => f.hitsMax - f.hits);
        mem.healid = pick.id;
        return pick;
    }

    // Where unloadHome carries to in `home`, or null (see unloadHome).
    unloadStore(home: Room): UnloadStore | null {
        for (const s of [home.storage, home.terminal]) {
            if (s?.my && s.store.getFreeCapacity() > 0) return s;
        }
        const mem = this.c.memory;
        const kept = mem.dropid && Game.getObjectById(mem.dropid);
        if (kept && kept.pos.roomName === home.name && kept.store.getFreeCapacity() > 0) return kept;
        const conts = (home.findStructs(STRUCTURE_CONTAINER) as StructureContainer[])
            .filter(k => k.store.getFreeCapacity() > 0);
        if (!conts.length) {
            delete mem.dropid;
            return null;
        }
        const cont = _.max(conts, k => k.store.getFreeCapacity());
        mem.dropid = cont.id;
        return cont;
    }

}