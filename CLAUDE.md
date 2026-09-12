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
| `GlobalRespawn` mission | `Memory.scheduler.services`, replayed by `Service.boot()` at every global reset; **never constructed in code** | lays eggs for startup/asrc/bsrc/hauler/worker/ctrl/hub in `Game.spawns.Home`'s room and runs those creeps |
| `ClaimedStrat` per owned room | `room.strat` constructor `exec`s itself | towers, safe mode, labs, links, metastruct construction, factory |
| `FlagService` daemon | `@daemon` at import | orange genesis flags -> metastruct planning |
| `SpawnDaemon` | `@daemon` at import | turns eggs into `spawnCreep` |

Consequences: no market automation, radar scanning, deposit farming, power
creeps, or flag "teams" run on this build even though their code loads. The only
flags in the game are metastruct genesis/child flags. `Swipe` is the only other
mission and is registered but not scheduled.

## Architecture in one screen

```
main.js
 ├─ process.ts      Process/Service, priority rows critical>normal>low>late(>extra), canRun CPU gate
 ├─ mission.ts      Mission = Service with eggs->hatch->creeps lists in Memory.missions
 │   └─ ms.globalrespawn.ts / ms.swipe.ts        @register, scheduled by command string
 ├─ mycreep.ts      MyCreep wrapper per creep name; role registry (@register/@registerAs); Task2
 │   ├─ job.creep.ts -> job.startup/reboot/scout/swiper.ts
 │   └─ job.role.ts  -> job.worker/ctrl/hub/hauler/srcer.ts   start() = creep.run()+after()  (bridge)
 ├─ spawn.ts        SpawnDaemon + energyDef; spawnold.js supplies findSpawns/buildBody body table
 ├─ creep.role.ts   dispatch: creep name "asrc3" -> role "asrc" -> Creep.prototype.roleAsrc()
 │   creep.ts > creep.role.ts > creep.move.ts > creep.carry.ts > creep.harvest/build/repair.ts (mixins)
 │   role.*.ts (@injecter) and role.*.js (lib.merge via main.js `mods`) add roleXxx/afterXxx
 ├─ strat.ts        NullStrat/ClaimedStrat per room (also processes)
 ├─ metastruct.ts   base templates + flag-driven planning + construction upkeep + maxHits + spot lookup
 ├─ struct.link/tower/lab/factory/terminal/container/controller  structure logic and prototype helpers
 ├─ Rewalker.ts     movement engine (matrix.js is dead)
 ├─ cache.ts / debug.ts / roomobj.ts / lib.js / shed.ts   infrastructure
 └─ intel.ts / radar.ts / market.ts / deposit.ts          intel is live; the rest only registers
```

Docs: [missions-and-jobs](docs/missions-and-jobs.md),
[spawning](docs/spawning.md), [creep-roles](docs/creep-roles.md),
[metastruct](docs/metastruct.md), [room-and-structures](docs/room-and-structures.md),
[movement](docs/movement.md), [memory-layout](docs/memory-layout.md).

## Live creep roles

`startup`/`reboot` (`role.bootstrap.js`), `worker` (`role.worker.js`), `ctrl`
(`role.ctrl.js`), `hauler` (`role.hauler.js`), `hub` (`role.hub.ts`),
`asrc`/`bsrc` (`role.src.ts`). Everything else with a `roleXxx` method is
loaded but no job spawns it. Table and task conventions in
[docs/creep-roles.md](docs/creep-roles.md).

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
--stack "process:60:50"` maps stack tokens to `.ts` lines; `npx gulp consoleLog`
records console output to `logs/`. Never run `gulp fetch` casually (overwrites
`src/*.js` from the server). `gulp sim`/`swc`/`plus` push raw JS and cannot
run the TS code. Details: [docs/build-and-deploy.md](docs/build-and-deploy.md).

## Console essentials

```js
scheduleService('GlobalRespawn')      // persists in Memory; replayed by Service.boot()
spawnService('Swipe W5N8 W6N8')       // runs only until the next global reset
require('process').Service.getType('GlobalRespawn').kill()   // stops it now
Game.creeps.asrc0.debug = 500; Memory.debug = true           // per-creep / global dlog
Game.flags.genesis.setColor(COLOR_ORANGE, COLOR_YELLOW)      // plan metas; GREEN commits
```

More in [docs/console-operations.md](docs/console-operations.md), including the
destructive `wipe`/`worldWipe`/`scalp`/`purgeWalls` helpers.

## Memory keys you will touch

`Memory.scheduler.services`, `Memory.missions[name]`, `Memory.creeps[name]`
(`nest`, `home`, `task`, `task2`, `_walk`), `Memory.rooms[x].{intel, meta,
links, labs, spots, containers}`, `Memory.intel`, `Memory.flags[genesis].newer`,
`Memory.debug`. Shapes in [docs/memory-layout.md](docs/memory-layout.md).

## Known traps (full list in docs/known-issues.md)

- A room claimed after first sight keeps `NullStrat` until reset (`evolve()`
  always returns `null`).
- `GlobalRespawn` throws every tick unless a spawn is literally named `Home`.
- `afterWorker` exists in both `role.worker.js` (wins) and `role.mason.ts`.
- `struct.tower.js` imports a non-existent `dynMaxHits`; only the storage
  > 800k overheal branch hits it.
- `Game.terminals`/`Game.storages`/`Game.ncreeps` are referenced but never
  defined (dead paths only).
- `room.turtle` / `room.wallMax` do not exist; `taskTurtle*` in live roles
  degrade silently.
- Hardcoded MMO rooms (`W29N11`, `W21N15`, ...) and username `deft-code`
  remain in dead code and `routes.isHostile`/`controller.reservable`.

## Legacy and orphans

`team.ts`/`team.egg.js` (flag teams), `spawnold.run`, `room.keeper.js`,
`planner.js`, `powercreep.ts`, `struct.terminal.run`, `matrix.js`,
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
| [docs/metastruct.md](docs/metastruct.md) | base layouts, genesis flag protocol, construction order, maxHits |
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
