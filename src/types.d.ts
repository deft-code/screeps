interface Game {
    storages: StructureStorage[]
    terminals: StructureTerminal[]
}

interface RoomVisual {
    structure(x: number, y: number, stype: StructureConstant, opts?: { opacity: number }): ScreepsReturnCode
    animatedPosition(x: number, y: number): ScreepsReturnCode
}

interface StructureController {
    isPowerEnabled: boolean
    resTicks: number
    reservable: boolean
}

interface RoomObject {
    id: string
    effectTTL(pwr: PowerConstant): number
}


interface PowerCreepTick {
    power?: PowerConstant
}

interface PowerCreep extends RoomObject {
    tick: PowerCreepTick

    role: string
    log(...args: any[]): void
    dlog(...args: any[]): void
    errlog(err: ScreepsReturnCode, ...str: any[]): ScreepsReturnCode
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
    debug: boolean
}

interface SourceTick {
    regen?: boolean
}

interface Source {
    note: string
    tick: SourceTick
    regenTTL: number
}

interface FlagMemory {
    creeps?: string[]
    junior?: boolean
    pace?: number
    when?: {
        [role: string]: number
    }
}

interface CreepMemory {
    egg?: any
}

interface Creep {
    run(): void
    after(): void
    assault: boolean
    hostile: boolean
    melee: boolean
    spawnTime: number
    role: string

    carryFree: number
    carryTotal: number
    teamRoom: Room

    debug: boolean
    log(...args: any[]): void
    dlog(...args: any[]): void
    errlog(err: ScreepsReturnCode, ...str: any[]): ScreepsReturnCode
}

interface RoomCache {

}

interface RoomTick {

}

interface RoomMemory {
    tassaulters?: number
    tenemies?: number
    thostiles?: number
    assaulterstime?: number
    enemiestime?: number
    hostilestime?: number
}

interface Room {
    findStructs<SType extends StructureConstant>(stype: SType): AllStructureTypes[SType][]
    //findStructs<SType extends StructureConstant>(stype: SType): Structure<SType>
    findStructs(...args: StructureConstant[]): AnyStructure[]
    log(...args: any[]): void
    dlog(...args: any[]): void
    cache: RoomCache
    tick: RoomTick
    energyFreeAvailable: number
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
    requestBoosts(boosts: ResourceConstant[] | undefined): void
    requestBoost(boost: ResourceConstant | undefined): StructureLab

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

    log(...args: any[]): void
    errlog(err: ScreepsReturnCode, ...str: any[]): ScreepsReturnCode

    runTowers(): void
    runDefense(): void
    runKeeper(): void
    runLabs(): void
    runLinks(): void
    spawningRun(): void

    drawSpots(): void

    wallMax: number
}

interface Flag {
    run(): void
    log(...args: any[]): void
    dlog(...args: any[]): void
    errlog(err: ScreepsReturnCode, ...str: any[]): ScreepsReturnCode
}

interface RoomPosition {
    xy: number
}

type AllStructureTypes = {
    [STRUCTURE_NUKER]: StructureNuker
    [STRUCTURE_STORAGE]: StructureStorage
    [STRUCTURE_TERMINAL]: StructureTerminal
    [STRUCTURE_EXTENSION]: StructureExtension
    [STRUCTURE_RAMPART]: StructureRampart
    [STRUCTURE_ROAD]: StructureRoad
    [STRUCTURE_SPAWN]: StructureSpawn
    [STRUCTURE_LINK]: StructureLink
    [STRUCTURE_WALL]: StructureWall
    [STRUCTURE_KEEPER_LAIR]: StructureKeeperLair
    [STRUCTURE_CONTROLLER]: StructureController
    [STRUCTURE_STORAGE]: StructureStorage
    [STRUCTURE_TOWER]: StructureTower
    [STRUCTURE_OBSERVER]: StructureObserver
    [STRUCTURE_POWER_BANK]: StructurePowerBank
    [STRUCTURE_POWER_SPAWN]: StructurePowerSpawn
    [STRUCTURE_EXTRACTOR]: StructureExtractor
    [STRUCTURE_LAB]: StructureLab
    [STRUCTURE_TERMINAL]: StructureTerminal
    [STRUCTURE_CONTAINER]: StructureContainer
    [STRUCTURE_NUKER]: StructureNuker
    [STRUCTURE_PORTAL]: StructurePortal
}

interface Structure {
    hurts: number
}

interface StructureContainer {
    storeTotal: number
    storeFree: number
    mode: "src" | "sink"
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

interface StructureSpawn {
    energyFree: number
}

interface StructureExtension {
    energyFree: number
}

interface StructureLab {
    energyFree: number
    planType: ResourceConstant
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

type StoreStructure = StructureContainer |
    StructureTerminal |
    StructureStorage;

type Store = StoreStructure | Tombstone

type EnergyStruct = StructureSpawn | StructureExtension | StructureLab | StructureLink | StructureNuker | StructurePowerSpawn | StructureTower

type Withdrawable = Store | EnergyStruct

type XferStruct = StoreStructure | EnergyStruct;

interface Tombstone {

}
