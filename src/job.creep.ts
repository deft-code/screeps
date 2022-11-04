import { Mission } from "mission";
import { MyCreep } from "mycreep";
import { Service } from "process";

export class JobCreep extends MyCreep {
    get mission(): Mission {
        return Service.getType<Mission>(this.memory.mission)!; 
    }
    eggRun() {}
}