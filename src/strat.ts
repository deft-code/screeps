import { runLabs } from "struct.lab";
import { humanize } from 'pace';
import { extender } from "roomobj";
import { runTowers } from "struct.tower";
import { runLinks } from "struct.link";
import { theRadar } from "radar";
import { updateIntel } from "intel";
import { runFactory } from "struct.factory";
import { theMarket } from "market";
import { exec, Priority, Process } from "process";

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

    get room(): Room {
        return Game.rooms[this.roomName];
    }

    init() {
        legacyInit(this.room);
        updateIntel(this.room);
    }
    run(): Priority { return "low" }
    spawnEnergy(): SpawnEnergy[] | undefined { return undefined; }
    maxHits(stype: BuildableStructureConstant, xy: number): number {
        switch (stype) {
            case STRUCTURE_ROAD: return ROAD_HITS;
            case STRUCTURE_CONTAINER: return CONTAINER_HITS;
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
    evolve(): null { return null }
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
    init() {
        super.init();
        if (this.room.controller?.level === 8) {
            const ob = _.first(this.room.findStructs(STRUCTURE_OBSERVER));
            if (ob) theRadar.register(ob);
        }
        theMarket.registerRoom(this.room);
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
    return new NullStrat(room.name);
}

function drawMinerals(room: Room) {
    const mins = room.find(FIND_MINERALS);
    for (const min of mins) {
        if (min.ticksToRegeneration > 0) {
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