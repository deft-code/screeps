import { JobCreep } from "job.creep";
import { register, Task2Ret } from "mycreep";
import { findReactors } from "reactor";
import { roomKind, Kind, roomCenterPos } from "intel";
import type { StealReactor } from "ms.stealreactor";

// Reactor thief for the StealReactor mission (ms.stealreactor.ts): the
// Immortan body ([MOVE x5, CLAIM], 850, spawnold's "immortan") from the
// mission's home room with the whole cost in hand, else the spawns nearest
// the target. A CLAIM part caps it at 600 ticks to live, so it goes
// straight there: walks to the mission room, up to its reactor and
// claimReactors it, logging each distinct return code (report), until the
// reactor reads `my` (memory.usurp "claim"). Then it is done with the
// reactor and goes to die out of the way: it picks a keeper room next door
// (memory.grave, the first exit that is Kind.SourceKeeper), walks there
// with the Rewalker's keeper layer off (memory.rewalksk) and up to the
// nearest Source Keeper (memory.usurp "die"), which ends it.
//
// The mission watches it for the pathing bugs a 10-room walk through
// keeper rooms may turn up; status() shows where it is.
const kUnits = 5;

declare global {
    interface CreepMemory {
        // Usurper: claiming the reactor, or walking to its death.
        usurp?: "claim" | "die"
        // Usurper: the keeper room it dies in.
        grave?: string
    }
}

@register
export class Usurper extends JobCreep {
    static readonly body: BodyPartConstant[] = [..._.times(kUnits, () => MOVE), CLAIM] as BodyPartConstant[];

    static readonly cost = _.sum(Usurper.body, part => BODYPART_COST[part]);

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const spawn = this.readySpawn(spawns, Usurper.cost);
        return spawn ? [spawn, Usurper.body] : [null, []];
    }

    get steal(): StealReactor {
        return this.mission as StealReactor;
    }

    get roomName(): string {
        return this.mission.roomName;
    }

    start(): Task2Ret {
        if (this.memory.usurp === "die") return this.die();
        this.memory.usurp = "claim";
        if (this.pos.roomName !== this.roomName) return this.moveRoom(this.roomName);
        const reactor = findReactors(this.c.room)[0];
        if (!reactor) {
            this.log("no reactor in", this.roomName);
            return "wait";
        }
        if (!this.pos.isNearTo(reactor)) return this.moveTarget(reactor, 1);
        if (reactor.my) {
            this.log("reactor is ours; off to die");
            this.memory.usurp = "die";
            return this.die();
        }
        this.report("claimReactor", this.c.claimReactor(reactor), reactor);
        return "wait";
    }

    // The keeper room next to the mission room it dies in, picked once.
    get grave(): string | null {
        const mem = this.memory;
        if (mem.grave) return mem.grave;
        const exits = _.values(Game.map.describeExits(this.roomName)) as string[];
        const sk = _.find(exits, r => roomKind(r) === Kind.SourceKeeper) || _.first(exits);
        if (!sk) return null;
        mem.grave = sk;
        this.log("grave:", sk);
        return sk;
    }

    // Into the grave room with the keeper layer off, then up to the
    // nearest keeper; with none in sight, wait at the room centre for one.
    die(): Task2Ret {
        const grave = this.grave;
        if (!grave) {
            this.log("no room to die in");
            return "wait";
        }
        if (!this.memory.rewalksk) {
            this.memory.rewalksk = true;
            delete this.memory._walk;
        }
        if (this.pos.roomName !== grave) return this.moveRoom(grave);
        const keepers = (this.c.room.enemies || []).filter(e => e.keeper);
        const keeper = this.pos.findClosestByRange(keepers);
        if (keeper) {
            if (!this.pos.isNearTo(keeper)) return this.moveTarget(keeper, 1);
            return "wait";
        }
        return this.movePos(roomCenterPos(grave), 3);
    }

    // Log once per distinct (intent, code), as Immortan does.
    report(intent: string, err: number, reactor: ReactorObject) {
        const seen = `${intent}:${err}`;
        if (this.memory.lastIntent === seen) return;
        this.memory.lastIntent = seen;
        this.log(intent, "->", err, "owner:", reactor.owner?.username, "my:", reactor.my, "work:", reactor.continuousWork);
    }
}
