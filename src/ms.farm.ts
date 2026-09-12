import { Mission } from "mission";
import { register, Priority } from "process";
import { Farmer } from "job.farmer";
import { Scout } from "job.scout";
import { Wolf } from "job.wolf";

// Schedule from the console:
//   require('process').Service.schedule('Farm W5N8 W6N8')     // args[1]=farm room, args[2]=home room
//   require('process').Service.schedule('Farm W5N8 W6N8 2')   // optional args[3]=number of farmers (default 1)
@register
export class Farm extends Mission {
    get roomName() {
        return this.args[1];
    }

    getRoomName(alias = "") {
        if (alias === "home") return this.args[2];
        return super.getRoomName(alias);
    }

    get nFarmers() {
        return Number(this.args[3]) || 1;
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        if (!this.room) {
            // No visibility: a scout keeps intel flowing until a farmer arrives.
            this.nJobs(Scout, 1);
        } else {
            this.suppressInvaderCore();
        }
        this.nJobs(Farmer, this.nFarmers);
        super.run();
        return "normal";
    }

    // team.ts suppressInvaderCore: while an invader core stands in the farm
    // room, lay one wolf at most every 1500 ticks.
    suppressInvaderCore() {
        if (!this.room!.findStructs(STRUCTURE_INVADER_CORE).length) return null;
        return this.paceJobs(Wolf, 1500);
    }
}
