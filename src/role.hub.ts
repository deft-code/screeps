import { injecter } from "roomobj";
import { TaskRet } from "Tasker";
import { Link, Mode, hubNeed, storageBalance } from "struct.link";
import { CreepCarry } from "creep.carry";

// Non-energy stock the terminal is filled to from storage by the hub creep,
// and the per-resource ceiling: a resource is only moved while the terminal
// holds less than kTerminalPerResource of it.
const kTerminalMinerals = 150000;
const kTerminalPerResource = 5000;


@injecter(Creep)
export class CreepHub extends CreepCarry {
    roleHub(): TaskRet {
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
        // Minerals in hand go to the terminal before anything else.
        if (term && this.store.getUsedCapacity() > this.store.energy) {
            const res = _.find(Object.keys(this.store) as ResourceConstant[], r => r !== RESOURCE_ENERGY)!;
            return this.goTransfer(term, res, false);
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
            // Never drain a src link: we are the one filling it, so taking the
            // energy back just loops (W3N4, Sept 2026: hub link memoised as src
            // with no sink link, so hubNeed was 0 and this branch fired every tick).
            if (link && link.mode !== Mode.src && (
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

        if (!xfer && !wd && !this.intents.transfer && !this.intents.withdraw) {
            return this.withdrawMineral(store, term);
        }
        return false;
    }

    // Move non-energy stock from storage toward the terminal: only while the
    // terminal's non-energy total is under kTerminalMinerals, only resources it
    // holds less than kTerminalPerResource of, and only with an empty hand.
    withdrawMineral(store: StructureStorage | null, term: StructureTerminal | null): TaskRet {
        if (!store || !term || this.store.getUsedCapacity()) return false;
        const termMinerals = term.store.getUsedCapacity() - term.store.energy;
        if (termMinerals >= kTerminalMinerals) return false;
        const room = kTerminalMinerals - termMinerals;
        for (const res of Object.keys(store.store) as ResourceConstant[]) {
            if (res === RESOURCE_ENERGY || !store.store[res]) continue;
            const have = term.store[res] || 0;
            if (have >= kTerminalPerResource) continue;
            const amount = Math.min(store.store[res], kTerminalPerResource - have, room, this.store.getFreeCapacity());
            if (amount <= 0) continue;
            this.dlog('terminal minerals', res, amount);
            const err = this.withdraw(store, res, amount);
            if (err === OK) {
                this.intents.withdraw = store;
                return 'minerals';
            }
            this.dlog('mineral withdraw failed', err, res, amount);
            return false;
        }
        return false;
    }

    afterHub() {
        const p = this.teamRoom.getSpot(this.role);
        if (p?.isEqualTo(this.pos)) {
            this.idleImmortal();
            this.idleNom();
        } else {
            if (this.ticksToLive < 1400) this.log("not in position");
        }
    }
}