# Runtime: What Actually Runs Each Tick

Entry point: `src/main.ts` (`export const loop = main`). Until 5 Nov 2026 it
was `main.js` and carried the 2017-2020 tick loop after an unconditional
`return`; that dead code is gone (docs/legacy-systems.md). The live path is
short. Read this doc before trusting anything you find by grepping for a
function name.

## Module load (global reset)

Screeps re-executes module bodies on every global reset (code push, or the
server recycling the VM). Order in `main.ts`:

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
   `Memory.*` defaulting, and `markethack.enable()` patching `Object.prototype`
   (every shard but `shardSeason`, whose market is switched off).
4. The legacy mixins are imported last: `creep.attack`, `creep.dismantle`,
   `creep.heal`, `creep.oldrepair`, `creep.work` and the 36 2017 `role.*`
   modules, each an `@injecter(Creep)` class copied onto `Creep.prototype` as
   it loads (until Nov 2026 a `mods` array of JS files `lib.merge`d here).
   Because this runs *after* the 2019 `role.*.ts` imports, a legacy method
   wins any name collision (`afterWorker` is the one real collision).
5. `process.Service.boot()` re-instantiates every service named in
   `Memory.scheduler.services`. This is how `GlobalRespawn` comes back after a
   reset: it is never constructed anywhere in code.
## The loop (`main()`, `src/main.ts`)

```
if shard not in {shard2, shardSeason}: log "WRONG SHARD", return
if shard2: genPixels()                      # bucket==10000 and >1500 ticks since reset
run(rooms, 500, r => r.strat.init())        # shed.run: shuffled, CPU/bucket guarded
process.runAll()
theRadar.run()                              # observers: serve observe requests, idle ones scan (Oct 2026)
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
- `ClaimedStrat` also adds RCL8 observers to `theRadar` as `TObserver`
  wrappers; `theRadar.run()` after `process.runAll()` serves the tick's
  observe requests (Capture's neighbours, deposit scouting) with them and
  sets idle ones scanning for stale rooms (`radar.ts`, live since Oct 2026).

`shed.run` stops early if CPU used exceeds 300 or the bucket is low. A room whose
`init()` was skipped has no `room.hostiles` array, and its strat `run()` will
throw in `runTowers`; `runRow` catches and defers it. The catch logs the process by `name`, not `toString()`: a `status()` that throws there would escape the loop and strand every later process of the row outside the table (they stay in `processes`, so `lsProcess` still lists them with a row) until the next global reset.

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

### Steady-state process table

The rows a running build settles into (Season 11 shape; the mission rows depend on what `Memory.scheduler.services` holds):

| Process | Source | Row after run | Bucket gate | Purpose |
|---|---|---|---|---|
| `GlobalRespawn` | `Memory.scheduler.services` | `critical` | 9000 | Mission for `Game.spawns.Home`'s room. Lays eggs, runs its creeps. Scheduled by hand after a respawn only. |
| `Hub <room>` | `Memory.scheduler.services` | `critical` (`normal` while the room is not ours) | 9000 | Same loop for an owned room, without startup creeps. |
| other missions | `Memory.scheduler.services` | per mission (`run()` return) | 9000 | `Remote`, `Startup`, `SkFarm`, `Capture`, ... (docs/missions-and-jobs.md). |
| `LabPlan <room>`, `Balance` | `Memory.scheduler.services` | `normal` | 9000 | creepless services: lab targets, terminal balancing. |
| `ClaimedStrat` x owned rooms | `room.strat` | `normal` | 9000 | Towers, safe mode, labs, links, metastruct upkeep, mineral timers, factory. |
| `ActiveStrat` x unclaimed rooms with metas | `room.strat` | `low` | 9000 | Every 10 ticks `room.meta.runUnowned()` places container/road sites for mission-planned metas. |
| `NullStrat` x other visible rooms | `room.strat` | `low` | 9000 | No-op run; once the room is out of sight it kills itself and drops its `GetStrat` cache entry, so rooms the observer scanned do not pile up in the row. |
| `FlagService` | `@daemon` in `service.flag.ts` | `low` | 8000 | Orange flags drive metastruct planning (`runGenesis`); orphan grey child flags are removed; purple flags spawn the non-mission service their name spells (`_` = space), kill it when the flag goes, and turn white/purple when the name spawns nothing or names a Mission. |
| `SpawnDaemon` | `@daemon` in `spawn.ts` | `late` | 2000 | Turns eggs into `spawnCreep` calls. |
| `SpawnTelemetry` | `@daemon` in `spawnload.ts` | `late` | 2000 | Per-spawn busy ticks and creeps started (`Memory.spawns`). |
| `MarketTracker` | `@daemon` in `market.ts` | `late` | 3000 | Refreshes the two resources furthest past their 100 +- 20 tick deadline (+20) each tick, so the price averages stay current for resources nobody asks about; reads the whole book every 500 ticks for new resources. ~0.1 CPU a tick. Nothing off-market. |
| `MarketWatch` | `@daemon` in `marketwatch.ts` | `late` | 3000 | One resource's daily market history a tick (every ~3 hours per resource) for the pump signature; every tick the book of each suspect; every 50 ticks the blacklist's rooms through intel and the radar. |
| `Trader` | `Memory.scheduler.services` | `low` | 9000 | Creepless market trader, dry run: evaluates five ruled resources a tick and books paper fills per scenario (~2 CPU a tick on shard2 with ~45 ruled resources). |

Row ordering means: mission lays eggs (critical) -> rooms run (normal) -> flags
(low) -> spawner consumes eggs (late), all in one tick.

## Dead code that followed the `return` (removed 5 Nov 2026)

Until the conversion to TypeScript, `main.js` kept the old tick after an
unconditional `return`: tiered `strat.run/after/optional` scheduling,
`powerCreeps` run, `spawnold.run` (old flag-egg spawner), `terminals.run`
(market automation), `flag.darkRun` (flag teams), `powerHack`, `market.run`,
`depositRun`, `hackAlloy`, `Memory.flags` cleanup, heap stats and `gc()`.
`theRadar.run()` was moved above the `return` in Oct 2026 and is live. The
rest is deleted from `main.ts` (unreachable code fails the compile); the
modules it called (`spawnold.run`, `struct.terminal.run`, `team.ts`, ...)
still load and are still unused. Consequences: no terminal trading, no
deposit farming, no power creeps on the current build. See
[legacy-systems.md](legacy-systems.md).
