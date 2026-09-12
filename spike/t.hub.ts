// Spike conversion of src/role.hub.ts + src/job.hub.ts into one wrapper class.
//
// The behaviour bodies are verbatim copies; only the entry points changed:
// roleHub() -> shuttle() called from start(), afterHub() -> after().
import { register, MyCreep, Task2Ret } from "t.mycreep";
import { TaskRet } from "Tasker";
import { Link, Mode, hubNeed, storageBalance } from "struct.link";

@register
export class Hub extends MyCreep {
    // job.hub.ts
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const room = this.mission && this.mission.room;
        if (!room || !room.storage || !room.meta.getSpot('hub')) {
            return [null, []];
        }
        return this.localSpawn(spawns, {});
    }

    // The hub is stationary and re-decides every tick, so every exit is "wait".
    start(): Task2Ret {
        this.shuttle();
        return "wait";
    }

    // role.hub.ts roleHub()
    shuttle(): TaskRet {
        if (this.moveSpot()) return 'moved';
        const spots = this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true);
        const structs = _.shuffle(_.map(spots, s => s[LOOK_STRUCTURES])) as (EnergyStruct | GeneralStoreStruct)[];
        let store: StructureStorage | null = null;
        let term: StructureTerminal | null = null;
        let link: Link | null = null;
        let estruct: EnergyStruct | null = null;
        for (const struct of structs) {
            switch (struct.structureType) {
                case STRUCTURE_TOWER:
                    if (estruct) break
                    if (struct.store.getFreeCapacity(RESOURCE_ENERGY) >= 200) estruct = struct
                    break
                case STRUCTURE_SPAWN:
                    if (struct.store.getFreeCapacity(RESOURCE_ENERGY)) estruct = struct
                    break
                case STRUCTURE_LINK:
                    link = struct as Link;
                    break
                case STRUCTURE_STORAGE:
                    store = struct; break;
                case STRUCTURE_TERMINAL:
                    term = struct; break
            }
        }
        let needE = false;
        let xfer: TaskRet = false;

        if (estruct) {
            if (this.store.energy) {
                this.dlog('fill energy', estruct);
                xfer = xfer || this.goTransfer(estruct, RESOURCE_ENERGY, false);
            } else {
                needE = true;
            }
        }

        const hubTarget = hubNeed(this.room);

        if (!xfer && link && (
            (link.mode === Mode.src && link.store.getFreeCapacity(RESOURCE_ENERGY)) ||
            (link.mode == Mode.hub && link.cooldown < 2 && hubTarget > 200))) {
            if (this.store.energy) {
                xfer = xfer || this.goTransfer(link, RESOURCE_ENERGY, false);
            } else {
                needE = true;
            }
        }

        let [batt, sink, activeBalance] = storageBalance(store, term);

        if (sink && !sink.store.getFreeCapacity()) return false;

        if (!sink || !batt) return false;

        if (!xfer && this.store.energy) {
            this.goTransfer(sink, RESOURCE_ENERGY, false);
        }

        let wd: TaskRet = false;
        if (this.store.getFreeCapacity()) {
            if (link && (
                (link.mode === Mode.sink && link.store.energy) ||
                link.cooldown > 10 ||
                hubTarget < 200 ||
                link.store.energy - this.store.getFreeCapacity() > hubTarget)) {

                wd = wd || this.goWithdraw(link, RESOURCE_ENERGY, false);
            }

            if (!wd && (needE || (activeBalance && this.store.getUsedCapacity() === 0))) {
                wd = wd || this.goWithdraw(batt, RESOURCE_ENERGY, false);
            }
        }

        return false;
    }

    // role.hub.ts afterHub()
    after() {
        const p = this.teamRoom.getSpot(this.role);
        if (p?.isEqualTo(this.pos)) {
            this.idleImmortal();
            this.idleNom();
        } else {
            if (this.ticksToLive < 1400) this.log("not in position");
        }
    }
}
