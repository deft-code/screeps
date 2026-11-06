import { JobCreep } from "job.creep";
import { register, Task2Ret } from "mycreep";
import { byValue, unitValue, Worth } from "swipeworth";
import type { Holder, InvaderCoreThree } from "ms.invadercorethree";

// Coresweeper: carries a beaten stronghold's loot home for the InvaderCore
// missions (ms.invadercorethree.ts). CARRY, MOVE x 25 (2500 energy, 1250
// carry) from the mission's home room, laid when the first loot is about
// to be reachable.
//
// The mission keeps track of what can be reached (openLoot: containers,
// ruins, tombstones and piles around the core's tile with no rampart over
// them). Each tick the sweeper takes, of everything open, the resource
// worth the most a unit (swipeworth.ts unitValue: the market's buy price,
// as the Swipe missions' value pick), the nearer holder on a tie, one
// resource a tick. Energy is left alone until nothing else is left in the
// stronghold, open or not, or the sweeper is within kEnergyLead ticks of
// leaving. With nothing open to take it waits by the mission's spot, unless
// it has a load and nothing is due to open within coreDist ticks
// (InvaderCoreThree.accessEta): then the load goes home meanwhile.
//
// coreDist is the mission's walk cost from home to the spot. Full, or
// loaded with fewer than coreDist + kMargin ticks to live (the user's
// rule is coreDist; the margin is the walk from the loot to the spot and
// the store at home), it carries the load home (JobCreep.unloadHome:
// storage, else terminal, else a container; dropped by the controller
// with nowhere to put it), latched until empty. Empty at home with fewer
// than 2 x coreDist ticks to live (no round trip left), or empty anywhere
// too old to bring a load back, it suicides. Once the mission sees nothing
// but energy left (lootLeft) a sweeper in the stronghold's room takes the
// energy that is open, then it unloads what it has and is recycled at its
// origin spawn.
const kUnits = 25;
const kMargin = 15;
const kEnergyLead = 50;
const kHoldRange = 2;

interface Take {
    holder: Holder
    res: ResourceConstant
}

@register
export class Coresweeper extends JobCreep {
    static readonly body: BodyPartConstant[] = _.flatten(_.times(kUnits, () => [CARRY, MOVE])) as BodyPartConstant[];

    static readonly cost = _.sum(Coresweeper.body, part => BODYPART_COST[part]);

    get coreMission(): InvaderCoreThree {
        return this.mission as unknown as InvaderCoreThree;
    }

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const spawn = this.readySpawn(spawns, Coresweeper.cost);
        return spawn ? [spawn, Coresweeper.body] : [null, []];
    }

    start(): Task2Ret {
        const m = this.coreMission;
        if (!m) return "wait";
        const c = this.c;
        const ttl = this.ticksToLive;
        const dist = m.coreDist;
        const home = this.homeName;
        const old = ttl < dist + kMargin;
        if (this.unloadLatch(!c.store.getFreeCapacity() || old)) return this.unload(home);
        // Empty from here on, or still loading.
        if (!c.store.getUsedCapacity() && (old || (this.pos.roomName === home && ttl < 2 * dist))) {
            this.log("empty with", ttl, "ticks left and the loot", dist, "away; suicide");
            c.suicide();
            return "wait";
        }
        // With nothing but energy left the mission is done: what is open is
        // taken only by a sweeper already there, never fetched from home.
        const left = m.lootLeft();
        const take = left || this.pos.roomName === m.roomName ? this.pick(ttl < dist + kEnergyLead || !left) : null;
        if (take) return this.fetch(take);
        if (!left) {
            if (this.unloadLatch(true)) return this.unload(home);
            return this.retire();
        }
        // Loot is left but none of it can be had yet. With a load aboard
        // and nothing due to open within a one-way trip, the load goes home
        // meanwhile (the first sweeper would have stood 400 ticks beside
        // the last rampart with the stronghold's muscle and tissue aboard).
        if (c.store.getUsedCapacity() && m.accessEta() > dist && this.unloadLatch(true)) return this.unload(home);
        // Else wait by the spot.
        const spot = m.spotPos;
        if (!spot) this.moveRoom(m.roomName);
        else if (!this.pos.inRangeTo(spot, kHoldRange)) this.movePos(spot, kHoldRange);
        return "wait";
    }

    // The most valuable resource a unit among the open loot (energy only
    // when `energy`), the nearer holder on a tie; null with nothing to take.
    pick(energy: boolean): Take | null {
        const worth: Worth = res => energy || res !== RESOURCE_ENERGY;
        let best: Take | null = null;
        let bestValue = -1;
        let bestRange = Infinity;
        for (const holder of this.coreMission.openLoot()) {
            const res = holder instanceof Resource
                ? (worth(holder.resourceType) ? holder.resourceType : undefined)
                : _.first(byValue(holder.store, worth));
            if (!res) continue;
            const value = unitValue(res);
            const range = this.pos.getRangeTo(holder);
            if (value > bestValue || (value === bestValue && range < bestRange)) {
                best = { holder, res };
                bestValue = value;
                bestRange = range;
            }
        }
        return best;
    }

    // Beside the holder, take the resource: as much as fits.
    fetch(take: Take): Task2Ret {
        const holder = take.holder;
        if (!this.pos.isNearTo(holder)) {
            this.moveTarget(holder, 1);
            return "wait";
        }
        const err = holder instanceof Resource ? this.pickup(holder) : this.withdraw(holder, take.res);
        if (err !== OK) this.log("taking", take.res, "at", holder.pos, "failed", err);
        return "wait";
    }

    // Everything to the home room's stores; dropped by the controller when
    // there is nowhere to put it.
    unload(homeName: string): Task2Ret {
        const ret = this.unloadHome(homeName);
        if (ret !== null) return ret;
        const ctrl = Game.rooms[homeName]?.controller;
        return ctrl ? this.dropAt(ctrl) : "wait";
    }

    // Nothing left to fetch: home, then recycled.
    retire(): Task2Ret {
        const homeName = this.homeName;
        if (this.pos.roomName !== homeName) return this.moveRoom(homeName);
        return this.recycleAt(this.originSpawn());
    }
}
