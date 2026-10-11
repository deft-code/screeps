import { JobCreep } from "job.creep";
import { CreepCarry } from "creep.carry";
import { register, Task2Ret } from "mycreep";
import { closeSpawns } from "spawnold";
import { roomCenterPos } from "intel";
import { fleeKeepers } from "job.skharvester";
import type { SkFarm } from "ms.skfarm";

// The SK farm's hauler (ms.skfarm.ts): carries the energy the Skharvesters
// drop-mine into their containers home. Body [CARRY, MOVE] x 25 (2500
// energy, 1250 carry), spawned in the mission's home room (else the spawns
// nearest the mission room), only with the whole cost in hand. SkFarm paces
// as many as there are containers holding at least 500 energy.
//
// Each tick, in order:
//   flee    the keeper rules shared with Skharvester (fleeKeepers): a keeper
//           within 5, or a lair within 5 about to spawn one, is fled to 6;
//           at 6 it holds still.
//   home    full, or under kRetireTTL ticks to live with a load: carry it
//           home (JobCreep.unloadHome; dropped at the controller when home
//           has no store), latched by memory.unload until empty. Empty and
//           too old for another trip it waits in the home room.
//   fetch   walk beside the farm container with the most energy and
//           withdraw what fits. None with energy: wait within kCenterRange
//           of the room centre.
// After all of that, outside the home room, idleNom takes whatever energy
// lies within reach (after()). It walks with memory.rewalksk set.

const kRetireTTL = 50;
const kCenterRange = 3;
const kUnits = 25;

@register
export class Sktrucker extends JobCreep {
    static readonly body: BodyPartConstant[] = _.flatten(_.times(kUnits, () => [CARRY, MOVE])) as BodyPartConstant[];

    static readonly cost = _.sum(Sktrucker.body, part => BODYPART_COST[part]);

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const home = this.mission.getRoomName("home");
        const pool = home
            ? spawns.filter(s => s.room.name === home)
            : closeSpawns(spawns, this.mission.roomName) as StructureSpawn[];
        const ready = pool.filter(s => !s.spawning && s.room.energyAvailable >= Sktrucker.cost);
        if (!ready.length) return [null, []];
        return [_.sample(ready), Sktrucker.body];
    }

    get cc(): CreepCarry {
        return this.c as CreepCarry;
    }

    get farm(): SkFarm {
        return this.mission as SkFarm;
    }

    init(): boolean {
        if (!this.memory.rewalksk) this.memory.rewalksk = true;
        return true;
    }

    get full(): boolean {
        return this.c.store.getFreeCapacity() === 0;
    }

    get carrying(): number {
        return this.c.store.getUsedCapacity();
    }

    start(): Task2Ret {
        if (fleeKeepers(this.cc)) return "wait";

        const old = this.ticksToLive < kRetireTTL;
        if (this.unloadLatch(this.full || (old && this.carrying > 0))) return this.goHome();
        if (old) return this.retire();

        const cont = _.max(this.farm.containers(), k => k.store.energy) as StructureContainer | number;
        if (!(cont instanceof StructureContainer) || !cont.store.energy) {
            if (this.pos.roomName !== this.mission.roomName) return this.moveRoom(this.mission.roomName);
            const center = roomCenterPos(this.mission.roomName);
            if (!this.pos.inRangeTo(center, kCenterRange)) this.movePos(center, kCenterRange);
            return "wait";
        }
        if (!this.pos.isNearTo(cont)) {
            this.moveTarget(cont, 1);
            return "wait";
        }
        const amount = Math.min(cont.store.energy, this.c.store.getFreeCapacity());
        const err = this.c.withdraw(cont, RESOURCE_ENERGY, amount);
        if (err !== OK) this.log("withdraw from", cont, "failed", err);
        return "wait";
    }

    goHome(): Task2Ret {
        const homeName = this.homeName;
        const ret = this.unloadHome(homeName);
        if (ret !== null) return ret;
        const ctrl = Game.rooms[homeName]?.controller;
        if (ctrl) return this.dropAt(ctrl);
        this.log("nowhere to unload in", homeName);
        return "wait";
    }

    retire(): Task2Ret {
        const homeName = this.homeName;
        if (this.pos.roomName !== homeName) return this.moveRoom(homeName);
        const center = roomCenterPos(homeName);
        if (!this.pos.inRangeTo(center, kCenterRange)) this.movePos(center, kCenterRange);
        return "wait";
    }

    after() {
        if (!this.c || this.pos.roomName === this.homeName) return;
        this.cc.idleNom();
    }
}
