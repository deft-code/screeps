import { runLabs } from "struct.lab";
import { humanize } from 'pace';
import { extender } from "roomobj";
import { runTowers } from "struct.tower";
import { run } from "shed";
import { runLinks, balanceSplit } from "struct.link";
import { runKeeper } from "room.keeper";
import { spawningRun } from "creep.role";

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
    order(room: Room): number;
    init(room: Room): void;
    run(room: Room): void;
    after(room: Room): void;
    optional(room: Room): void;
    evolve(roomName: string): IStrat | null;
    spawnEnergy(room: Room): SpawnEnergy[] | null;
    maxHits(room: Room, stype: StructureConstant, xy: number): number;
}

@extender
class RoomStratExtra extends Room {
    get strat(): IStrat {
        return GetStrat(this.name);
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

export class NullStrat implements IStrat {
    name = "nullstrat";
    order(room: Room): number {
        if (room.enemies.length > 0) return 1;
        return 0;
    }
    init(room: Room) {
        legacyInit(room);
    }
    run(room: Room) {
        run(room.find(FIND_MY_CREEPS), 1000, c => c.run());
    }
    after(room: Room) {
        run(room.find(FIND_MY_CREEPS), 1000, c => c.after());
        stats(room);
    }
    optional(room: Room) {
        run(room.find(FIND_FLAGS), 4000, f => f.run());
    }
    evolve(roomName: string): null { return null }
    spawnEnergy(room: Room): SpawnEnergy[] | null { return null; }
    maxHits(room: Room, stype: StructureConstant, xy: number): number {
        switch (stype) {
            case STRUCTURE_ROAD: return ROAD_HITS;
            case STRUCTURE_CONTAINER: return CONTAINER_HITS;
            case STRUCTURE_WALL:
            case STRUCTURE_RAMPART:
                return 100;
        }
        return 0;
    }
}

function stats(room: Room) {
    if (!Memory.stats.rooms) {
        Memory.stats.rooms = {}
    }
    if (!room.controller) return
    Memory.stats.rooms[room.name] = {
        rcl: room.controller.level,
        controllerProgress: room.controller.progress,
        controllerProgressTotal: room.controller.progressTotal
    }
}


const nullStrat = new NullStrat();

const cache = new Map<string, IStrat>();

export function GetStrat(roomName: string): IStrat {
    const strat = fetchStrat(roomName);
    if (!strat) return nullStrat;
    const next = strat.evolve(roomName);
    if (next) {
        cache.set(roomName, next);
        return next;
    }
    return strat;
}

function fetchStrat(roomName: string): IStrat | null {
    if (cache.has(roomName)) {
        return cache.get(roomName)!;
    }
    const room = Game.rooms[roomName];
    if (!room) return null;
    const flags = room.find(FIND_FLAGS);
    // prefer blue flags over cyan flags.
    for (const flag of flags) {
        if (flag.color === COLOR_BLUE) {
            return getMyStrat(flag);
        }
    }
    for (const flag of flags) {
        if (flag.color === COLOR_CYAN) {
            return getMyStrat(flag);
        }
    }
    return nullStrat;
}

function getMyStrat(flag: Flag): IStrat {
    const room = flag.room!;
    if (room.controller && room.controller.my) {
        if (flag.secondaryColor === COLOR_GREEN) {
            return new NovaStrat();
        }
        return new ClaimedStrat();
    }
    return nullStrat;
}

class ClaimedStrat extends NullStrat implements IStrat {
    name = "claimedstrat"
    order(room: Room): number {
        const nullOrder = super.order(room);
        if (room.controller && room.controller.my) return nullOrder + 2;
        return nullOrder + 1;
    }
    run(room: Room) {
        runTowers(room);
        super.run(room);
        popSafeMode(room);
    }
    optional(room: Room) {
        super.optional(room);
        runLabs(room);
        this.doLinks(room);
        this.doUpkeep(room);
        spawningRun(room);
        drawMinerals(room);
    }

    doUpkeep(room: Room) {
        runKeeper(room);
    }

    doLinks(room: Room) {
        runLinks(room);
        balanceSplit(room);
    }

    maxHits(room: Room, stype: StructureConstant, xy: number): number {
        switch (stype) {
            case STRUCTURE_ROAD: return ROAD_HITS;
            case STRUCTURE_CONTAINER: return CONTAINER_HITS;
            case STRUCTURE_WALL:
            case STRUCTURE_RAMPART:
                switch (room.controller?.level) {
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

        return 0
    }
}

class NovaStrat extends ClaimedStrat {
    name = "novastrat"
    doUpkeep(room: Room) {
        room.meta.run();
    }
    doLinks(room: Room) {
        runLinks(room);
    }
    spawnEnergy(room: Room) { return room.meta.spawnEnergy(); }
    maxHits(room: Room, stype: StructureConstant, xy: number): number {
        return room.meta.maxHits(stype, xy);
    }
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
    if (room.controller && room.controller.my) {
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