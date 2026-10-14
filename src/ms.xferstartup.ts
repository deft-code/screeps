import { register } from "process";
import { Xfer } from "ms.xfer";

// Feed a young room's storage from an established one until it can take
// terminal shipments instead.
//
//   scheduleService('XferStartup W24S7 W26S8')     // args[1]=room to fill, args[2]=room to take from ("home")
//   scheduleService('XferStartup W24S7 W26S8 3')   // optional args[3]=fedexes per lifetime (default 2)
//
// An Xfer (ms.xfer.ts, fedexes from the home room's spawns, paceNJobs at
// args[3] per lifetime) with different gates: eggs are laid only while the
// mission room has a storage of ours in sight holding less energy than the
// home storage (no storage, or no vision, lays nothing; Xfer's 50k home
// floor and 75% destination fill do not apply), and it winds down once the
// mission room has a terminal of ours.
@register
export class XferStartup extends Xfer {
    // Energy in the mission room's storage; null without vision or a
    // storage of ours there.
    get destEnergy(): number | null {
        const storage = this.room?.storage;
        if (!storage || !storage.my) return null;
        return storage.store.energy;
    }

    get finished(): string | null {
        const terminal = this.room?.terminal;
        if (terminal?.my) return `${this.roomName} has a terminal`;
        return null;
    }

    get holding(): string | null {
        const dest = this.destEnergy;
        if (dest === null) return `no storage of ours in ${this.roomName}`;
        const home = this.homeEnergy;
        if (home === null) return `no vision of ${this.homeName}`;
        if (home <= dest) return `${this.homeName} storage ${home} is not above ${this.roomName} storage ${dest}`;
        return null;
    }

    status(): string {
        return super.status() + ` destEnergy:${this.destEnergy ?? "-"} holding:${this.holding || "no"}`;
    }
}
