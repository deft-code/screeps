import { Sktrucker } from "job.sktrucker";
import { register, Task2Ret } from "mycreep";
import { dodgeKeepers } from "job.skharvester";
import type { Loot } from "ms.loot";

// Empties the containers for the Loot mission (ms.loot.ts): a Sktrucker
// (job.sktrucker.ts, CARRY, MOVE x 25 from the home room) pointed at the
// mission room's uncovered containers (Loot.openContainers) and taking
// every resource they hold, not just energy: the fullest container first,
// its largest stack each tick. Full, or old with a load, it carries the
// lot home (unloadHome: storage, else terminal, else a container); empty in
// the home room under kRetireTTL ticks to live it hands its body back at
// its origin spawn (recycleAt). Keepers are fled (dodgeKeepers: no holding
// at range 6, it is passing through); invader creeps are ignored, the
// stronghold's leftover defenders hold their ramparts.
// idleNom (after()) still picks up energy within reach on the way.
const kRetireTTL = 100;

@register
export class Looter extends Sktrucker {
    get loot(): Loot {
        return this.mission as Loot;
    }

    get retireTTL(): number {
        return kRetireTTL;
    }

    flee(): boolean {
        return dodgeKeepers(this.cc);
    }

    get containers(): StructureContainer[] {
        return this.loot.openContainers();
    }

    // Everything a container holds counts.
    loadOf(cont: StructureContainer): number {
        return cont.store.getUsedCapacity();
    }

    // Beside the container, take its largest stack, as much as fits.
    fetch(cont: StructureContainer): Task2Ret {
        if (!this.pos.isNearTo(cont)) {
            this.moveTarget(cont, 1);
            return "wait";
        }
        const held = (Object.keys(cont.store) as ResourceConstant[]).filter(r => cont.store[r] > 0);
        const res = _.max(held, r => cont.store[r]) as ResourceConstant | number;
        if (typeof res !== "string") return "wait";
        const amount = Math.min(cont.store[res], this.c.store.getFreeCapacity());
        const err = this.c.withdraw(cont, res, amount);
        if (err !== OK) this.log("withdraw", res, "from", cont, "failed", err);
        return "wait";
    }

    // Empty and too old for another trip: home, then recycled.
    retire(): Task2Ret {
        const homeName = this.homeName;
        if (this.pos.roomName !== homeName) return this.moveRoom(homeName);
        return this.recycleAt(this.originSpawn());
    }
}
