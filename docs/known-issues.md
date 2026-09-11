# Known Issues and Latent Bugs

Found while tracing the code; none have been fixed. Ordered by how likely they
are to bite on the current build.

## Affects the live path

1. **Console helpers for scheduling are broken** (`src/main.js:11`, `:334`).
   `global.spawn = process.spawn` assigns `undefined` (the module exports
   `Service.spawn`, not a top-level `spawn`), and `console.schedule =
   process.Service.shedule` is a typo. Use
   `require('process').Service.schedule('Name')` instead.
2. **`kill()` does not stop a running service** (`src/process.ts:52`). It only
   removes the name from `Memory.scheduler.services` and the services map; the
   instance stays in the priority table until the next global reset. Nothing
   ever returns the `"kill"` row.
3. **`afterWorker` defined twice**: `src/role.worker.js` and
   `src/role.mason.ts:19`. The JS mixin is merged later in `main.js` and wins,
   which is the intended behaviour for workers, but the mason copy is
   unreachable and was probably meant to be `afterMason`.
4. **Strat never evolves** (`src/strat.ts:129,133`). `evolve()` returns `null`,
   so a room claimed after first sight keeps its `NullStrat` (no towers, labs,
   links, or metastruct upkeep) until a global reset.
5. **`spawnHatches` double-push** (`src/mission.ts:109`). A hatch whose creep
   disappeared is pushed to `done` and then, because `undefined?.spawning` is
   falsy, also pushed into `memory.creeps`; `runCreeps` removes it next tick
   with a spurious "Creep Died!" log.
6. **`Startup.spawn` / `Reboot.spawn` ignore the `spawns` argument** and use
   `_.sample(Game.spawns)`; fine with one room, wrong with several.
7. **`room.turtle` and `room.wallMax` do not exist** (`src/creep.oldrepair.js`).
   `taskTurtleMode` is always false; `taskTurtlePrep` only triggers on safe mode
   at RCL3+; `taskRepairWall`/`idleRepairRoad` compare against `undefined`.
   These are called by the live `roleWorker` and `roleBootstrap`.
8. **`shed.run` hard CPU cap of 300** (`src/shed.ts:3`). When exceeded during
   `strat.init()`, remaining rooms skip `legacyInit`, and their `ClaimedStrat.run`
   throws on `room.assaulters.length` (caught and deferred by `runRow`).
9. **Too-old eggs are never removed** (`src/spawn.ts:158`, TODO in code). An egg
   whose `spawn()` keeps failing is retried forever.
10. **`GlobalRespawn` hard-requires `Game.spawns.Home`**; any other spawn name
    throws every tick inside the mission (deferred, so the whole mission stalls).

## Latent bugs in code that is loaded but currently unreachable

11. **`dynMaxHits` is imported but not exported** (`src/struct.tower.js:2`,
    `src/creep.repair.ts`). The tower "overheal" branch (storage > 800k energy)
    would throw `TypeError`.
12. **`Game.terminals`, `Game.storages`, `Game.ncreeps` are never assigned**
    (defined by a deleted `globals.js`). Used by `struct.terminal.js` market
    functions, `team.ts:427`, `team.egg.js:5`.
13. **`markethack.disable()` references undefined `key`** (should be
    `hackingKey`). `enable()` runs at import and patches `Object.prototype`
    with a Symbol getter; every `_.size(this)` on any object property lookup of
    that symbol counts toward the hijack.
14. **`Swiper` never picks up anything** (`src/job.swiper.ts`): it walks to the
    target room, and once over half full walks home to drop; no withdraw/pickup
    step exists. Commit `6a9979b` describes it as in progress.
15. **`Meta_lab.maxHits` returns a raw `number`** where the `MAXHITS` enum is
    expected (`src/metastruct.ts:1236`); harmless because both are numbers.
16. **Unused lodash named imports** (`kebabCase` in `job.ctrl.ts`, `max` in
    `metastruct.ts`) pull in `require('lodash')` for nothing.
17. **`Rewalker.guessRoomCost`** (`src/Rewalker.ts:516`) dereferences `parsed!`
    inside `if (!parsed)`; it only runs for malformed room names.
18. **`flag.ts` `missionTasker`** is created and never used.
19. **`spawnold.run` deletes eggs whose team flag is gone** ("Bad Egg!"): if it
    were ever re-enabled it would delete every new-system egg (they have no
    `egg.team`).

## Hardcoded MMO / personal state

- Shard guard accepts only `shard2` and `shardSeason` (`src/main.js:341`).
- Username `deft-code` in `routes.ts`, `struct.controller.js`, `team.ts`,
  `creep.dismantle.js`, `history.ts`.
- Room names `W21N15`, `W29N11`, `W23N15`, `W49N10`, `W41N10`, spawn `Aycaga`,
  object id `5c574d80b8cfe8383392fb37`, market order ids, in `main.js`,
  `powercreep.ts`, `role.power.js`.
- Player names `TuN9aN0`, `smokeman`, `Disconnect`, `omnomwombat` territory
  in `powercreep.ts`.
- `mineralPlan()` has a `swc` shard branch.

## Housekeeping

- `.gitmodules` points at submodules the build does not use; `Traveler/` is an
  empty directory in a fresh clone.
- The previous `CLAUDE.md` referenced planning notes in `~/screeps`; that
  directory does not exist on this machine.
- `gulp fetch` overwrites `src/*.js` from the server.
- `gulp sim`, `swc`, `plus` push uncompiled `src/*.js` and cannot run the TS code.
