import { Mission } from "mission";
import { register, Priority } from "process";
import { Farmer } from "job.farmer";

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
        this.nJobs(Farmer, this.nFarmers);
        super.run();
        return "normal";
    }
}
