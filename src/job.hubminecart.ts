import { Chemist } from "job.chemist";
import { Hubminer } from "job.hubminer";
import { register, Task2Ret } from "mycreep";
import { fromXY } from "Rewalker";

// The cart behind the Hubminer (job.hubminer.ts): empties the Meta_min
// container the miner drop-mines into and puts the mineral away with the
// Chemist's delivery rules (Chemist.deliver: a lab that wants it, else the
// terminal, else the storage). Body [CARRY, CARRY, MOVE] x 3 (450 energy,
// 300 carry), spawned by the mission room's own spawns.
//
// Laid by Hub (and so Thorhub) with nJobs(Hubminecart, Hubminecart.want(room)):
// one while the container holds anything, two while it is over half full.
//
// Empty, it withdraws from the container; loaded, it delivers. Empty with
// under kRetireTTL ticks to live, or with the container and the mineral
// both empty, it walks to a spawn and is recycled.

const kRetireTTL = 50;
const kUnits = 3;

@register
export class Hubminecart extends Chemist {
    static readonly body: BodyPartConstant[] = _.flatten(_.times(kUnits, () => [CARRY, CARRY, MOVE])) as BodyPartConstant[];

    static readonly cost = _.sum(Hubminecart.body, part => BODYPART_COST[part]);

    // The container on the room's Meta_min 'mineral' spot, if built.
    static container(room: Room): StructureContainer | null {
        const xy = Hubminer.meta(room)?.getSpot("mineral");
        if (!xy) return null;
        const pos = fromXY(xy, room.name);
        return _.find(pos.lookFor(LOOK_STRUCTURES), s => s.structureType === STRUCTURE_CONTAINER) as StructureContainer || null;
    }

    // How many Hub should keep: none for an empty (or missing) container,
    // one with anything in it, two past half full.
    static want(room: Room | null | undefined): number {
        if (!room?.controller?.my) return 0;
        const cont = Hubminecart.container(room);
        if (!cont) return 0;
        const used = cont.store.getUsedCapacity();
        if (used <= 0) return 0;
        return used > cont.store.getCapacity() / 2 ? 2 : 1;
    }

    // The mission room's own spawns, one idle with the cost in hand.
    spawn(spawns: StructureSpawn[]): [StructureSpawn | null, BodyPartConstant[]] {
        const room = this.mission.room;
        if (!room || room.energyAvailable < Hubminecart.cost) return [null, []];
        const local = spawns.filter(s => s.room.name === room.name && !s.spawning);
        if (!local.length) return [null, []];
        return [_.sample(local), Hubminecart.body];
    }

    start(): Task2Ret {
        const c = this.c;
        const room = this.mission.room;
        if (!room) return "wait";
        if (this.pos.roomName !== room.name) return this.moveRoom(room.name);

        const held = _.find(Object.keys(c.store) as ResourceConstant[], r => c.store[r] > 0);
        if (held) return this.deliver(held);

        if (this.ticksToLive < kRetireTTL) return this.recycle();
        const cont = Hubminecart.container(room);
        const left = cont ? cont.store.getUsedCapacity() : 0;
        if (!left) {
            const mineral = Hubminer.mineral(room);
            if (!mineral || mineral.mineralAmount <= 0) return this.recycle();
            // Container empty, mineral not: wait beside the container.
            if (cont && !this.pos.isNearTo(cont)) this.moveTarget(cont, 1);
            return "wait";
        }
        if (!this.pos.isNearTo(cont!)) return this.moveTarget(cont!, 1);
        const res = _.find(Object.keys(cont!.store) as ResourceConstant[], r => cont!.store[r] > 0)!;
        const err = c.withdraw(cont!, res, Math.min(cont!.store[res], c.store.getFreeCapacity()));
        if (err !== OK) this.log("withdraw", res, "from", cont, "failed", err);
        return "wait";
    }

    // Hand the body back at the nearest spawn in the room.
    recycle(): Task2Ret {
        const spawn = this.pos.findClosestByRange(this.c.room.findStructs(STRUCTURE_SPAWN) as StructureSpawn[]);
        if (!spawn) {
            this.log("no spawn to recycle at, suiciding");
            this.c.suicide();
            return "wait";
        }
        if (!this.pos.isNearTo(spawn)) {
            this.moveTarget(spawn, 1);
            return "wait";
        }
        const err = spawn.recycleCreep(this.c);
        if (err !== OK) this.log("recycle failed", err);
        return "wait";
    }
}
