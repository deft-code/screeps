import { JobCreep } from "job.creep";
import { register, task, Task2Ret } from "mycreep";
import { closeSpawns } from "spawnold";
import { energyDef } from "spawn";
import { junkIn } from "swipeworth";

// Body budget: 25 CARRY + 25 MOVE is the 50-part cap.
const kMaxBodyEnergy = 2500;
// Units dropped per tick once outside the home room.
const kDropPerTick = 20;

// Throw out what does not spark joy, for the Swipe mission ("Swipe <target>
// <home>", laid by its sparkJoy check). Fills up in the home room with the
// junk (swipeworth.junkIn: worthless, nobody bids for it, and not a catalyzed
// boost) of the storage and the terminal, then walks towards the mission room. Every tick it
// stands outside the home room it drops kDropPerTick units, so the junk is
// spread thin along the way and decays. Empty, it walks straight back to the
// store that still holds junk for the next load; with nothing worthless left
// it is done and suicides, wherever it stands.
@register
export class Konmari extends JobCreep {
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const close = closeSpawns(spawns, this.homeName) as StructureSpawn[];
        const spawn = _.find(close, s => !s.spawning) || _.first(close);
        if (!spawn) return [null, []];
        const energy = Math.min(spawn.room.energyAvailable, kMaxBodyEnergy);
        return [spawn, energyDef({ move: 1, per: [CARRY], energy } as any)];
    }

    get homeName(): string {
        return this.mission.getRoomName("home")!;
    }

    get atHome(): boolean {
        return this.pos.roomName === this.homeName;
    }

    // The home store to clear next.
    findJunk(): StructureStorage | StructureTerminal | null {
        const home = Game.rooms[this.homeName];
        if (!home) return null;
        for (const store of [home.storage, home.terminal]) {
            if (store && store.my && junkIn(store.store).length) return store;
        }
        return null;
    }

    start(): Task2Ret {
        const c = this.c;
        const carrying = c.store.getUsedCapacity() > 0;
        // Loaded and out of the home room: keep walking, after() does the dropping.
        if (carrying && !this.atHome) return this.moveRoom(this.mission.roomName);
        // Room for more: straight to the store with junk in it from wherever
        // we are, as one walk (loadFrom's moveTarget crosses rooms), rather
        // than to the home room first and on to the store from its centre.
        const junk = c.store.getFreeCapacity() ? this.findJunk() : null;
        if (junk) return this.loadFrom(junk);
        if (carrying) return this.moveRoom(this.mission.roomName);
        this.log("nothing worthless left in", this.homeName, "- done");
        c.suicide();
        return "wait";
    }

    @task
    loadFrom(store: StructureStorage | StructureTerminal): Task2Ret {
        const c = this.c;
        const res = _.first(junkIn(store.store));
        if (!res || !c.store.getFreeCapacity()) return "start";
        if (!this.pos.isNearTo(store)) return this.moveTarget(store, 1);
        const err = c.withdraw(store, res);
        if (err !== OK) {
            this.log("withdraw", res, "from", store, "failed", err);
            return "start";
        }
        return "wait";
    }

    after() {
        if (this.atHome) return;
        const c = this.c;
        const store = c.store as unknown as { [res: string]: number };
        const res = _.find(Object.keys(store), r => store[r] > 0) as ResourceConstant | undefined;
        if (res) c.drop(res, Math.min(kDropPerTick, store[res]));
    }
}
