import { runLabs } from "struct.lab";
import { humanize } from 'pace';
import { extender } from "roomobj";
import { runTowers } from "struct.tower";
import { runLinks } from "struct.link";
import { theRadar } from "radar";
import { updateIntel } from "intel";
import { runFactory } from "struct.factory";
import { exec, Priority, Process } from "process";
import { hasMetas } from "metastruct";

declare global {
    interface Memory {
        stats: any
    }
    interface RoomMemory {
        nstructs?: number
    }
    interface Room {
        strat: IStrat
    }
}

interface IStrat {
    name: string
    roomName: string
    room: Room
    init(): void;
    run(): void;
    evolve(): IStrat | null;
    spawnEnergy(): SpawnEnergy[] | undefined;
    maxHits(stype: BuildableStructureConstant, xy: number): number;
}

@extender
class RoomStratExtra extends Room {
    get strat(): IStrat {
        return GetStrat(this);
    }
}

const kAllies = ['no one']

function ratchet(room: Room, what: string, up: boolean) {
    const twhat = `t${what}` as "tassaulters";
    const whattime = `${what}time` as "assaulterstime"

    if (!room.memory[whattime]) room.memory[whattime] = Game.time

    if (up) {
        if (!room.memory[twhat]) room.memory[twhat] = 0
        room.memory[twhat]!++
        room.memory[whattime] = Game.time
    } else {
        const delta = Game.time - room.memory[whattime]!
        if (delta > 10) {
            room.memory[twhat as "tassaulters"] = 0
        }
    }
}

function legacyInit(room: Room) {
    const nstructs = room.find(FIND_STRUCTURES).length
    room.memory.nstructs = nstructs

    room.allies = []
    room.enemies = []
    room.hostiles = []
    room.assaulters = []
    room.melees = []

    for (let c of room.find(FIND_CREEPS)) {
        if (!c.my) {
            if (_.contains(kAllies, c.owner.username)) {
                room.allies.push(c)
            } else {
                room.enemies.push(c)
                if (c.hostile) room.hostiles.push(c)
                if (c.assault) room.assaulters.push(c)
                if (c.melee) room.melees.push(c)
            }
        }
    }

    ratchet(room, 'hostiles', !!room.hostiles.length)
    ratchet(room, 'assaulters', !!room.assaulters.length)
    ratchet(room, 'enemies', !!room.enemies.length)
}

const cache = new Map<string, IStrat>();

export class NullStrat extends Process implements IStrat {
    name = 'nullstrat';

    constructor(readonly roomName: string) {
        super();
        exec(this, "low");
    }

    status(): string {
        return `${super.status()} room:${this.roomName}`;
    }

    get room(): Room {
        return Game.rooms[this.roomName];
    }

    init() {
        legacyInit(this.room);
        updateIntel(this.room);
    }
    run(): Priority { return "low" }
    spawnEnergy(): SpawnEnergy[] | undefined { return undefined; }
    // Roads and containers nobody planned are left to decay; ActiveStrat
    // answers for the planned ones. Idle repairs by passing creeps stop here.
    maxHits(stype: BuildableStructureConstant, xy: number): number {
        switch (stype) {
            case STRUCTURE_ROAD: return 0;
            case STRUCTURE_CONTAINER: return 0;
            case STRUCTURE_WALL:
            case STRUCTURE_RAMPART:
                switch (this.room.controller?.level) {
                    case 1: return 0
                    case 2: return 100
                    case 3:
                    case 4: return 10000
                    case 5: return 100000
                    case 6: return 1000000
                    case 7: return 6000000
                    case 8: return 21000000
                }
        }
        return 0;
    }

    // GetStrat swaps in whatever evolve() returns. The outgoing strat is a
    // scheduled process, so it must kill itself or both would keep running.
    evolve(): IStrat | null {
        const room = this.room;
        if (!room) return null;
        if (room.controller?.my) return this.replace(new ClaimedStrat(this.roomName));
        if (hasMetas(this.roomName)) return this.replace(new ActiveStrat(this.roomName));
        return null;
    }

    protected replace(next: IStrat): IStrat {
        this.kill();
        this.room?.log(this.name, "->", next.name);
        return next;
    }
}

// Ticks between site-placement passes in an ActiveStrat room.
const kActiveUpkeep = 10;

// An unclaimed room that has metas in memory, planned by a mission (Remote).
// Places their container and road sites while we have vision, and gives the
// planned roads/containers full maxHits so creeps repair only those. Evolves
// back to NullStrat once the metas are removed, so the leftovers decay.
export class ActiveStrat extends NullStrat implements IStrat {
    name = "activestrat";
    offset = _.random(kActiveUpkeep - 1);

    run(): Priority {
        const room = this.room;
        if (!room) return "low";
        // Cannot build in a room someone else owns.
        if (room.controller?.owner && !room.controller.my) return "low";
        if ((Game.time + this.offset) % kActiveUpkeep) return "low";
        room.meta.runUnowned();
        return "low";
    }

    maxHits(stype: BuildableStructureConstant, xy: number): number {
        if (stype === STRUCTURE_ROAD || stype === STRUCTURE_CONTAINER) {
            const room = this.room;
            if (!room) return 0;
            return room.meta.maxHits(stype, xy, 0);
        }
        return super.maxHits(stype, xy);
    }

    evolve(): IStrat | null {
        const room = this.room;
        if (!room) return null;
        if (room.controller?.my) return this.replace(new ClaimedStrat(this.roomName));
        if (!hasMetas(this.roomName)) return this.replace(new NullStrat(this.roomName));
        return null;
    }
}


export function GetStrat(room: Room): IStrat {
    let strat = cache.get(room.name);
    if(strat) {
        const next = strat.evolve();
        if(!next) return strat;
        strat = next;
    } else {
        strat = makeStrat(room);
    }
    cache.set(room.name, strat);
    return strat;
}

let cpu = 0;
let nhits = 0;

class ClaimedStrat extends NullStrat implements IStrat {
    name = "claimedstrat"
    // Inherits NullStrat.evolve otherwise, which would re-create itself forever.
    evolve(): null { return null }
    init() {
        super.init();
        if (this.room.controller?.level === 8) {
            const ob = _.first(this.room.findStructs(STRUCTURE_OBSERVER));
            if (ob) theRadar.register(ob);
        }
    }
    run(): Priority {
        runTowers(this.room);
        super.run();
        popSafeMode(this.room);
        runLabs(this.room);
        this.doLinks();
        this.doUpkeep();
        drawMinerals(this.room);
        runFactory(this.room);
        return "normal";
    }

    doUpkeep() {
        const start = Game.cpu.getUsed()
        this.room.meta.run();
        this.room.log("metastruct use", Game.cpu.getUsed() - start, "hits", cpu, 'count', nhits);
        cpu = 0;
        nhits = 0;
    }

    doLinks() {
        runLinks(this.room);
    }

    maxHits(stype: BuildableStructureConstant, xy: number): number {
        const start = Game.cpu.getUsed()
        const max = this.room.meta.maxHits(stype, xy, this.room.controller?.level || 1);
        cpu += Game.cpu.getUsed() - start;
        nhits++;
        return max;
    }

    spawnEnergy() { return this.room.meta.spawnEnergy(); }
}

function makeStrat(room: Room): IStrat {
    if (room.controller && room.controller.my) {
            return new ClaimedStrat(room.name);
    }
    if (hasMetas(room.name)) return new ActiveStrat(room.name);
    return new NullStrat(room.name);
}

function drawMinerals(room: Room) {
    const mins = room.find(FIND_MINERALS);
    for (const min of mins) {
        if (min.ticksToRegeneration && min.ticksToRegeneration > 0) {
            room.visual.text(humanize(min.ticksToRegeneration), min.pos.x, min.pos.y + 1);
        }
    }
}

function popSafeMode(room: Room) {
    if (room.controller?.my) {
        if (room.assaulters.length) {
            const structs = room.findStructs(
                STRUCTURE_TOWER, STRUCTURE_SPAWN)
            if (_.find(structs, s => s.hits < s.hitsMax)) {
                const ret = room.controller.activateSafeMode()
                room.log('SAFE MODE!', ret)
                Game.notify(`SAFE MODE:${ret}! ${room}`, 30)
            }
        }
    }
}