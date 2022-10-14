
import { register, MyCreep } from "mycreep";
import { energyDef } from "spawn";

@register
export class Startup extends MyCreep {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const spawn = Game.spawns.Spawn1;
        const energy = spawn.room.energyAvailable;
        let body;
        switch (energy) {
            case 300: {
                const mod = Game.time % 3;
                if(mod === 0) {
                    body = [WORK, WORK, CARRY, MOVE];
                } else if(mod === 1) {
                    body = [WORK, CARRY, MOVE, MOVE];
                } else {
                    body = [WORK, CARRY, CARRY, MOVE, MOVE];
                }
                break;
            }
            case 350: body = [WORK, WORK, CARRY, MOVE, MOVE]; break;
            case 400:
            case 450: body = [WORK, WORK, CARRY, CARRY, MOVE, MOVE]; break;
            case 500: body = [WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE]; break;
            case 550: body = [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE]; break;
            default:
                body = energyDef({
                    move: 2,
                    base: [MOVE, CARRY],
                    per: [WORK, CARRY],
                    energy: spawn.room.energyAvailable
                });
                break;
        }
        return [spawn, body];
    }

    run(): boolean {
        if (!this.c) {
            return false;
        }
        this.c.run();
        this.c.after();
        return true;
    }
}