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

declare const PWR_GENERATE_OPS: 1;
declare const PWR_OPERATE_SPAWN: 2;
declare const PWR_OPERATE_TOWER: 3;
declare const PWR_OPERATE_STORAGE: 4;
declare const PWR_OPERATE_LAB: 5;
declare const PWR_OPERATE_EXTENSION: 6;
declare const PWR_OPERATE_OBSERVER: 7;
declare const PWR_OPERATE_TERMINAL: 8;
declare const PWR_DISRUPT_SPAWN: 9;
declare const PWR_DISRUPT_TOWER: 10;
declare const PWR_DISRUPT_SOURCE: 11;
declare const PWR_SHIELD: 12;
declare const PWR_REGEN_SOURCE: 13;
declare const PWR_REGEN_MINERAL: 14;
declare const PWR_DISRUPT_TERMINAL: 15;
declare const PWR_OPERATE_POWER: 16;
declare const PWR_FORTIFY: 17;
declare const PWR_OPERATE_CONTROLLER: 18;
declare const PWR_OPERATE_FACTORY: 19;

type PWR_GENERATE_OPS = 1;
type PWR_OPERATE_SPAWN = 2;
type PWR_OPERATE_TOWER = 3;
type PWR_OPERATE_STORAGE = 4;
type PWR_OPERATE_LAB = 5;
type PWR_OPERATE_EXTENSION = 6;
type PWR_OPERATE_OBSERVER = 7;
type PWR_OPERATE_TERMINAL = 8;
type PWR_DISRUPT_SPAWN = 9;
type PWR_DISRUPT_TOWER = 10;
type PWR_DISRUPT_SOURCE = 11;
type PWR_SHIELD = 12;
type PWR_REGEN_SOURCE = 13;
type PWR_REGEN_MINERAL = 14;
type PWR_DISRUPT_TERMINAL = 15;
type PWR_OPERATE_POWER = 16;
type PWR_FORTIFY = 17;
type PWR_OPERATE_CONTROLLER = 18;
type PWR_OPERATE_FACTORY = 19;

type PowerType = PWR_GENERATE_OPS |
    PWR_OPERATE_SPAWN |
    PWR_OPERATE_TOWER |
    PWR_OPERATE_STORAGE |
    PWR_OPERATE_LAB |
    PWR_OPERATE_EXTENSION |
    PWR_OPERATE_OBSERVER |
    PWR_OPERATE_TERMINAL |
    PWR_DISRUPT_SPAWN |
    PWR_DISRUPT_TOWER |
    PWR_DISRUPT_SOURCE |
    PWR_SHIELD |
    PWR_REGEN_SOURCE |
    PWR_REGEN_MINERAL |
    PWR_DISRUPT_TERMINAL |
    PWR_OPERATE_POWER |
    PWR_FORTIFY |
    PWR_OPERATE_CONTROLLER |
    PWR_OPERATE_FACTORY;


interface EffectEntry {
    power: PowerType
    level: number
    ticksRemaining: number
}

interface RoomObject {
    effects: EffectEntry[]
    effectTTL(pwr: PowerType): number
}


interface PowerCreepTick {
    power?: PowerType
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
    powers: {
        [pwr in PowerType]?: {
            level: number
            cooldown: number
        }
    }
    tick: PowerCreepTick

    move(dir: DirectionConstant): CreepMoveReturnCode
    spawn(s: StructurePowerSpawn): OK | ERR_INVALID_TARGET
    enableRoom(s: StructureController): OK | ERR_NOT_IN_RANGE
    renew(s: StructurePowerSpawn | StructurePowerBank): ScreepsReturnCode
    usePower(pwr: PowerType, obj: RoomObject): ScreepsReturnCode

    role: string
    log(...args: any[]): void
    dlog(...args: any[]): void
    errlog(err: ScreepsReturnCode, ...str: any[]): ScreepsReturnCode
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
    goTransfer(s: Structure, r: ResourceConstant, move: boolean): boolean
    goWithdraw(w: Withdrawable, r: ResourceConstant, move: boolean): boolean
    moveSpot(): boolean

    carryFree: number
    carryTotal: number
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
    mode: string
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
