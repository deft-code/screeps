import { injecter } from "roomobj";
import { TaskRet } from "Tasker";
import { Link, Mode, hubNeed, storageBalance } from "struct.link";
import { CreepCarry } from "creep.carry";

// The hub creep stands on the hub spot and shuttles between the storage,
// terminal, hub link and the spawn or tower beside it. roleHub is a ladder
// of rungs run top to bottom every tick, no memory but fillTerminal: a
// transfer side (minerals in hand, then energy to spawn/tower, link, sink)
// and a withdraw side (link, battery, terminal drain, storage minerals).
// The engine lets one transfer and one withdraw land in the same tick
// (processed transfer first), but the API caps the withdraw at the free
// space the creep had at the start of the tick, so a full hand transfers
// this tick and withdraws the next.
//
// TODO (Oct 2026): the ladder still mixes the two sides (xfer, wd and needE
// feed later rungs, the mineral-in-hand rung returns before the withdraw
// side runs, and the two early returns below storageBalance skip every rung
// under them, so a terminal at its 300k capacity while it is the energy sink
// freezes the hub). The refactor into a snapshot plus two chains of named
// rungs is planned in docs/hub-design.md.

// Non-energy stock the terminal is filled to from storage by the hub creep,
// and the per-resource ceiling: a resource is only moved while the terminal
// holds less than kTerminalPerResource of it, and never while the terminal
// is past kTerminalOverfull (the drain below would pull it straight back).
const kTerminalMinerals = 150000;
const kTerminalPerResource = 5000;
// Terminal total (energy included) past which a mineral in hand goes to the
// storage instead of the terminal, and past which the withdraw side's last
// rung pulls the terminal's largest mineral stock out for the storage. The
// gap between them is the hysteresis: what the drain pulls out still goes to
// the storage once the terminal has dropped back under kTerminalDrain.
const kTerminalOverfull = 180000;
const kTerminalDrain = 185000;

declare global {
    interface CreepMemory {
        // Hub override: fill the terminal with energy from storage until it
        // holds this much, ignoring storageBalance's ratios (set from the
        // console, e.g. for a room being drained: Memory.creeps.hub1.fillTerminal = 50000).
        fillTerminal?: number
    }
}


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
        // Minerals in hand go to the terminal before anything else, or to the
        // storage while the terminal is past kTerminalOverfull and the storage
        // beside us has room.
        const mineral = _.find(Object.keys(this.store) as ResourceConstant[], r => r !== RESOURCE_ENERGY && this.store[r] > 0);
        if (mineral) {
            const overfull = term && term.store.getUsedCapacity() > kTerminalOverfull;
            const dest = overfull && store?.store.getFreeCapacity() ? store : term;
            if (dest) return this.goTransfer(dest, mineral, false);
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
        const fill = this.memory.fillTerminal;
        if (fill && store && term && term.store.energy < fill && store.store.energy) {
            [batt, sink, activeBalance] = [store, term, true];
        }

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

            // Bottom rung of the withdraw side: drain an overfull terminal.
            if (!wd && term && term.store.getUsedCapacity() > kTerminalDrain) {
                wd = wd || this.withdrawTerminalMineral(term);
            }
        }

        if (!xfer && !wd && this.intents.canTransfer() && this.intents.canWithdraw()) {
            return this.withdrawMineral(store, term);
        }
        return false;
    }

    // Move non-energy stock from storage toward the terminal: only while the
    // terminal's non-energy total is under kTerminalMinerals, only resources it
    // holds less than kTerminalPerResource of, and only with an empty hand.
    withdrawMineral(store: StructureStorage | null, term: StructureTerminal | null): TaskRet {
        if (!store || !term || this.store.getUsedCapacity()) return false;
        if (term.store.getUsedCapacity() > kTerminalOverfull) return false;
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
                this.intents.setWithdraw(store);
                return 'minerals';
            }
            this.dlog('mineral withdraw failed', err, res, amount);
            return false;
        }
        return false;
    }

    // Take a hand's worth of the mineral the terminal holds the most of
    // (energy and thorium aside: the terminal is where ReactorDepot reads
    // thorium and the warrunners load it, and Balance ships every room's
    // there), for the storage: the mineral-in-hand rung carries it there
    // while the terminal is past kTerminalOverfull. Only called past
    // kTerminalDrain, with free space in hand.
    withdrawTerminalMineral(term: StructureTerminal): TaskRet {
        const minerals = (Object.keys(term.store) as ResourceConstant[]).filter(r => r !== RESOURCE_ENERGY && r !== RESOURCE_THORIUM && term.store[r] > 0);
        if (!minerals.length) return false;
        const res = _.max(minerals, r => term.store[r]);
        const amount = Math.min(term.store[res], this.store.getFreeCapacity());
        if (amount <= 0) return false;
        this.dlog('terminal drain', res, amount);
        const err = this.withdraw(term, res, amount);
        if (err === OK) {
            this.intents.setWithdraw(term);
            return 'drain';
        }
        this.dlog('terminal drain failed', err, res, amount);
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