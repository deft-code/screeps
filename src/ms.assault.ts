import { Mission } from "mission";
import { register, Priority } from "process";
import { Scout } from "job.scout";
import { theRadar } from "radar";
import * as debug from "debug";

// Assault <room> <home>: look at a room and evolve into the assault mission
// that fits it. Vision through the radar (theRadar.observeNow each tick)
// while it has an observer, else a Scout from home. With the room in sight
// its hostile towers are counted and the mission evolves (Mission.evolve:
// the scout goes along) into the sibling for that count; a count with no
// sibling yet is logged every kLogPace ticks and the mission waits.
//
//   scheduleService('Assault W27S2 W27S4')   // args[1]=target, args[2]=home (spawns and labs)
//
// Siblings so far: AssaultTwo (ms.assaulttwo.ts) for two towers.
const kLogPace = 100;
const kSiblings: { [towers: number]: string } = {
    2: "AssaultTwo",
};

@register
export class Assault extends Mission {
    get roomName() {
        return this.args[1];
    }

    getRoomName(alias = "") {
        if (alias === "home" || alias === "spawn") return this.args[2] || null;
        return super.getRoomName(alias);
    }

    run(): Priority {
        if (this.windingDown) return super.run();
        const room = this.room;
        if (room) {
            const towers = room.find(FIND_HOSTILE_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }).length;
            const sibling = kSiblings[towers];
            if (sibling) {
                debug.log(this.name, this.roomName, "has", towers, "towers; evolving into", sibling);
                this.evolve(`${sibling} ${this.roomName} ${this.args[2] || ""}`.trim());
                return super.run();
            }
            if (Game.time % kLogPace === 0) debug.log(this.name, this.roomName, "has", towers, "towers; no sibling mission for that yet");
        }
        if (theRadar.observers.size) theRadar.observeNow(this.roomName);
        else if (!room) this.nJobs(Scout, 1);
        super.run();
        return "normal";
    }

    status(): string {
        const room = this.room;
        const towers = room ? room.find(FIND_HOSTILE_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }).length : "?";
        return super.status() + ` home:${this.args[2] || "-"} visible:${!!room} towers:${towers}`;
    }
}
