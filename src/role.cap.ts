import { injecter } from "roomobj";
import { CreepCarry } from "creep.carry";

@injecter(Creep)
export class CapRole extends CreepCarry {
    roleCap() {
        if (this.moveSpot()) return 'moved';
        return false;
    }
}