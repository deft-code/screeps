import { extender } from "roomobj";

type Need = Record<ResourceConstant, number>;

@extender
export class FactoryExtra extends StructureFactory {
    needs(orig: ResourceConstant): Need {
        const need = {} as Need;
        for (let key in this.store) {
            const r = key as ResourceConstant;
            need[r] = -this.store[r];
        }
        return this.newNeeds(need, orig);
    }

    newNeeds(need: Need, orig: ResourceConstant): Need {
        let set = new Set<ResourceConstant>();
        let queue = [orig];
        while (queue.length > 0) {
            const r = queue.pop()!;

            const c = COMMODITIES[r as RESOURCE_ALLOY];
            if (!c) continue;

            if (set.has(r)) continue;
            set.add(r);

            const comps = c.components;
            for (let k in comps) {
                const r = k as keyof typeof comps;
                if (!need[r]) {
                    need[r] = comps[r];
                } else {
                    need[r] += comps[r];
                }
                if (need[r] > 0) {
                    queue.push(r);
                }
            }
        }
        return need;
    }

    get unloads() {
        return [RESOURCE_ALLOY];
    }

    doProduce(rec: CommodityConstant) {
        let ret = this.produce(rec);
        // this.room.log("Production:", ret, rec);
        if (ret === OK) return true;

        if (ret === ERR_NOT_ENOUGH_RESOURCES) {
            const needs = this.needs(rec);
            this.room.log("needs:", JSON.stringify(needs));
            for (const key in needs) {
                const r = key as CommodityConstant;
                // this.room.log("subproducing", r, this.store[r], 'vs', needs[r]);
                if (needs[r] <= 0) continue;
                ret = this.produce(r);
                // this.room.log("Sub production:", ret, r, ERR_NOT_ENOUGH_RESOURCES);
                if (ret === ERR_NOT_ENOUGH_RESOURCES) {
                    this.room.terminal?.requestMineral(r) || this.room.terminal?.autoBuy(r);
                    continue;
                }
                return ret === OK;
            }
        }

        return false;
    }
}

export function runFactory(room: Room) {
    const fact = _.first(room.findStructs(STRUCTURE_FACTORY)) as FactoryExtra;
    if (!fact || fact.cooldown) return false;

    const term = room.terminal;
    if (term && term.store[RESOURCE_ALLOY] < 1000 && fact.store[RESOURCE_ALLOY] < 1000) {
        return fact.doProduce(RESOURCE_ALLOY);
    }
    return false;


}