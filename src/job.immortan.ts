import { JobRole } from "job.role";
import { register, task, Task2Ret } from "mycreep";
import { findReactors } from "reactor";



// quotes to add later:
// Mediocre!
// You were chosen.
// You are awaited.

// Warboy quotes
// Witness Me!
// I live, I die, I live again!
// Oh what a day, what a lovely day!


declare global {
    interface Creep {
        // Season 11 seasonal server only.
        claimReactor(target: ReactorObject): ScreepsReturnCode
    }
    interface CreepMemory {
        // Immortan.report: last "intent:code" logged, to avoid a line per tick.
        lastIntent?: string
    }
}

// Season 11 reactor reserver (the warlord the warboys feed). Spawns a
// "reserver" body in the Reactor mission's "home" room, walks to the sector
// core and reserves the reactor when nobody holds it. Unlike Reserver this
// targets a Reactor room object, not a controller; see ms.reactor.ts for the
// object's shape.
@register
export class Immortan extends JobRole {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const homeName = this.mission.getRoomName("home");
        if (!homeName) return [null, []];
        const homeSpawns = spawns.filter(s => s.room.name === homeName);
        if (!homeSpawns.length) return [null, []];
        // body key "reserver" in spawnold.buildBody: 1 MOVE per CLAIM, needs >= 650 energy available
        return this.localSpawn(homeSpawns, { spawn: homeName, body: "reserver" });
    }

    start(): Task2Ret {
        if (this.pos.roomName !== this.mission.roomName) {
            return this.moveRoom(this.mission.roomName);
        }
        const reactor = findReactors(this.c.room)[0];
        if (!reactor) {
            this.log("no reactor in", this.mission.roomName);
            return "wait";
        }
        return this.reserve(reactor);
    }

    // Creep.prototype.claimReactor (seasonal server): needs a live CLAIM part,
    // a Reactor target and range 1. The client stub does no owner check, so
    // whether an owned reactor can be taken over shows up only in the return
    // code; report() logs it.
    @task
    reserve(reactor: ReactorObject): Task2Ret {
        if (reactor.pos.roomName !== this.pos.roomName) return "start";
        if (!this.pos.isNearTo(reactor)) {
            this.moveTarget(reactor, 1);
            return "wait";
        }
        // Ownership can be taken by anyone; sit here and re-claim the tick it goes.
        if (reactor.my) return "wait";
        this.report("claimReactor", this.c.claimReactor(reactor), reactor);
        return "wait";
    }

    // Log once per distinct (intent, code) so the console shows what happened
    // without a line every tick.
    report(intent: string, err: number, reactor: ReactorObject) {
        const seen = `${intent}:${err}`;
        if (this.memory.lastIntent === seen) return;
        this.memory.lastIntent = seen;
        this.log(intent, "->", err, "owner:", reactor.owner?.username, "my:", reactor.my, "work:", reactor.continuousWork);
    }
}
