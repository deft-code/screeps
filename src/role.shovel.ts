import { injecter } from "roomobj";
import { TaskRet } from "Tasker";
import { Link, Mode, hubNeed, storageBalance } from "struct.link";
import { CreepCarry } from "creep.carry";
import { FactoryExtra } from "struct.factory";

@injecter(Creep)
export class CreepShovel extends CreepCarry {
    roleShovel(): TaskRet {
        if (this.moveSpot()) return 'moved';
        const spots = this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true);
        const structs = _.shuffle(_.map(spots, s => s[LOOK_STRUCTURES])) as (EnergyStruct | GeneralStoreStruct)[];
        let store: StructureStorage | null = null;
        let term: StructureTerminal | null = null;
        let estruct: EnergyStruct | StructureFactory | null = null;
        let pspawn: StructurePowerSpawn | null = null;
        let fact: StructureFactory | null = null;
        for (const struct of structs) {
            switch (struct.structureType) {
                case STRUCTURE_FACTORY:
                    fact = struct;
                    if (estruct) break
                    if (struct.store.getUsedCapacity(RESOURCE_ENERGY) <= FACTORY_CAPACITY / 5 && struct.store.getFreeCapacity()) estruct = struct
                    break
                case STRUCTURE_POWER_SPAWN:
                    pspawn = struct;
                    if (estruct) break
                    if (struct.store.getFreeCapacity(RESOURCE_ENERGY) >= this.store.getCapacity()) estruct = struct
                    break
                case STRUCTURE_TOWER:
                    if (estruct) break
                    if (struct.store.getFreeCapacity(RESOURCE_ENERGY) >= 200) estruct = struct
                    break
                case STRUCTURE_SPAWN:
                    if (struct.store.getFreeCapacity(RESOURCE_ENERGY)) estruct = struct
                    break
                case STRUCTURE_STORAGE:
                    store = struct; break;
                case STRUCTURE_TERMINAL:
                    term = struct; break
            }
        }

        if (pspawn && pspawn.store.getUsedCapacity(RESOURCE_POWER) < 10) {
            if (this.store[RESOURCE_POWER]) {
                return this.doTransfer(pspawn, RESOURCE_POWER);
            } else if (this.store.getFreeCapacity()) {
                if (store && store.store[RESOURCE_POWER]) {
                    return this.doWithdraw(store, RESOURCE_POWER);
                } else if (term && term.store[RESOURCE_POWER]) {
                    return this.doWithdraw(term, RESOURCE_POWER);
                }
            }
        }

        if(this.store[RESOURCE_POWER]) {
            return this.doTransfer(term!, RESOURCE_POWER) || this.doTransfer(store!, RESOURCE_POWER);
        }

        let what = this.doFact(fact as FactoryExtra, term, store);
        if (what) return what;

        if (this.store.getUsedCapacity() > this.store[RESOURCE_ENERGY]) {
            const extra = _.sample(_.keys(this.store) as ResourceConstant[]);
            return this.doTransfer(term!, extra) || this.doTransfer(store!, extra);
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

        let [batt, sink, activeBalance] = storageBalance(store, term);

        if (sink && !sink.store.getFreeCapacity()) return false;

        if (!sink || !batt) return false;

        if (!xfer && this.store.energy) {
            this.goTransfer(sink, RESOURCE_ENERGY, false);
        }

        let wd: TaskRet = false;
        if (this.store.getFreeCapacity()) {
            if (!wd && (needE || (activeBalance && this.store.getUsedCapacity() === 0))) {
                wd = this.goWithdraw(batt, RESOURCE_ENERGY, false);
            }
            if (!wd && fact) {
                for (const r of fact.unloads) {
                    if (fact.store[r]) {
                        wd = this.doWithdraw(fact, r);
                    }
                }
            }
        }
        return false;
    }

    doFact(f: FactoryExtra | null, t: StructureTerminal | null, s: StructureStorage | null): TaskRet {
        if (!f) return false;
        const needs = f.needs(RESOURCE_ALLOY);
        for (let need in needs) {
            const r = need as ResourceConstant;
            if (needs[r] > 0) continue;
            delete needs[r];
        }
        for (let need in needs) {

            const r = need as ResourceConstant;
            if (this.store[r]) {
                return this.doTransfer(f, r);
            }
        }
        if (!this.store.getFreeCapacity()) return false;
        if (s) {
            for (let need in needs) {
                const r = need as ResourceConstant;
                if (s.store[r]) {
                    return this.doWithdraw(s, r);
                }
            }
        }
        if (t) {
            for (let need in needs) {
                const r = need as ResourceConstant;
                if (t.store[r]) {
                    return this.doWithdraw(t, r);
                }
            }
        }
        return false;
    }

    afterShovel() {
        const p = this.teamRoom.getSpot(this.role);
        if (p?.isEqualTo(this.pos)) {
            this.idleImmortal();
            this.idleNom();
        } else {
            if (this.ticksToLive < 1400) this.log("not in position");
        }
    }
}