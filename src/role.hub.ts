import { extender, injecter } from "roomobj";
import { TaskRet } from "Tasker";
import { Link, Mode } from "struct.link";
import { CreepMove } from "creep.move";
import { CreepCarry } from "creep.carry";

function ratio(s: StructureStorage | StructureTerminal) {
    if (s.storeCapacity === 0) return 10;
    if (s.structureType === STRUCTURE_TERMINAL) {
        return s.store.energy * 3 / s.storeCapacity;
    }
    return s.store.energy / s.storeCapacity;
}

@injecter(Creep)
class CreepHub extends CreepCarry {
    roleHub(): TaskRet {
        if (this.moveSpot()) return 'moved';
        const spots = this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true);
        const structs = _.shuffle(_.map(spots, s => s[LOOK_STRUCTURES])) as (EnergyStruct | StoreStructure)[];
        let store: StructureStorage | null = null;
        let term: StructureTerminal | null = null;
        let link: Link | null = null;
        let estruct: EnergyStruct | null = null;
        for (const struct of structs) {
            switch (struct.structureType) {
                case STRUCTURE_TOWER:
                    if (estruct) break
                    if (struct.energyFree >= 200) estruct = struct
                    break
                case STRUCTURE_SPAWN:
                    if (struct.energyFree) estruct = struct
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
            if (this.carry.energy) {
                xfer = xfer || this.goTransfer(estruct, RESOURCE_ENERGY, false);
            } else {
                needE = true;
            }
        }

        if (!xfer && link && link.mode === Mode.src && link.energyFree) {
            if (this.carry.energy) {
                xfer = xfer || this.goTransfer(link, RESOURCE_ENERGY, false);
            } else {
                needE = true;
            }
        }

        let batt: StoreStructure | null = null;
        let sink: StoreStructure | null = null;
        if (store) {
            batt = store;
            sink = store;
            const srat = ratio(store);
            if (term) {
                const trat = ratio(term);

                if (trat > srat) {
                    batt = term;
                }
                if (trat < srat) {
                    sink = term;
                }
            }
        } else if (term) {
            batt = term;
            sink = term;
        }

        if (sink && !sink.storeFree) return false;

        if (!sink || !batt) return false;

        if (!xfer && this.carry.energy) {
            this.goTransfer(sink, RESOURCE_ENERGY, false);
        }

        let wd: TaskRet = false;
        if (this.carryFree) {
            if (link && ((link.mode === Mode.sink && link.energy) || link.cooldown > 10)) {
                wd = wd || this.goWithdraw(link, RESOURCE_ENERGY, false);
            }

            const brat = ratio(batt);
            const krat = ratio(sink);

            //this.log('wd', wd, 'brat', batt, brat, "krat", sink, krat);

            if (!wd && (needE || (brat - krat > 0.1 && this.carryTotal === 0))) {
                wd = wd || this.goWithdraw(batt, RESOURCE_ENERGY, false);
            }
        }

        return false;
    }
}