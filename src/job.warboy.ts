import { JobCreep } from "job.creep";
import { register, task, Task2Ret } from "mycreep";
import { energyDef } from "spawn";
import { findReactors, thoriumMineral } from "reactor";

// Season 11 thorium runner. Spawned in the Reactor mission's "home" room, it
// harvests thorium at that room's extractor, walks it to the sector core and
// transfers it into the reactor, but only while the reactor is ours. Empty, it
// scavenges thorium lying on the ground or in tombstones and ruins around it
// (dead warboys drop their load) and delivers that too, then goes back to the
// mineral for another run. Thorium in the store ages the creep faster
// (x2 from 100, x3 from 1000), so the body is capped below 1000 carry.
@register
export class Warboy extends JobCreep {
    // WORK, CARRY and MOVE in equal numbers; 200 energy per level.
    // Capped at 16 levels: 48 parts, 800 carry, under the x3 aging threshold.
    static bodyLevels(energy: number): number {
        return Math.max(1, Math.min(16, Math.floor(energy / 200)));
    }

    // Thorium one warboy carries per trip for a room of this energy capacity.
    static tripLoad(energy: number): number {
        return Warboy.bodyLevels(energy) * CARRY_CAPACITY;
    }

    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const homeName = this.mission.getRoomName("home");
        if (!homeName) return [null, []];
        const homeSpawns = spawns.filter(s => s.room.name === homeName);
        if (!homeSpawns.length) return [null, []];
        const energy = homeSpawns[0].room.energyCapacityAvailable;
        const body = energyDef({ move: 2, per: [WORK, CARRY], energy, max: Warboy.bodyLevels(energy) });
        return [_.sample(homeSpawns), body];
    }

    get thorium(): number {
        return RESOURCE_THORIUM ? this.c.store[RESOURCE_THORIUM] || 0 : 0;
    }

    start(): Task2Ret {
        if (!RESOURCE_THORIUM) return "wait";
        if (this.thorium > 0) return this.deliver();

        const loot = this.findLoot();
        if (loot) return this.scavenge(loot);

        const mineral = thoriumMineral(this.mission.getRoom("home"));
        if (mineral) return this.harvest(mineral);

        const homeName = this.mission.getRoomName("home");
        if (homeName && this.pos.roomName !== homeName) return this.moveRoom(homeName);
        // Home is visible and its thorium is gone (or its extractor is): nothing left to do.
        this.dlog("no thorium to run");
        return "wait";
    }

    // Thorium lying around in this room: loose piles, tombstones, ruins.
    findLoot(): Resource | Tombstone | Ruin | null {
        const room = this.c.room;
        const T = RESOURCE_THORIUM!;
        const loot: (Resource | Tombstone | Ruin)[] = [
            ...room.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === T }),
            ...room.find(FIND_TOMBSTONES, { filter: t => t.store[T] > 0 }),
            ...room.find(FIND_RUINS, { filter: r => r.store[T] > 0 }),
        ];
        return this.pos.findClosestByRange(loot);
    }

    @task
    scavenge(loot: Resource | Tombstone | Ruin): Task2Ret {
        if (!this.c.store.getFreeCapacity()) return "start";
        const T = RESOURCE_THORIUM!;
        const left = loot instanceof Resource ? loot.amount : loot.store[T];
        if (!left) return "start";
        const err = loot instanceof Resource ? this.c.pickup(loot) : this.c.withdraw(loot, T);
        if (err === ERR_NOT_IN_RANGE) {
            this.moveTarget(loot, 1);
            return "wait";
        }
        if (err !== OK) this.log("scavenge failed", err, loot);
        return "wait";
    }

    @task
    harvest(mineral: Mineral): Task2Ret {
        if (!this.c.store.getFreeCapacity()) return "start";
        if (!mineral.mineralAmount) return "start";
        const err = this.c.harvest(mineral);
        if (err === ERR_NOT_IN_RANGE) {
            this.moveTarget(mineral, 1);
            return "wait";
        }
        // ERR_TIRED is the extractor cooldown; ERR_NOT_FOUND means the extractor is gone.
        if (err === ERR_NOT_FOUND) {
            this.log("no extractor on", mineral.pos);
            return "start";
        }
        return "wait";
    }

    @task
    deliver(): Task2Ret {
        if (!this.thorium) return "start";
        const roomName = this.mission.roomName;
        if (this.pos.roomName !== roomName) return this.moveRoom(roomName);

        const reactor = findReactors(this.c.room)[0];
        if (!reactor) {
            this.log("no reactor in", roomName);
            return "wait";
        }
        // Feed only our own reactor; otherwise wait beside it for the Immortan.
        if (!reactor.my) {
            if (!this.pos.inRangeTo(reactor, 2)) this.moveTarget(reactor, 2);
            return "wait";
        }
        const err = this.c.transfer(reactor as unknown as Structure, RESOURCE_THORIUM!);
        if (err === ERR_NOT_IN_RANGE) {
            this.moveTarget(reactor, 1);
            return "wait";
        }
        // ERR_FULL: the reactor holds 1000; stand by until it burns some.
        if (err !== OK && err !== ERR_FULL) this.log("transfer failed", err, reactor);
        return "wait";
    }
}
