# Known Issues and Latent Bugs

Found while tracing the code. Ordered by how likely they are to bite on the
current build; anything fixed has moved to [Fixed](#fixed) at the bottom.

## Affects the live path

1. **`afterWorker` defined twice**: `src/role.worker.js` and
   `src/role.mason.ts:19`. The JS mixin is merged later in `main.js` and wins,
   which is the intended behaviour for workers, but the mason copy is
   unreachable and was probably meant to be `afterMason`.
2. ~~Strat never evolves~~ Fixed 2026-09: `NullStrat.evolve()` returns a
   `ClaimedStrat` when the controller becomes ours (and an `ActiveStrat` when
   metas appear); the outgoing strat kills its own process.
3. **`spawnHatches` double-push** (`src/mission.ts:109`). A hatch whose creep
   disappeared is pushed to `done` and then, because `undefined?.spawning` is
   falsy, also pushed into `memory.creeps`; `runCreeps` removes it next tick
   with a spurious "Creep Died!" log.
4. **`Startup.spawn` / `Reboot.spawn` ignore the `spawns` argument** and use
   `_.sample(Game.spawns)`; fine with one room, wrong with several.
5. **`room.turtle` and `room.wallMax` do not exist** (`src/creep.oldrepair.js`).
   `taskTurtleMode` is always false; `taskTurtlePrep` only triggers on safe mode
   at RCL3+; `taskRepairWall`/`idleRepairRoad` compare against `undefined`.
   These are called by the live `roleWorker` and `roleBootstrap`.
6. **`shed.run` hard CPU cap of 300** (`src/shed.ts:3`). When exceeded during
   `strat.init()`, remaining rooms skip `legacyInit`, and their `ClaimedStrat.run`
   throws on `room.assaulters.length` (caught and deferred by `runRow`).
7. **Too-old eggs are never removed** (`src/spawn.ts:158`, TODO in code). An egg
   whose `spawn()` keeps failing is retried forever.
8. **`GlobalRespawn` hard-requires `Game.spawns.Home`**; any other spawn name
   throws every tick inside the mission (deferred, so the whole mission stalls).

## Latent bugs in code that is loaded but currently unreachable

9. **`dynMaxHits` is imported but not exported** (`src/struct.tower.js:2`,
    `src/creep.repair.ts`). The tower "overheal" branch (storage > 800k energy)
    would throw `TypeError`.
10. **`Game.terminals`, `Game.storages`, `Game.ncreeps` are never assigned**
    (defined by a deleted `globals.js`). Used by `struct.terminal.js` market
    functions, `team.ts:427`, `team.egg.js:5`.
11. **`markethack.disable()` references undefined `key`** (should be
    `hackingKey`). `enable()` runs at import and patches `Object.prototype`
    with a Symbol getter; every `_.size(this)` on any object property lookup of
    that symbol counts toward the hijack.
12. **`Swiper` never picks up anything** (`src/job.swiper.ts`): it walks to the
    target room, and once over half full walks home to drop; no withdraw/pickup
    step exists. Commit `6a9979b` describes it as in progress.
13. **`Meta_lab.maxHits` returns a raw `number`** where the `MAXHITS` enum is
    expected (`src/metastruct.ts:1236`); harmless because both are numbers.
14. **Unused lodash named imports** (`kebabCase` in `job.ctrl.ts`, `max` in
    `metastruct.ts`) pull in `require('lodash')` for nothing.
15. **`Rewalker.guessRoomCost`** (`src/Rewalker.ts:516`) dereferences `parsed!`
    inside `if (!parsed)`; it only runs for malformed room names.
16. **`flag.ts` `missionTasker`** is created and never used.
17. **`spawnold.run` deletes eggs whose team flag is gone** ("Bad Egg!"): if it
    were ever re-enabled it would delete every new-system egg (they have no
    `egg.team`).

## Hardcoded MMO / personal state

- Shard guard accepts only `shard2` and `shardSeason` (`src/main.js:343`).
- Username `deft-code` in `routes.ts`, `struct.controller.js`, `team.ts`,
  `creep.dismantle.js`, `history.ts`.
- Room names `W21N15`, `W29N11`, `W23N15`, `W49N10`, `W41N10`, spawn `Aycaga`,
  object id `5c574d80b8cfe8383392fb37`, market order ids, in `main.js`,
  `powercreep.ts`, `role.power.js`.
- Player names `TuN9aN0`, `smokeman`, `Disconnect`, `omnomwombat` territory
  in `powercreep.ts`.
- `mineralPlan()` has a `swc` shard branch.

## Housekeeping

- `.gitmodules` points at a `murmurhash-js` submodule the build does not use.
- The previous `CLAUDE.md` referenced planning notes in `~/screeps`; that
  directory does not exist on this machine.
- `gulp fetch` overwrites `src/*.js` from the server.
- `gulp sim`, `swc`, `plus` push uncompiled `src/*.js` and cannot run the TS code.

## Fixed

- **Console scheduling helpers** (`src/main.js:12-16`). `global.spawn =
  process.spawn` assigned `undefined` and `console.schedule =
  process.Service.shedule` was a typo. Replaced by `global.spawnService(cmd)`
  and `global.scheduleService(cmd)`, arrow wrappers that resolve `process`
  lazily and keep `this` bound to `Service` (a bare
  `global.x = process.Service.schedule` would have thrown on `this.spawn`).
- **`kill()` did not stop a running process** (`src/process.ts:25,55,147`).
  `Service.kill()` removed the name from `Memory.scheduler.services` and the
  services map but left the instance in the priority table until the next global
  reset. `Process` now carries a `dead` flag that `kill()` sets; `runRow` skips
  a dead process and does not re-file or defer one that died during its own
  `run()`, so self-kill works too.
