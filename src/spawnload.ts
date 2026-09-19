import { daemon, Priority, Process } from "process";

// Spawn telemetry: how busy each spawn is and how many creeps it starts.
//
// Two series per spawn, both kept in Memory.spawns[name] as integers only:
//   busy  ticks the spawn had `spawning` set (counted every tick by the daemon)
//   born  creeps started (counted by noteSpawned(), called from spawn.ts)
// A series is a live counter `n` for the current kWindow-tick window, a fifo
// `old` of the last kKeep closed windows (oldest first), and `ema`: an
// exponential moving average (alpha kAlpha) of the windows that aged out of
// the fifo. `ema` is stored multiplied by the series' scale so that small
// counts (a handful of creeps per window) keep their resolution as integers.
//
// Readers: spawnLoad / spawnLoadLong (fraction of ticks busy, 0..1) and
// spawnRate / spawnRateLong (creeps started per CREEP_LIFE_TIME ticks), each
// with room* and global* aggregates. The short form is the plain average over
// the live window plus the fifo (1500-2000 ticks once warm); the long form
// runs the fifo and the live window through the ema.

const kWindow = 500;
const kKeep = 3;
const kAlpha = 0.1;
// A first window that saw fewer ticks than this is dropped, not scaled up.
const kMinObserved = 100;

const kBusyScale = 1;
const kBornScale = 100;

interface Series {
    n: number
    old: number[]
    ema?: number
}

declare global {
    interface SpawnMemory {
        // floor(Game.time / kWindow) of the window the live counters belong to.
        epoch: number
        // Ticks of the first window that passed before this entry existed.
        skip?: number
        busy: Series
        born: Series
    }
}

function getMem(spawn: StructureSpawn): SpawnMemory {
    Memory.spawns = Memory.spawns || {};
    let mem = Memory.spawns[spawn.name];
    if (!mem || !mem.busy || !mem.born) {
        mem = Memory.spawns[spawn.name] = {
            epoch: Math.floor(Game.time / kWindow),
            skip: Game.time % kWindow,
            busy: { n: 0, old: [] },
            born: { n: 0, old: [] },
        };
    }
    return mem;
}

// The 0.9/0.1 blend in integers. The step is never 0 while the two differ, so
// the average converges instead of stalling inside the rounding deadband.
function emaStep(ema: number | undefined, value: number): number {
    if (ema === undefined) return value;
    const diff = value - ema;
    if (!diff) return ema;
    return ema + Math.sign(diff) * Math.max(1, Math.round(Math.abs(diff) * kAlpha));
}

// Close the live window: push it on the fifo and fold whatever falls off the
// far end into the ema. `observed` < kWindow only for an entry's first window.
function roll(series: Series, scale: number, observed: number) {
    if (observed >= kMinObserved) {
        series.old.push(Math.round(series.n * kWindow / observed));
    }
    series.n = 0;
    while (series.old.length > kKeep) {
        series.ema = emaStep(series.ema, series.old.shift()! * scale);
    }
}

function update(spawn: StructureSpawn) {
    const mem = getMem(spawn);
    const epoch = Math.floor(Game.time / kWindow);
    // Compared by epoch rather than `Game.time % kWindow === 0` so a tick the
    // process table skipped cannot leave a window open for a second lap.
    if (epoch !== mem.epoch) {
        const observed = kWindow - (mem.skip || 0);
        roll(mem.busy, kBusyScale, observed);
        roll(mem.born, kBornScale, observed);
        mem.epoch = epoch;
        delete mem.skip;
    }
    if (spawn.spawning) mem.busy.n++;
}

// Called by spawn.ts runSpawns when spawnCreep returns OK.
export function noteSpawned(spawn: StructureSpawn) {
    getMem(spawn).born.n++;
}

@daemon
class SpawnTelemetry extends Process {
    // One cheap loop; keep it out of the bucket throttle so windows stay whole.
    bucket = 0;
    run(): Priority {
        const spawns = _.values<StructureSpawn>(Game.spawns);
        for (const spawn of spawns) update(spawn);
        if (Game.time % kWindow === 0 && Memory.spawns) {
            for (const name of _.keys(Memory.spawns)) {
                if (!Game.spawns[name]) delete Memory.spawns[name];
            }
        }
        return "critical";
    }
}

// Ticks of the live window this entry has seen, this tick included.
function elapsed(mem: SpawnMemory): number {
    return Math.max(1, Game.time % kWindow + 1 - (mem.skip || 0));
}

// [sum, ticks] over the live window and the fifo. Only the live window has a
// partial denominator.
function shortParts(series: Series, mem: SpawnMemory): [number, number] {
    return [series.n + _.sum(series.old), elapsed(mem) + kWindow * series.old.length];
}

// Per-tick value from the ema folded (without storing) over the fifo and then
// the live window. The live window is weighted by how much of it has passed,
// which at a full window is exactly the stored rule; with no history at all it
// stands in alone, so a new spawn reads the same as the short form.
function longPerTick(series: Series, scale: number, mem: SpawnMemory): number {
    let temp = series.ema;
    for (const v of series.old) {
        temp = temp === undefined ? v * scale : (1 - kAlpha) * temp + kAlpha * v * scale;
    }
    const e = elapsed(mem);
    if (temp === undefined) {
        temp = series.n * scale * kWindow / e;
    } else {
        temp = (1 - kAlpha * e / kWindow) * temp + kAlpha * series.n * scale;
    }
    return temp / scale / kWindow;
}

function roomSpawns(roomName: string): StructureSpawn[] {
    return _.filter(Game.spawns, s => s.room.name === roomName);
}

function allSpawns(): StructureSpawn[] {
    return _.values<StructureSpawn>(Game.spawns);
}

// Fraction of spawn-ticks busy across `spawns`: numerators and denominators
// are summed, so a young spawn weighs in by what it has actually observed.
function loadOf(spawns: StructureSpawn[]): number | null {
    if (!spawns.length) return null;
    let sum = 0;
    let ticks = 0;
    for (const s of spawns) {
        const mem = getMem(s);
        const [n, t] = shortParts(mem.busy, mem);
        sum += n;
        ticks += t;
    }
    return sum / ticks;
}

function loadLongOf(spawns: StructureSpawn[]): number | null {
    if (!spawns.length) return null;
    return _.sum(spawns, s => spawnLoadLong(s)) / spawns.length;
}

// Creeps per CREEP_LIFE_TIME from all of `spawns` together: a sum, not a mean.
function rateOf(spawns: StructureSpawn[]): number | null {
    if (!spawns.length) return null;
    return _.sum(spawns, s => spawnRate(s));
}

function rateLongOf(spawns: StructureSpawn[]): number | null {
    if (!spawns.length) return null;
    return _.sum(spawns, s => spawnRateLong(s));
}

// Fraction (0..1) of recent ticks the spawn was spawning.
export function spawnLoad(spawn: StructureSpawn): number {
    const mem = getMem(spawn);
    const [n, t] = shortParts(mem.busy, mem);
    return n / t;
}

// Fraction (0..1) of ticks the spawn was spawning, long-run ema.
export function spawnLoadLong(spawn: StructureSpawn): number {
    const mem = getMem(spawn);
    return longPerTick(mem.busy, kBusyScale, mem);
}

// Creeps the spawn started per CREEP_LIFE_TIME ticks, recent average.
export function spawnRate(spawn: StructureSpawn): number {
    const mem = getMem(spawn);
    const [n, t] = shortParts(mem.born, mem);
    return n / t * CREEP_LIFE_TIME;
}

// Creeps the spawn started per CREEP_LIFE_TIME ticks, long-run ema.
export function spawnRateLong(spawn: StructureSpawn): number {
    const mem = getMem(spawn);
    return longPerTick(mem.born, kBornScale, mem) * CREEP_LIFE_TIME;
}

// Room and global aggregates. null when there is no spawn in scope: that is
// "cannot spawn", which a caller must not mistake for an idle 0.
export const roomSpawnLoad = (roomName: string) => loadOf(roomSpawns(roomName));
export const roomSpawnLoadLong = (roomName: string) => loadLongOf(roomSpawns(roomName));
export const roomSpawnRate = (roomName: string) => rateOf(roomSpawns(roomName));
export const roomSpawnRateLong = (roomName: string) => rateLongOf(roomSpawns(roomName));
export const globalSpawnLoad = () => loadOf(allSpawns());
export const globalSpawnLoadLong = () => loadLongOf(allSpawns());
export const globalSpawnRate = () => rateOf(allSpawns());
export const globalSpawnRateLong = () => rateLongOf(allSpawns());

const pct = (v: number | null) => v === null ? "-" : `${Math.round(v * 100)}%`;
const num = (v: number | null) => v === null ? "-" : v.toFixed(1);

// Console table (global spawnLoads() in main.js): load short/long, then
// creeps per CREEP_LIFE_TIME short/long, for everything, each room, each spawn.
export function report(): string {
    const row = (label: string, l: number | null, ll: number | null, r: number | null, rl: number | null) =>
        `${label}: load ${pct(l)}/${pct(ll)} rate ${num(r)}/${num(rl)}`;
    const lines = [row("global", globalSpawnLoad(), globalSpawnLoadLong(), globalSpawnRate(), globalSpawnRateLong())];
    const rooms = _.groupBy(allSpawns(), s => s.room.name);
    for (const roomName of _.keys(rooms).sort()) {
        lines.push(row(roomName, roomSpawnLoad(roomName), roomSpawnLoadLong(roomName),
            roomSpawnRate(roomName), roomSpawnRateLong(roomName)));
        for (const s of rooms[roomName]) {
            lines.push(row(`  ${s.name}`, spawnLoad(s), spawnLoadLong(s), spawnRate(s), spawnRateLong(s)));
        }
    }
    return lines.join("\n");
}
