
interface RoomVisual {
    structure(x: number, y: number, stype: StructureConstant, opts?: {opacity: number}): ScreepsReturnCode
    animatedPosition(x: number, y: number): ScreepsReturnCode
}

interface StructureController {
    isPowerEnabled: boolean
}

interface PowerCreepConstructor {
    readonly prototype: PowerCreep
    new(id: number): PowerCreep
    (id: number): PowerCreep
}

declare const PowerCreep: PowerCreepConstructor;

interface PowerCreep extends RoomObject {
    id: string
    carry: StoreDefinition
    carryCapacity: number
    hits: number
    hitsMax: number
    name: string
    ticksToLive: number
    room: Room
    shard?: string

    move(dir: DirectionConstant): CreepMoveReturnCode
    spawn(s: StructurePowerSpawn): OK | ERR_INVALID_TARGET
    enableRoom(s: StructureController): OK | ERR_NOT_IN_RANGE
    renew(s: StructurePowerSpawn | StructurePowerBank): ScreepsReturnCode

    role: string
    log(...args: any[]): void
    dlog(...args: any[]): void
    memory: any
}

declare const FIND_POWER_CREEPS = 119;

declare const POWER_CLASS: {
    OPERATOR: 'operator'
};

interface PowerCreepConstructor {
    readonly prototype: PowerCreep
    new(id: number): PowerCreep
    (id: number): PowerCreep
}

// type shim for nodejs' `require()` syntax
// for stricter node.js typings, remove this and install `@types/node`
declare const require: (module: string) => any;

// add your custom typings here

interface Flag {
    self: string;
    id: string
    runTeam(): void
    darkTeam(): void
    teamWhat(): string
}

interface Creep {
    run(): void
    after(): void
    assault: boolean
    hostile: boolean
    melee: boolean
}

interface RoomCache {

}

interface RoomTick {

}

interface Room {
    findStructs(...args: StructureConstant[]): AnyStructure[]
    log(...args: any[]): void
    cache: RoomCache
    tick: RoomTick
    init(): void
    packPos(p: RoomPosition): number
    unpackPos(xy: number): RoomPosition
    addSpot(name: string, p: RoomPosition): void
    getSpot(name: string): RoomPosition | null
    lookForAtRange<T extends keyof AllLookAtTypes>(
        type: T,
        pos: RoomPosition,
        range: number,
        asArray: true,
    ): LookForAtAreaResultArray<AllLookAtTypes[T], T>;

    run(): void
    after(): void
    optional(): void

    allies: Creep[]
    enemies: Creep[]
    assaulters: Creep[]
    melees: Creep[]
    hostiles: Creep[]

    structsByType: {
        [key: string]: AnyStructure[]
    }

    runTowers(): void
    runDefense(): void
    runKeeper(): void
    runLabs(): void
    runLinks(): void
    spawningRun(): void

    drawSpots(): void
}

interface Flag {
    run(): void
}

interface RoomPosition {
    xy: number
}

type AllStructureTypes = {
    container: StructureContainer
    extension: StructureExtension
    road: StructureRoad
    spawn: StructureSpawn
    tower: StructureTower
    lab: StructureLab
    link: StructureLink
}

interface Structure {
    hurts: number
}

type StoreStructure = StructureContainer |
    StructureTerminal |
    StructureStorage;

interface StructureContainer {
    storeTotal: number
    storeFree: number
}

interface StructureStorage {
    storeTotal: number
    storeFree: number
}

interface StructureTerminal {
    storeTotal: number
    storeFree: number
}

interface Tombstone {
    storeTotal: number
    storeFree: number
}

type EnergyStruct = StructureSpawn | StructureExtension | StructureLab | StructureLink | StructureNuker | StructurePowerSpawn | StructureTower

interface StructureSpawn {
    energyFree: number
}

interface StructureExtension {
    energyFree: number
}

interface StructureLab {
    energyFree: number
}

interface StructureLink {
    energyFree: number
}

interface StructureNuker {
    energyFree: number
}

interface StructurePowerSpawn {
    energyFree: number
}

interface StructureTower {
    energyFree: number
}

type Store = StoreStructure | Tombstone

type Withdrawable = Store | EnergyStruct

interface Tombstone {

}
