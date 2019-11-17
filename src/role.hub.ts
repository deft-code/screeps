import { injecter } from "roomobj";
import { TaskRet } from "Tasker";
import { Link, Mode, hubNeed, storageBalance } from "struct.link";
import { CreepCarry } from "creep.carry";


@injecter(Creep)
class CreepHub extends CreepCarry {
    roleHub(): TaskRet {
        if (this.moveSpot()) return 'moved';
        const spots = this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true);
        const structs = _.shuffle(_.map(spots, s => s[LOOK_STRUCTURES])) as (EnergyStruct | GenericStoreStructure)[];
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

        if (!xfer && link && (
            (link.mode === Mode.src && link.store.getFreeCapacity(RESOURCE_ENERGY)) ||
            (link.mode == Mode.hub && link.cooldown < 2 && hubNeed(this.room) > 100))) {
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
            if (link && ((link.mode === Mode.sink && link.store.energy) || link.cooldown > 10)) {
                wd = wd || this.goWithdraw(link, RESOURCE_ENERGY, false);
            }

            if (!wd && (needE || (activeBalance && this.store.getUsedCapacity() === 0))) {
                wd = wd || this.goWithdraw(batt, RESOURCE_ENERGY, false);
            }
        }

        return false;
    }
}