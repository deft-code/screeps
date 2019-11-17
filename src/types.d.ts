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

    teamRoom: Room
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
}

interface RoomPosition {
    xy: number
}

type AllStructureTypes = {
    [STRUCTURE_CONTAINER]: StructureContainer
    [STRUCTURE_CONTROLLER]: StructureController
    [STRUCTURE_EXTENSION]: StructureExtension
    [STRUCTURE_EXTRACTOR]: StructureExtractor
    [STRUCTURE_INVADER_CORE]: StructureInvaderCore
    [STRUCTURE_KEEPER_LAIR]: StructureKeeperLair
    [STRUCTURE_LAB]: StructureLab
    [STRUCTURE_LINK]: StructureLink
    [STRUCTURE_NUKER]: StructureNuker
    [STRUCTURE_OBSERVER]: StructureObserver
    [STRUCTURE_PORTAL]: StructurePortal
    [STRUCTURE_POWER_BANK]: StructurePowerBank
    [STRUCTURE_POWER_SPAWN]: StructurePowerSpawn
    [STRUCTURE_RAMPART]: StructureRampart
    [STRUCTURE_ROAD]: StructureRoad
    [STRUCTURE_SPAWN]: StructureSpawn
    [STRUCTURE_STORAGE]: StructureStorage
    [STRUCTURE_TERMINAL]: StructureTerminal
    [STRUCTURE_TOWER]: StructureTower
    [STRUCTURE_WALL]: StructureWall
    [STRUCTURE_FACTORY]: StructureFactory
}

interface Structure {
    hurts: number
}

interface StructureContainer {
    mode: "src" | "sink"
}

interface StructureStorage {
}

interface StructureTerminal {
}

interface Tombstone {
}

interface StructureSpawn {
}

interface StructureExtension {
}

interface StructureLab {
    planType: ResourceConstant
}

interface StructureLink {
}

interface StructureNuker {
}

interface StructurePowerSpawn {
}

interface StructureTower {
}

type GenericStoreStructure = StructureContainer |
    StructureTerminal |
    StructureStorage;

type StoreObject = GenericStoreStructure | Tombstone | Ruin

type EnergyStruct = StructureSpawn | StructureExtension | StructureLab | StructureLink | StructureNuker | StructurePowerSpawn | StructureTower

type Withdrawable = StoreObject | EnergyStruct

type XferStruct = GenericStoreStructure | EnergyStruct;

interface Tombstone {

}
