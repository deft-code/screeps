# File Inventory

Every file under `src/` plus the repo root, with its reachability on the current
build (traced from `main.js`; the `return` at `src/main.js:353` is treated as
the end of the live loop). Dates are first commit of the file.

Status legend:
- **LIVE**: executes on the current tick path (module load or loop).
- **REACHABLE**: loaded and callable, but only via an optional path (a mission
  that is not scheduled, a role no job spawns, a console call).
- **DEAD**: imported (prototype extensions run) but its behaviour is never
  invoked.
- **ORPHAN**: not imported by anything.
- **TOOLING**: not part of the game bundle.

## Core runtime

| file | status | since | purpose |
|---|---|---|---|
| `src/main.js` | LIVE | 2017 | Entry; imports, mixin merge, `Service.boot()`, `loop`. Lines 356-439 are dead. |
| `src/process.ts` | LIVE | 2022 | Process/Service/priority rows/`runAll`/`canRun`. |
| `src/mission.ts` | LIVE | 2019/2022 | `Mission` base: eggs/hatch/creeps, `nCreeps`, `layEgg`, `findName`. |
| `src/mycreep.ts` | LIVE | 2022 | `MyCreep` wrapper, role registry, `@task`, `Task2Ret`. |
| `src/spawn.ts` | LIVE | 2022 | `SpawnDaemon`, `energyDef`, `runSpawns`. |
| `src/service.flag.ts` | LIVE | 2022 | `FlagService` daemon -> metastruct genesis. |
| `src/ms.globalrespawn.ts` | LIVE | 2022 | The active mission. |
| `src/ms.swipe.ts` | REACHABLE | 2022 | Scout-then-swipe mission; schedule with `"Swipe <target> <home>"`. |
| `src/job.creep.ts` | LIVE | 2022 | `JobCreep` base with Rewalker moves. |
| `src/job.role.ts` | LIVE | 2022 | `JobRole` bridge to legacy roles; `localSpawn`. |
| `src/job.startup.ts`, `job.reboot.ts`, `job.worker.ts`, `job.ctrl.ts`, `job.hub.ts`, `job.hauler.ts`, `job.srcer.ts` | LIVE | 2022 | Job classes spawned by GlobalRespawn. |
| `src/job.scout.ts`, `src/job.swiper.ts` | REACHABLE | 2022 | Jobs for `Swipe` (Scout also for `Farm`). Swiper never picks anything up (WIP). |
| `src/ms.farm.ts` | REACHABLE | 2026 | Remote-farm mission; schedule with `"Farm <farm> <home> [cap]"`. Scouts an invisible farm room; paces minis/guards/wolves against enemies, armed hostiles and invader cores (team.ts suppress* rules). |
| `src/ms.remote.ts` | REACHABLE | 2026 | Remote mission, team.ts `teamRemote` port; `"Remote <remote> <home>"`. Extends `Farm` for the invader-core wolf; scout for visibility; reservers paced every 225 ticks (team.ts rule) hold the controller; plans, tracks, draws and (on windDown) removes rsrc/rroad metas. No harvesters yet. |
| `src/ms.once.ts` | REACHABLE | 2026 | `"Once <Job> <room>"`: spawns one creep of a job, winds down after it hatches; Remote schedules `Once Paver <room>`. |
| `src/job.harvester.ts` | REACHABLE | 2026 | Harvester job for Remote: claims an rsrc meta, drop-mines on its container tile, builds/repairs the container. |
| `src/job.trucker.ts` | REACHABLE | 2026 | Trucker job for Remote: rsrc containers -> home storage, paced by the source regen / haul rate. |
| `src/job.paver.ts` | REACHABLE | 2026 | Paver job for Once: harvest, build any site, repair roads/containers in the mission room. |
| `src/ms.startup.ts` | REACHABLE | 2026 | `"Startup <room>"`: Scout while invisible, Claimer while not ours (GCL permitting), Pioneers paced at `max(1, 6 - rcl)` per lifetime until RCL4 (one Guard until a tower stands), then winds down. |
| `src/job.claimer.ts` | REACHABLE | 2026 | Claimer job for Startup: `[MOVE, CLAIM]` from the nearest spawns, claims (or attacks a foreign-owned) controller. |
| `src/job.pioneer.ts` | REACHABLE | 2026 | Pioneer job for the Startup mission: `Startup.body` capped at 6 pairs, "remote" spawn strategy, homed on the mission room; `rolePioneer` -> `roleBootstrap`. |
| `src/metaremote.ts` | REACHABLE | 2026 | `Meta_rsrc`/`Meta_rroad` and `RemotePlanner`: flagless, multi-room road and container planning for Remote. |
| `src/job.farmer.ts`, `src/job.wolf.ts`, `src/job.guard.ts`, `src/job.mini.ts`, `src/job.reserver.ts` | REACHABLE | 2026 | Jobs for `Farm`/`Remote`; Task2 ports of `role.farmer.js`, `role.wolf.js`, `role.guard.js` (`Mini` = `Guard` on the `mini` body) and `role.reserver.js`. |
| `src/strat.ts` | LIVE | 2020 | `NullStrat`/`ActiveStrat`/`ClaimedStrat` per room with `evolve()`; hostile lists; runs towers/labs/links/meta/factory; `ActiveStrat` builds mission metas in unclaimed rooms. |
| `src/shed.ts` | LIVE | 2019 | `run(objs, bucket, fn)` CPU-guarded loop; `canRun`. |
| `src/cache.ts` | LIVE | 2019 | `tick`/`cache` properties on Room/RoomObject; `theTick.inject`. |
| `src/debug.ts` | LIVE | 2019 | Logging with source locations; `Debuggable` mixin. |
| `src/lib.js` | LIVE | 2017 | `merge`, `roProp`, room-name helpers, tower falloff math. |
| `src/roomobj.ts` | LIVE | 2019 | `@extender`, `@injecter`; `effectTTL/effectLvl`. |
| `src/guards.ts` | LIVE | 2019 | Type guards (`isSType`, `isStoreStruct`, ...). |
| `src/constants.js` | LIVE | 2017 | RCL energy caps, reaction tables, `EnergyReserve`. |
| `src/types.d.ts` | LIVE | 2019 | Global type augmentations. |
| `src/Tasker.ts` | LIVE (types) | 2019 | `TaskRet`; `Tasker` class used only by powercreep/flag. |
| `src/pace.ts` | LIVE (`humanize`) | 2019 | Tick-rate estimate (sampler not wired). |

## Metastructure and flags

| file | status | since | purpose |
|---|---|---|---|
| `src/metastruct.ts` | LIVE | 2019 | Base templates, planning via genesis flags, construction upkeep, maxHits, spawn energy order, link modes. |
| `src/flag.ts` | LIVE | 2019 | `FlagExtra`: parent/child naming, `self`, `role`, `dupe`, colours in `toString`. `run()`/`darkRun()` dead. |
| `src/Visual.js` | LIVE (draw) | 2019 | `RoomVisual.structure/animatedPosition/speech/resource` used by metastruct `draw`. |

## Creep prototype layer

| file | status | since | purpose |
|---|---|---|---|
| `src/creep.ts` | LIVE | 2019 | `CreepExtra`: body stats, hostile flags, `bodyInfo`. |
| `src/creep.role.ts` | LIVE | 2019 | `CreepRole`: `run/after` dispatch, task memory, boosts, `team` shim. |
| `src/creep.move.ts` | LIVE | 2019 | Rewalker-backed moves, `moveRoom`, `moveSpot`, flee/retreat. |
| `src/creep.carry.ts` | LIVE | 2019 | Transfer/withdraw/pickup families. |
| `src/creep.harvest.ts`, `creep.build.ts`, `creep.repair.ts` | LIVE | 2020 | `goHarvest`; build tasks; repair tasks + `repairable`. |
| `src/creep.work.js` | LIVE | 2017 | Upgrade/reserve/harvest-spot tasks used by startup/worker/ctrl. |
| `src/creep.oldrepair.js` | LIVE (partly) | 2020 | `taskTurtle*` used by worker/bootstrap; references undefined `room.wallMax`/`room.turtle`. |
| `src/creep.attack.js`, `creep.dismantle.js`, `creep.heal.js` | DEAD | 2017 | Combat helpers for roles no job spawns. |
| `src/role.bootstrap.js` (`startup`), `role.reboot.js`, `role.worker.js`, `role.ctrl.js`, `role.hauler.js` | LIVE | 2017-18 | Live legacy roles. |
| `src/role.hub.ts`, `src/role.src.ts` (`asrc`/`bsrc`) | LIVE | 2019-20 | Live TS roles. |
| `src/role.cap.ts`, `role.mason.ts`, `role.mineral.ts`, `role.shovel.ts`, `role.shunt.ts` (`core`/`aux`), `role.depositfarmer.ts` | REACHABLE | 2020 | TS roles with no job class. |
| `src/role.archer.js`, `bulldozer`, `caboose`, `cart`, `chemist`, `claimer`, `cleaner`, `collector`, `coresrc`, `declaimer`, `defender`, `drain`, `dropper`, `farmer`, `guard`, `harvester`, `manual`, `medic`, `minecart`, `miner`, `paver`, `power`, `ram`, `rambo`, `reserver`, `scout`, `srcer`, `stomper`, `trucker`, `upgrader`, `wolf`, `zombiefarmer` (`.js`) | REACHABLE (no job) | 2017-19 | Legacy roles merged onto `Creep`; see [creep-roles.md](creep-roles.md). |
| `src/role.recycle.ts` | ORPHAN | 2019 | Not imported. |
| `src/role.js`, `src/role.legacy.js` | ORPHAN | 2018 | Class-based role experiment. |

## Rooms and structures

| file | status | since | purpose |
|---|---|---|---|
| `src/room.ts` | LIVE | 2017/19 | `findStructs`, `lookForAtRange`, spots, `energyFreeAvailable`, `maxHits`. |
| `src/path.ts` | LIVE (packing) | 2017 | `pos.xy`, `packPos/unpackPos`; `Path` class dead. |
| `src/source.js` | LIVE | 2017 | `source.spots/bestSpot/note/regenTTL`. |
| `src/struct.ts`, `constructionsite.ts`, `tombs.js` | LIVE | 2017-20 | `note`/`toString`/`hurts`/`repairs`. |
| `src/struct.link.ts` | LIVE | 2019 | Link modes, `runLinks`, `storageBalance`, `hubNeed`. |
| `src/struct.tower.js` | LIVE | 2017 | `runTowers` (overheal branch broken). |
| `src/struct.lab.js` | LIVE | 2017 | `runLabs`, `autoReactAll`, boosts. |
| `src/struct.factory.ts` | LIVE | 2020 | `runFactory` (alloy). |
| `src/struct.container.js`, `struct.controller.js` | LIVE | 2017 | `mode`; `resTicks/reservable`. |
| `src/struct.terminal.js` | LIVE (helpers) / DEAD (`run`) | 2017 | Fill/drain thresholds used by hauler; market automation dead. |
| `src/room.keeper.js` | DEAD | 2017 | Old construction planner. |
| `src/intel.ts` | LIVE | 2020 | Room intel, `roomKind`, coordinates. |
| `src/radar.ts` | LIVE (register) / DEAD (`run`) | 2020 | Observer scanning. |
| `src/market.ts` | LIVE (register) / DEAD (`run`) | 2020 | Per-tick store totals; price EMAs dead. |
| `src/deposit.ts` | DEAD | 2020 | Deposit team creation; `depositDist` used by dead team code. |

## Movement

| file | status | since | purpose |
|---|---|---|---|
| `src/Rewalker.ts` | LIVE | 2019 | Pathing/walking engine. |
| `src/routes.ts` | LIVE (`dist`) | 2019 | Room distance cache; `isHostile`. |
| `src/matrix.js` | DEAD | 2017 | Cost matrices for teams. |
| `src/spots.ts` | DEAD | 2020 | Neighbour scoring used by `team.ts`. |
| `src/FindRoute.ts`, `src/PriorityQueue.js` | ORPHAN | 2022 | Custom findRoute. |

## Legacy orchestration and misc

| file | status | since | purpose |
|---|---|---|---|
| `src/team.ts`, `src/team.egg.js` | DEAD | 2017/19 | Flag teams and egg factories. |
| `src/spawnold.js` | LIVE (`findSpawns`, `buildBody`) / DEAD (`run`) | 2017 | Body table still used by `JobRole`. |
| `src/powercreep.ts` | DEAD | 2019 | Power creep roles (MMO-specific). |
| `src/console.js` | REACHABLE (console) | 2019 | Global console helpers and client hacks. |
| `src/markethack.js` | LIVE (side effect) / DEAD (use) | 2020 | Patches `Object.prototype` at import. |
| `src/history.ts`, `memprof.ts`, `memhack.js`, `profiler.ts`, `server.js`, `stack.js`, `planner.js` | ORPHAN | 2017-20 | See [legacy-systems.md](legacy-systems.md). |

## Repo root

| file | status | purpose |
|---|---|---|
| `gulpfile.js`, `tsconfig.json`, `package.json`, `package-lock.json` | TOOLING | Build and deploy ([build-and-deploy.md](build-and-deploy.md)). |
| `console-tools.js` | TOOLING | Shell access to the game console for the `console`/`consoleTail` gulp tasks: websocket client, sourcemap translation of log locations, rotating `logs/`. |
| `blank_credentials.js` | TOOLING | Template for gitignored `credentials.js`. |
| `.gitmodules` | TOOLING | Declares the unused `murmurhash-js` submodule. |
| `hacking.js`, `markethack.js` | ORPHAN | Runtime-snooping experiments; not in `src/`, never deployed. |
| `watch.sh`, `.tern-project` | TOOLING (stale) | Linux inotify watcher; Tern autocomplete config. |
| `.gitattributes`, `.editorconfig` | TOOLING | LF line endings everywhere (git normalisation and editor settings); indent width for TS/JS is left to per-file detection. |
| `LICENSE` | | MIT-style licence. |
| `CLAUDE.md`, `docs/` | | This documentation. |

Generated and ignored: `distjs/`, `sourcemaps/`, `logs/`, `node_modules/`,
`credentials.js`.
