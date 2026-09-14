# Runtime: What Actually Runs Each Tick

Entry point: `src/main.js` (`module.exports.loop = main`). This file is mostly
history. The live path is short, and everything after the `return` on
`src/main.js:353` is dead code. Read this doc before trusting anything you find
by grepping for a function name.

## Module load (global reset)

Screeps re-executes module bodies on every global reset (code push, or the
server recycling the VM). Order in `main.js`:

1. `debug`, `shed`, `cache` are imported; `cache.injectAll()` adds the `tick` and
   `cache` properties to `Room` and `RoomObject` prototypes.
2. `process` is imported and the two console helpers are defined:
   `global.spawnService(cmd)` -> `Service.spawn` (runs until the next global
   reset) and `global.scheduleService(cmd)` -> `Service.schedule` (also recorded
   in `Memory.scheduler.services`, so `boot()` replays it after a reset). Both
   are arrow wrappers, so they resolve `process` lazily and keep `this` bound to
   `Service`.
3. `strat`, `ms.globalrespawn`, `ms.swipe`, `service.flag`, the `job.*` modules,
   the `role.*.ts` modules, `deposit`, `Visual`, `metastruct`, `mission`,
   `matrix`, `flag`, `console`, `constants`, `path`, `room`,
   `room.keeper`, `source`, `constructionsite`, `tombs`, `struct.*`, `market`,
   `team`, `team.egg`, `powercreep`, `creep`, `lib`, `spawnold`, `role.shunt`,
   `markethack`, `radar`, `intel` are imported. Each one's side effects run:
   prototype extensions, decorator registrations, `@daemon` instantiation,
   `Memory.*` defaulting, and `markethack.enable()` patching `Object.prototype`.
4. The `mods` array (`src/main.js:79-123`) lists 39 legacy JS mixins (5
   `creep.*.js`, 34 `role.*.js`). Each is `lib.merge`d onto `Creep.prototype`.
   Because this runs *after* the TS `role.*.ts` imports, a JS method wins any
   name collision (`afterWorker` is the one real collision).
5. `process.Service.boot()` re-instantiates every service named in
   `Memory.scheduler.services`. This is how `GlobalRespawn` comes back after a
   reset: it is never constructed anywhere in code.
## The loop (`main()`, `src/main.js:338`)

```
if shard not in {shard2, shardSeason}: log "WRONG SHARD", return
if shard2: genPixels()                      # bucket==10000 and >1500 ticks since reset
run(rooms, 500, r => r.strat.init())        # shed.run: shuffled, CPU/bucket guarded
process.runAll()
return                                      # <-- everything below is dead
```

### `strat.init()` per visible room (`src/strat.ts`)

`room.strat` is a cached `IStrat` per room name, created on first access:
`ClaimedStrat` if `controller.my`, `ActiveStrat` if the unclaimed room has
metas in memory, else `NullStrat`; `evolve()` swaps between them
([room-and-structures.md](room-and-structures.md)). The constructor calls
`exec(this, "low")`, which enqueues the strat into the process table, so
**strats are processes too** and their `run()` executes inside `runAll()`.

`init()` (both kinds):
- `legacyInit`: counts structures into `room.memory.nstructs`, builds
  `room.allies / enemies / hostiles / assaulters / melees` arrays from
  `FIND_CREEPS`, and ratchets `room.memory.t{hostiles,assaulters,enemies}`
  counters plus `*time` stamps (reset to 0 after 10 quiet ticks).
- `updateIntel(room)`: writes `Memory.rooms[name].intel` (owner, RCL, invader
  core, highway deposits/power banks).
- `ClaimedStrat` also registers RCL8 observers with `theRadar` and the room with
  `theMarket` (both only fill per-tick caches; their `run()` methods are dead).

`shed.run` stops early if CPU used exceeds 300 or the bucket is low. A room whose
`init()` was skipped has no `room.hostiles` array, and its strat `run()` will
throw in `runTowers`; `runRow` catches and defers it.

### `process.runAll()` (`src/process.ts:159`)

Six priority rows: `critical`, `normal`, `low`, `late`, `extra`, `kill`.

```
runRow("critical", 50)
runRow("normal",   Game.cpu.limit + 50)
runRow("low",      2000)
runRow("late",     1000)
every random(0..200) ticks: runRow("extra", 9000)
# "kill" is never run: a process that returns "kill" is silently dropped
```

`runRow` empties the row, runs each process (the first unconditionally, the rest
only if `canRun(max(rowMin, proc.bucket))`), and re-queues each into the row
named by its `run()` return value. Throwing processes are logged, sent via
`Game.notify`, and deferred to the same row. Deferred and re-queued processes
are shuffled.

`canRun(bucket)` (process.ts version, distinct from shed.ts): refuses when CPU
used exceeds `min(bucket + limit/2, 450)`, accepts when `bucket + (limit - used)
> threshold`, otherwise a lottery proportional to how close you are.

### Steady-state process table on Season 11

| Process | Source | Row after run | Bucket gate | Purpose |
|---|---|---|---|---|
| `GlobalRespawn` | `Memory.scheduler.services` | `critical` | 9000 | Mission for `Game.spawns.Home`'s room. Lays eggs, runs its creeps. |
| `Hub <room>` | `Memory.scheduler.services` | `critical` (`normal` while the room is not ours) | 9000 | Same loop for another owned room, without startup creeps. |
| `ClaimedStrat` x owned rooms | `room.strat` | `normal` | 9000 | Towers, safe mode, labs, links, metastruct upkeep, mineral timers, factory. |
| `ActiveStrat` x unclaimed rooms with metas | `room.strat` | `low` | 9000 | Every 10 ticks `room.meta.runUnowned()` places container/road sites for mission-planned metas. |
| `NullStrat` x other visible rooms | `room.strat` | `low` | 9000 | No-op run. |
| `FlagService` | `@daemon` in `service.flag.ts` | `low` | 8000 | Orange flags drive metastruct planning (`runGenesis`); orphan grey child flags are removed; purple flags spawn the non-mission service their name spells (`_` = space), kill it when the flag goes, and turn white/purple when the name spawns nothing or names a Mission. |
| `SpawnDaemon` | `@daemon` in `spawn.ts` | `late` | 2000 | Turns eggs into `spawnCreep` calls. |

Row ordering means: mission lays eggs (critical) -> rooms run (normal) -> flags
(low) -> spawner consumes eggs (late), all in one tick.

## Dead code after the `return`

These are still compiled and their modules still load, but nothing calls them:
tiered `strat.run/after/optional` scheduling, `powerCreeps` run, `spawnold.run`
(old flag-egg spawner), `terminals.run` (market automation), `flag.darkRun`
(flag teams), `powerHack`, `market.run`, `theRadar.run`, `depositRun`,
`hackAlloy`, `Memory.flags` cleanup, heap stats and `gc()`. Consequences: no
terminal trading, no observer scanning, no deposit farming, no power creeps on
the current build. See [legacy-systems.md](legacy-systems.md).
