interface Game {
    storages: StructureStorage[]
    terminals: StructureTerminal[]
    GetObjectById<S extends AnyStructure>(id: Id<S> | null): S | null
    GetObjectById<Creep>(id: Id<Creep> | null): Creep | null
}

interface RoomVisual {
    structure(x: number, y: number, stype: StructureConstant, opts?: { opacity: number }): ScreepsReturnCode
    animatedPosition(x: number, y: number): ScreepsReturnCode
}


interface PowerCreepTick {
    power?: PowerConstant
    drop?: ResourceConstant
    withdraw?: ResourceConstant
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
    egg?: number
    laid: number
}

interface IMyCreep {
    role: string
    ticksToLive: number
    run(): boolean
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

    drawSpots(): void

    maxHits(s:Structure): number
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
    [STRUCTURE_FACTORY]: StructureFactory
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
}

interface Ruins {
}

interface Structure {
    hurts: number
}

interface StructureContainer {
    mode: "src" | "sink"
}

interface StructureController {
    isPowerEnabled: boolean
    resTicks: number
    reservable: boolean
}

interface StructureExtension {
}

interface StructureFactory {
    unloads: ResourceConstant[]
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

interface StructureSpawn {
}

interface StructureStorage {
}

interface StructureTerminal {
    requestMineral(r: ResourceConstant, amt?: number): string
    autoBuy(r: ResourceConstant): string
}

interface StructureTower {
}

interface Tombstone {
}

type GeneralStoreStruct = StructureContainer |
    StructureTerminal |
    StructureStorage |
    StructureFactory;

type StoreObject = GeneralStoreStruct | Tombstone | Ruin

type EnergyStruct = StructureSpawn | StructureExtension | StructureLab | StructureLink | StructureNuker | StructurePowerSpawn | StructureTower

type Withdrawable = StoreObject | EnergyStruct

type XferStruct = GeneralStoreStruct | EnergyStruct;

type SpawnEnergy = StructureSpawn | StructureExtension;