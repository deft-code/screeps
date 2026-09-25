# Screeps AI (deft-code/screeps)

Game AI for [Screeps](https://screeps.com), 2017-2026, ~19k lines in `src/`
(64 TypeScript, 71 JavaScript). Compiled with gulp-typescript to `distjs/` and
pushed with gulp-screeps. **Current target: Season 11 (`shardSeason`)**; the
code also accepts MMO `shard2` and refuses every other shard.

Detailed docs live in `docs/`. Read the one that matches your task before
grepping: most function names you find have two or three implementations from
different eras, and only one is live.

## Read this first: what is actually running

`src/main.js` has an unconditional `return` at line 355. The live loop is:

```
shard guard -> genPixels (shard2 only)
run(rooms, 500, r => r.strat.init())   # hostile lists + intel per visible room
process.runAll()                       # everything else happens here
return                                 # lines 356-439 are dead
```

`process.runAll()` runs a priority table of processes
([docs/runtime-tick.md](docs/runtime-tick.md)):

| process | how it gets there | does |
|---|---|---|
| `Hub <room>` missions (W26S8, W25S7, and `Hub W27S5` scheduled 23 Sept 2026 ahead of its claim; `Hub W22S7` wound down by the W22S7 teardown) | `scheduleService('Hub W25S7')`, then `Memory.scheduler.services`, replayed by `Service.boot()` at every global reset; **never constructed in code** | lays eggs for asrc/bsrc/hauler (1-3 by dropped energy)/worker/ctrl/hub/upgrader/ctrlhauler from the room's own spawns and runs those creeps |
| `GlobalRespawn` mission | **not scheduled** since Sept 2026 (evolved into `Hub W26S8`); schedule it by hand after a respawn | the Hub loop plus `max(1, 6-rcl)` startups and a fixed 2 haulers, in `Game.spawns.Home`'s room; `evolve('Hub <room>')` it once the room stands |
| `Remote <farm> <home> [spawn]` missions (5) | scheduled, same way | remote sources: harvester/trucker/reserver/scout, plus guard/mini/wolf against hostiles and invader cores |
| `Reactor <home>` missions | not scheduled as of 22 Sept 2026 (replaced by `ReactorDepot W25S7`); `scheduleService('Reactor W26S8')` brings one back | Season 11 scoring: scout, warboys (thorium runners), immortan (reactor claimer), guard at the sector core, plus one toxic (bait-and-trap mini) per lifetime while an armed enemy without HEAL is there |
| `ReactorDepot <home> [cap]` mission | scheduled (`ReactorDepot W25S7`, since 22 Sept 2026), same way | `Reactor` with warrunners in place of warboys: they load thorium from the home terminal (laid only while it holds over 1000) and carry it to the reactor; scout, guard, immortan and the core pause are inherited |
| `Thormine <room> [dest]` mission | scheduled (`Thormine W22S7`, since 22 Sept 2026; its thorium ran out and the **teardown of W22S7 began 23 Sept 2026**), same way | one thoreater per walkable tile beside the room's thorium (only with thorium left, an extractor on it and a terminal); they mine into the terminal, which ships to `dest` (default W25S7) every cooldown. Once the thorium is exhausted and the terminal empty it **tears the room down**: winds down every mission homed there, drains all energy into the terminal with `cleanup` creeps, ships it, destroys every structure and unclaims (`abortTeardown()` works until destruction starts) |
| `Startup <room> [home]` mission | scheduled (`Startup W27S5`, since 22 Sept 2026; `Startup W22S7` wound down at RCL4), same way | claiming a third room: scout, claimer, pioneers, guard until it has a tower. With GCL full it plans (and draws, yellow dashed) a Rewalker-costed road from the controller to the home spawn instead of laying a claimer, saves its ends in each room as `rroad_<room>_startup` traffic entries (in the room itself: to the sources and the controller) that each room's MetaManager turns into roads, and sends pavers to unowned rooms with sites; a foreign reservation draws reservers while GCL is full; an invader core in the room draws a wolf every 1500 ticks |
| `ClaimedStrat` per owned room | `room.strat` constructor `exec`s itself | towers, safe mode, labs, links, metastruct construction (traffic replans included), factory |
| `FlagService` daemon | `@daemon` at import | orange genesis flags -> metastruct planning; purple flags -> transient services named by the flag (`Swipe_W4N3_W3N4`) |
| `SpawnDaemon` | `@daemon` at import | turns eggs into `spawnCreep` |
| `SpawnTelemetry` | `@daemon` at import (`spawnload.ts`) | per-spawn busy ticks and creeps started, 500-tick windows in `Memory.spawns`; `spawnLoads()` prints it |

Consequences: no market automation, radar scanning, deposit farming, or flag
"teams" run on this build even though their code loads. The only
flags in the game are metastruct genesis/child flags (genesis `Home` W26S8,
`Port` W25S7, `Forth` W27S5; `Three` W22S7 went with that room) and purple service flags. Missions exist only
while scheduled: the table is `Memory.scheduler.services` as of Sept 2026, so
read that key rather than trusting this list. `Farm`, `Once`, `Swipe` and the
`Selloff <room>` terminal-selling service are not scheduled and run only by
command string or a purple flag ([docs/missions-and-jobs.md](docs/missions-and-jobs.md)).

## Architecture in one screen

```
main.js
 ├─ process.ts      Process/Service, priority rows critical>normal>low>late(>extra), canRun CPU gate
 ├─ mission.ts      Mission = Service with eggs->hatch->creeps lists in Memory.missions
 │   └─ ms.globalrespawn / hub / startup / farm / remote / reactor / swipe .ts   @register, scheduled by command string
 ├─ mycreep.ts      MyCreep wrapper per creep name; role registry (@register/@registerAs); Task2
 │   ├─ job.creep.ts -> job.startup/reboot/scout/swiper/warboy.ts      pure Task2 jobs (this.c is the Creep)
 │   └─ job.role.ts  -> job.worker/ctrl/hub/hauler/srcer/guard/immortan.ts   start() = creep.run()+after()  (bridge)
 ├─ spawn.ts        SpawnDaemon + energyDef; spawnold.js supplies findSpawns/buildBody body table
 ├─ creep.role.ts   dispatch: creep name "asrc3" -> role "asrc" -> Creep.prototype.roleAsrc()
 │   creep.ts > creep.role.ts > creep.move.ts > creep.carry.ts > creep.harvest/build/repair.ts (mixins)
 │   role.*.ts (@injecter) and role.*.js (lib.merge via main.js `mods`) add roleXxx/afterXxx
 ├─ strat.ts        NullStrat/ClaimedStrat per room (also processes)
 ├─ metastruct.ts   base templates + flag-driven planning + construction upkeep + maxHits + spot lookup
 │   └─ metatraffic.ts  road planner: metas declare traffic() src/dest entries, MetaManager plans the room's roads
 ├─ struct.link/tower/lab/factory/terminal/container/controller  structure logic and prototype helpers
 ├─ Rewalker.ts     movement engine (matrix.js is dead)
 ├─ cache.ts / debug.ts / roomobj.ts / lib.js / shed.ts   infrastructure
 ├─ reactor.ts      Season 11 helpers: sectorCore, findReactors, thoriumMineral, RESOURCE_THORIUM typing
 └─ intel.ts / radar.ts / market.ts / deposit.ts          intel is live; the rest only registers
```

Docs: [missions-and-jobs](docs/missions-and-jobs.md),
[spawning](docs/spawning.md), [creep-roles](docs/creep-roles.md),
[metastruct](docs/metastruct.md), [room-and-structures](docs/room-and-structures.md),
[movement](docs/movement.md), [memory-layout](docs/memory-layout.md).

## Live creep roles

`startup`/`reboot` (`role.bootstrap.js`), `worker` (`role.worker.js`), `ctrl`
(`role.ctrl.js`), `hauler` (`role.hauler.js`), `hub` (`role.hub.ts`),
`asrc`/`bsrc` (`role.src.ts`), `upgrader` (`job.upgrader.ts`, only while RCL < 8 and
storage >= 100k energy), `ctrlhauler` (`job.ctrlhauler.ts`, storage -> ctrl container
while storage >= 100k and container + ctrl creep are empty). Those are the
base-room roles from `GlobalRespawn`/`Hub`. The scheduled missions add pure
job-layer creeps (no `roleXxx` method): `harvester`, `trucker`, `reserver`
(`Remote`); `warboy`, `immortan` (`Reactor`); `warrunner` (`ReactorDepot`); `thoreater`, `cleanup` (`Thormine`); `claimer`, `pioneer` (`Startup`);
and `scout`, `guard`, `mini`, `wolf` wherever a mission wants vision or a
fight; `toxic` (`job.toxic.ts`, bait-and-trap mini) only by `Once Toxic <room> [count]`. Everything else with a `roleXxx` method is loaded but no job spawns it.
Table and task conventions in [docs/creep-roles.md](docs/creep-roles.md).

## Conventions that code depends on

- Creep name = `role` + integer; role = first word lowercased. `roleXxx` /
  `afterXxx` methods are found by `_.camelCase`.
- Method prefixes: `task*` persistent and self-restarting via `checkId`/
  `checkFlag` into `memory.task`; `go*` one intent, optional move; `idle*` no
  move. Return `TaskRet`: truthy string while busy, `false` when done.
  `Task2Ret` (`"again"|"start"|"wait"|false`) in the job layer.
- Set `this.intents.<kind>` after a successful intent; check it before another.
- Prototype extension: `@extender` (class extends the game class), `@injecter(Klass)`,
  `lib.merge(Klass, Mixin)`, or direct `Klass.prototype.x =`. Later merges win.
- Registries by decorator: `@register`/`@registerAs` (jobs, missions), `@daemon`,
  `@registerMeta`. Mission module must be `ms.<lowercase>.ts`.
- `obj.tick` (per tick) and `obj.cache` (tens of ticks) on Room/RoomObject;
  `Memory` only for what must survive a global reset.
- Bare module names (`import 'strat'`, `require('role.x')`); every `src/`
  basename must be unique; no subdirectories.
- Three coding styles coexist (2017 standard-style JS, 2019 TS decorators,
  2022 TS jobs). New behaviour goes in the 2022 style; see
  [docs/conventions-and-styles.md](docs/conventions-and-styles.md) including a
  legacy-role -> job migration recipe.

## Build & deploy

`npm install`; copy `blank_credentials.js` to `credentials.js` (gitignored).
`npx gulp season` compiles and pushes to the seasonal server (current target);
`deploy` = MMO, `ptr` = PTR, `watchSeason` = on change. `npx gulp decodeStack
--stack "process:60:50"` maps stack tokens to `.ts` lines; `npx gulp console` and
`consoleTail` reach the live console from the shell (next section). Never run `gulp fetch` casually (overwrites
`src/*.js` from the server). `gulp sim`/`swc`/`plus` push raw JS and cannot
run the TS code. Details: [docs/build-and-deploy.md](docs/build-and-deploy.md).

## Console from the shell (for Claude)

Two gulp tasks reach the live game console without the web client, so game
state can be inspected, and changed, from this terminal. Implementation:
`console-tools.js` (auth is `credentials.token`). Both default to the season
world and its `shardSeason` shard.

```
npx gulp console --cmd "Game.time"                  # send one expression, print that tick's console output, exit
echo 'JSON.stringify(Memory.missions)' | npx gulp console    # expression on stdin (no quoting fights)
npx gulp consoleTail                                # stream to stdout + logs/console-season.log until Ctrl+C
SCREEPS_CONSOLE_SECONDS=30 npx gulp consoleTail     # ...or stop after 30 s
npx gulp room --room W25S5                          # every object in a room, vision or not (--json for the raw response)
```

How to read the output:

- Locations are translated back to `src/` with `sourcemaps/`: `process:60:50`
  in a stack trace prints as `src/process.ts:90:18`, and the `file:line#func`
  prefix that `debug.ts` `log`/`dlog`/`warn` put on every line prints as
  `src/mission.ts:316#nCreeps`. The maps are from the last `gulp compile`, so
  push (`npx gulp season`) after editing `src/` before trusting line numbers.
- Command results are the lines starting with `< `. The game stringifies
  results, so wrap objects in `JSON.stringify(...)` or `[object Object]` comes
  back. The log lines above the result are the same tick's `console.log`
  output, so a quiet expression still shows what the loop printed that tick.
- HTML the console emits (room links, colours) is stripped.
  `SCREEPS_CONSOLE_RAW=1` prints the server text untouched.
- `consoleTail` lines carry `HH:MM:SS [shard]`. The file is appended to and
  rotates to `console-season.1.log` ... `.5.log` at 5 MiB
  (`SCREEPS_LOG_MAX_BYTES`, `SCREEPS_LOG_KEEP`). `logs/` is gitignored.

Recipe for iterating on game state:

1. Ask with `npx gulp console --cmd "..."`. The expression runs inside the
   game VM at the start of the next tick with full access: `Memory.creeps.hauler0`,
   `require('process').Service.getType('GlobalRespawn').status()`, `lsProcess()`,
   or anything in [docs/console-operations.md](docs/console-operations.md).
   Assignments and calls take effect in the live game, so treat anything that
   is not a read as a change and check with the user before the destructive
   helpers.
2. To watch behaviour over several ticks, run `consoleTail` in the background
   and read `logs/console-season.log`, or run it in the foreground with
   `SCREEPS_CONSOLE_SECONDS`.
3. After changing code, `npx gulp season` pushes and forces a global reset. A
   running tail survives the reset and reconnects if the websocket drops.

Quoting: PowerShell wants double quotes and no `$`; bash wants single quotes;
anything needing both kinds of quote goes through stdin. The `VAR=value npx
gulp ...` prefix above is bash syntax; in PowerShell set `$env:VAR = value` on
the line before. Other knobs:
`SCREEPS_WORLD=season|ptr|mmo`, `SCREEPS_SHARD` (also filters the tail),
`SCREEPS_CONSOLE_TIMEOUT` (seconds to wait for a result, default 30; the task
exits 1 on timeout, which usually means the script is not running on that shard).

Debugging the live game (patterns that worked):

- Results only: `echo '<expr>' | npx gulp console 2>&1 | grep "^< "`. Stdin with
  single quotes outside and double inside avoids every quoting fight.
- **No `< ` line means the expression threw** (typically a null deref such as
  `getService(x).status()` after that mission was killed). Rerun null-safe, or
  drop the grep and `| tail -5` to see the tick's output.
- Rates and movement: sample in a loop, `for i in 1 2 3; do echo '...' | npx gulp
  console 2>&1 | grep "^< "; done`. Calls land ~2 ticks apart; include
  `Game.time` in the result. Measure before theorising: a "repathing loop" was a
  creep standing still in `engage()`, and "x2 aging" was really x3.
- Any module is requirable by bare name in the console, so verify code right
  after a push: `require("job.warboy").Warboy.body`,
  `require("spawnold").buildBody(Object.values(Game.spawns),{body:"immortan"},{maxRCL:8})`
  (returns `[spawn, body]`), `require("reactor").findReactors(Game.rooms.W25S5)[0].store`.
- Push and check in one line: `npx gulp season 2>&1 | grep -i "error\|Committed"`.
  `Committed` = pushed; any `error` line is a TS error that did **not** stop the
  push. `npx gulp compile` compiles without pushing.
- Every push is a global reset: module-level state (memo `Map`s, constants
  edited in-game) is rebuilt from source, `Memory` (creep memory included)
  survives. Pushes are rate limited (the `RateLimiting: (N/240 ...)` counter in
  the output), so batch edits rather than pushing per line.
- `memory.task2` often reads `null` from the console even while `@task`s run;
  judge a creep by position, store and TTL across ticks instead.
- The log lines above the result are greppable by their `file:line#func` tag,
  e.g. `| grep "#runGenesis"` shows the planned `mem:` JSON after a YELLOW.

## Console essentials

```js
scheduleService('GlobalRespawn')      // persists in Memory; replayed by Service.boot()
spawnService('Swipe W5N8 W6N8')       // runs only until the next global reset
require('process').Service.getType('GlobalRespawn').kill()   // stops it now
Game.creeps.asrc0.debug = 500; Memory.debug = true           // per-creep / global dlog
Game.flags.genesis.setColor(COLOR_ORANGE, COLOR_YELLOW)      // plan metas; GREEN commits
getService('Reactor W26S8').status()          // getService = Service.getType; null once killed
getService('Reactor W26S8').layEgg('warboy')  // one extra egg (lowercased job class); nJobs never culls it
getService('Reactor W25S7').windDown()        // purge eggs, run creeps to death, kill + deschedule
scheduleService('Reactor W25S7')              // bring it back
Game.rooms.W25S7.createFlag(30, 29, 'reactor_Port', COLOR_GREY, COLOR_GREY)  // child flag, then YELLOW, check log, GREEN
```

Genesis flags reset themselves to CYAN (secondary `4`) when a command is done.
Remove a stuck egg: `delete Memory.creeps.warboy0` and `_.pull` it from
`Memory.missions[m].eggs`.

More in [docs/console-operations.md](docs/console-operations.md), including the
destructive `wipe`/`worldWipe`/`scalp`/`purgeWalls` helpers.

## Season 11 state and rules (measured live, Sept 2026)

- Owned rooms, both RCL6: `W26S8` (spawn `Home`, genesis flag `Home`) and
  `W25S7` (genesis `Port`). Their sector core is `W25S5` (an x5y5 room is
  `Kind.Portal` in `intel.ts`). Since 22 Sept 2026 the reactor is fed by
  `ReactorDepot W25S7` (warrunners from the W25S7 terminal, which `Thormine
  W22S7` fills); neither `Reactor` mission is scheduled. The walk to the
  reactor is ~240 ticks from W26S8, ~120 from W25S7.
- Rooms hold two minerals, an ordinary one and thorium (`RESOURCE_THORIUM` =
  `"T"`), but `CONTROLLER_STRUCTURES.extractor` is 1 at every RCL. Extractors
  are planned structs now: `Meta_reactor` (thorium, priority 10) outranks
  `Meta_min`; there is no mineral scan outside the metas.
- Thorium aging: a creep loses `1 + floor(log10(thorium on its tile))` TTL per
  tick. Cargo, piles, tombstones and ruins on the tile all count; under 10 is
  free, 100-999 is 3/tick. A loaded warboy's 1500 TTL is ~500 real ticks.
- Reactor (`findReactors(room)[0]`): holds 1000, burns 1/tick, `continuousWork`
  resets the tick it runs dry. Anyone with a CLAIM part can `claimReactor` an
  owned reactor (we lost it once), hence the standing Immortan.
- `transfer` with no amount is `ERR_FULL` unless the whole load fits; pass
  `min(carried, getFreeCapacity)`. `pickup` has no amount at all (takes up to
  free capacity); only `withdraw` can be limited.
- Spawn energy is the real bottleneck at RCL6: a 2250-energy warboy queues
  behind guards/immortans from the same room, so lead time is ~600-700 ticks.

## Memory keys you will touch

`Memory.scheduler.services`, `Memory.missions[name]`, `Memory.creeps[name]`
(`nest`, `home`, `task`, `task2`, `_walk`), `Memory.rooms[x].{intel, meta,
links, labs, spots, containers}`, `Memory.intel`, `Memory.flags[genesis].newer`,
`Memory.spawns[name]` (spawn telemetry, `spawnload.ts`; read it with
`spawnLoads()`), `Memory.debug`. Shapes in [docs/memory-layout.md](docs/memory-layout.md).

## Known traps (full list in docs/known-issues.md)

- A room claimed after first sight keeps `NullStrat` until reset (`evolve()`
  always returns `null`).
- `GlobalRespawn` (unscheduled, see above) uses the spawn named `Home`, else the first spawn in `Game.spawns`; with no spawns at all it throws every tick.
- `afterWorker` exists in both `role.worker.js` (wins) and `role.mason.ts`.
- `struct.tower.js` imports a non-existent `dynMaxHits`; only the storage
  > 800k overheal branch hits it.
- `Game.terminals`/`Game.storages`/`Game.ncreeps` are referenced but never
  defined (dead paths only).
- `room.turtle` / `room.wallMax` do not exist; `taskTurtle*` in live roles
  degrade silently.
- Hardcoded MMO rooms (`W29N11`, `W21N15`, ...) and username `deft-code`
  remain in dead code and `routes.isHostile`/`controller.reservable`.
- `MetaManager.purge(STRUCTURE_EXTRACTOR)` destroys a built extractor no meta
  claims, the first time a meta's extractor site hits `ERR_RCL_NOT_ENOUGH`.
  Plan `min`/`reactor` on the tile the extractor already occupies.
- `room.enemies` includes Source Keepers and unarmed scouts; `room.hostiles` is
  the armed subset. Gate spawning on `hostiles`, and filter `creep.keeper` for
  anything walking through an SK room.

## Legacy and orphans

`team.ts`/`team.egg.js` (flag teams), `spawnold.run`, `room.keeper.js`,
`planner.js`, `struct.terminal.run`, `matrix.js`,
and 30-odd `role.*.js` files are loaded but not driven.
`FindRoute.ts`, `PriorityQueue.js`, `history.ts`, `memprof.ts`, `memhack.js`,
`profiler.ts`, `role.js`, `role.legacy.js`, `role.recycle.ts`, `server.js`,
`stack.js`, and the root `hacking.js`/`markethack.js` are not imported at all.
Status of every file: [docs/file-inventory.md](docs/file-inventory.md); what the
legacy systems did: [docs/legacy-systems.md](docs/legacy-systems.md).

## Working on this repo

- Before changing a function, check `docs/file-inventory.md` for whether it is
  live, reachable, dead, or orphaned; grep alone will mislead you.
- Prefer adding a `job.*.ts` class over extending `role.*.js`. Keep role
  methods on `Creep.prototype` until a Task2 port exists.
- Keep `main.js` import order: TS roles before the `mods` loop, and
  `process.Service.boot()` after every `@register`.
- Compile errors do not stop `gulp season`; check the gulp output.
- `spike/` plus `tsconfig.spike.json` is a compile-only prototype of
  [docs/tcreep-design.md](docs/tcreep-design.md). Nothing imports it and
  `gulp` never sees it; check it with `npx tsc -p tsconfig.spike.json` and
  re-run `node spike/surface.js` after moving creep code.
- The previous `CLAUDE.md` pointed at planning notes in `~/screeps`; that
  directory is not present on this machine.

## Docs index

| doc | when to read |
|---|---|
| [docs/runtime-tick.md](docs/runtime-tick.md) | anything about "what runs when", CPU, process rows |
| [docs/missions-and-jobs.md](docs/missions-and-jobs.md) | adding/changing missions or jobs, egg lifecycle |
| [docs/spawning.md](docs/spawning.md) | bodies, spawn selection, priorities, naming |
| [docs/creep-roles.md](docs/creep-roles.md) | role dispatch, mixin chain, task conventions, role tables |
| [docs/metastruct.md](docs/metastruct.md) | base layouts, genesis flag protocol, construction order, maxHits, traffic (roads) |
| [docs/traffic-design.md](docs/traffic-design.md) | why and how roads became a MetaManager service, and the migration from `Meta_traffic`/tile-holding `rroad` legs |
| [docs/room-and-structures.md](docs/room-and-structures.md) | strat, towers, links, labs, factory, terminal, intel |
| [docs/movement.md](docs/movement.md) | Rewalker, route costs, xy packing |
| [docs/conventions-and-styles.md](docs/conventions-and-styles.md) | the three eras, decorators, naming, migration recipe |
| [docs/memory-layout.md](docs/memory-layout.md) | every `Memory` key and shape |
| [docs/legacy-systems.md](docs/legacy-systems.md) | teams, keeper/planner, market, radar, power creeps, orphans |
| [docs/file-inventory.md](docs/file-inventory.md) | status of every file |
| [docs/known-issues.md](docs/known-issues.md) | latent bugs and hardcoded state |
| [docs/console-operations.md](docs/console-operations.md) | in-game console commands |
| [docs/build-and-deploy.md](docs/build-and-deploy.md) | gulp tasks, sourcemaps, credentials |
| [docs/tcreep-design.md](docs/tcreep-design.md) | the wrapper-class migration: `TCreep`/`TStruct` design, retirement, coexistence path, per-file plan |
