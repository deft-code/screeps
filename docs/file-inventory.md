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
| `src/spawnload.ts` | LIVE | 2026 | `SpawnTelemetry` daemon: per-spawn busy ticks and creeps started in `Memory.spawns`; `spawnLoad`/`spawnRate` (+`Long`, `room*`, `global*`) readers, console `spawnLoads()`. No consumer yet. |
| `src/service.flag.ts` | LIVE | 2022 | `FlagService` daemon -> metastruct genesis. |
| `src/ms.globalrespawn.ts` | LIVE | 2022 | The active mission. |
| `src/ms.swipe.ts` | REACHABLE | 2022 | Scout-then-swipe mission; schedule with `"Swipe <target> <home>"`. |
| `src/job.creep.ts` | LIVE | 2022 | `JobCreep` base with Rewalker moves. |
| `src/job.role.ts` | LIVE | 2022 | `JobRole` bridge to legacy roles; `localSpawn`. |
| `src/job.startup.ts`, `job.reboot.ts`, `job.worker.ts`, `job.ctrl.ts`, `job.hub.ts`, `job.hauler.ts`, `job.srcer.ts`, `job.upgrader.ts` | LIVE | 2022 | Job classes spawned by GlobalRespawn (all but Startup also by the Hub mission). `Reboot.spawn` prefers the mission room's spawns. |
| `src/ms.reactordepot.ts`, `src/job.warrunner.ts` | REACHABLE | 2022 | `ReactorDepot <home> [cap]`: `Reactor` subclass whose runners (Warrunner, a Warboy subclass without WORK) load thorium from the home terminal while it holds > 1000, instead of mining (Sept 2026). |
| `src/ms.balance.ts` | REACHABLE | 2026 | `Balance`: levels energy across the terminals of the rooms given by `addRoom`/`removeRoom` (`Memory.balance.rooms`); when none is on cooldown the fullest sends half the gap (>= 5k) to the emptiest, shrunk to what its energy can pay in transfer fee. With `setMineralRoom(room)` (`Memory.balance.minerals`) every other listed terminal first sends that room its minerals and compounds (not energy, not thorium), one resource of 100+ per cooldown. No creeps. |
| `src/ms.thormine.ts`, `src/job.thoreater.ts`, `src/job.cleanup.ts` | REACHABLE | 2022 | `Thormine <room> [dest]`: thoreaters mine the room's thorium into its terminal, the mission ships it to `dest` (default W25S7). Gated on thorium left, an extractor on it and a terminal. Exhausted + empty terminal + `teardownEnabled` (off by default, set from the console) = teardown: wind down homed missions, Cleanup creeps drain energy to the terminal, ship, destroy all structures, unclaim (Sept 2026). |
| `src/job.scout.ts`, `src/job.swiper.ts` | REACHABLE | 2022 | Jobs for `Swipe` (Scout also for `Farm`). Swiper loots hostile extensions and unloads at home via `JobCreep.unloadHome` (storage, terminal, else containers), dropping at the controller failing all (Sept 2026). |
| `src/ms.farm.ts` | REACHABLE | 2026 | Remote-farm mission; schedule with `"Farm <farm> <home> [spawn]"` (optional third room = the only room its creeps spawn from). Idles until the home (drop) room is ours with a spawn or spawn site. Scouts an invisible farm room; paces minis/guards/wolves against enemies, armed hostiles and invader cores (team.ts suppress* rules). |
| `src/ms.growfarm.ts` | REACHABLE | 2026 | `"GrowFarm <farm> <home> [spawn]"`: runs as `Farm` until the home room reaches 800 energy capacity (full RCL3; 1300, full RCL4, when the farm controller has a single free tile) with a storage built or planned, then evolves into `Remote` on the same arguments. |
| `src/ms.remote.ts` | REACHABLE | 2026 | Remote mission, team.ts `teamRemote` port; `"Remote <remote> <home>"`. Extends `Farm` for the invader-core wolf; scout for visibility; reservers paced every 225 ticks (team.ts rule) hold the controller; plans, tracks, draws and (on windDown) removes rsrc/rroad metas. No harvesters yet. |
| `src/ms.once.ts` | REACHABLE | 2026 | `"Once <Job> <room>"`: spawns one creep of a job, winds down after it hatches. |
| `src/ms.always.ts` | REACHABLE | 2026 | `"Always <Job> <room> [perLife]"`: keeps one creep of a job in the room for good, one egg per lifetime (`paceNJobs`); `windDown()` stops it. |
| `src/ms.paveall.ts` | REACHABLE | 2026 | `"PaveAll <room>"`: a paver every 1400 ticks while we have construction sites in the room, then winds down. Remote and Startup request it for unowned road rooms. |
| `src/job.harvester.ts` | REACHABLE | 2026 | Harvester job for Remote: claims an rsrc meta, drop-mines on its container tile, builds/repairs the container. |
| `src/ms.xfer.ts` | REACHABLE | 2026 | `"Xfer <to> <from> [n]"`: lays n (default 2) fedexes per lifetime carrying energy from `<from>`'s storage to `<to>`; winds down once the home storage is under 50k energy (0 with `takeitall`) or the target storage is over 75% full. |
| `src/job.fedex.ts` | REACHABLE | 2026 | Fedex job for Xfer (extends Trucker): CARRY, MOVE x 25; home storage -> mission room storage (else terminal, containers, any energy structure, controller pile); recycles in the mission room when too old for another round trip. |
| `src/job.trucker.ts` | REACHABLE | 2026 | Trucker job for Remote: rsrc containers -> home storage (or, with none, home containers by most free space; `JobCreep.unloadHome`), paced by the source regen / haul rate. |
| `src/job.paver.ts` | REACHABLE | 2026 | Paver job for Once: harvest, build any site, repair roads/containers in the mission room. |
| `src/job.ctrlhauler.ts` | LIVE | 2026 | CtrlHauler job for GlobalRespawn/Hub: refills the Meta_ctrl container from storage while storage >= 100k and not adjacent to the container, and both container and ctrl creep are empty. |
| `src/job.chemist.ts` | REACHABLE (Hub mission) | 2026 | Chemist job, Task2 port of `role.chemist.js`: fills labs with their `planType` and energy, drains labs per `mineralDrain()`, carries ghodium to the nuker, moves stray non-energy (piles, tombstones, ruins, containers) into the storage. One per Hub room with a terminal and a lab. |
| `src/ms.bulldoze.ts` | REACHABLE (by command string) | 2026 | `"Bulldoze <target> <home>"`: keeps a list of tiles to clear (`memory.doze`). `bulldoze*` flags in the target room add a tile / move it to the front and are removed; a breach path from the home room's first spawn to the first tile (plains = swamp, blocked tiles cost `round(log10(hits)*20)`) adds every blocked tile on the way; draws markers; one Bulldozer while the list is not empty. |
| `src/job.bulldozer.ts` | REACHABLE (Bulldoze mission) | 2026 | Dismantler, 2 WORK per MOVE: one `planWalk` over all the mission's tiles with the regular matrix, dismantles what stands on the one it reaches (rampart first); takes an XZH2O boost in the home room when a lab has it. Exports `dozeable(pos)`. |
| `src/ms.raze.ts` | REACHABLE (by command string) | 2026 | `"Raze <room> [home]"`: one Razer clears a room of foreign structures and sites; winds down when the razer decommissions or the room visibly holds no structure another player owns. |
| `src/ms.nidoran.ts` | REACHABLE (by command string) | 2026 | `"Nidoran <room> [player]"`: tracks a player's reserved and claimed rooms from intel, rotates an active reserved room within 2 hops (claimed rooms forbidden, unreachable ones blacklisted, dropped on 2+ defenders or no roads/containers) and paces Chaos creeps at `(1500 - 50*dist)/2` from the "close" spawns of the mission room. |
| `src/job.chaos.ts` | REACHABLE (Nidoran mission) | 2026 | 5 MOVE 1 WORK harasser: dismantles the active room's structures furthest from its sibling, flees armed creeps within 5 (across rooms), retreats into the nearest owned room under 100 hits or TTL. Exports `chaosTargets(room)`, `kChaosBody`. |
| `src/job.razer.ts` | REACHABLE (Raze mission) | 2026 | Bulldozer-bodied dismantler: takes down every structure that is not ours (cheapest walk first, rampart first on a tile), stomps foreign construction sites like a Scout, and after 10 idle ticks walks back to its origin spawn to be recycled. Exports `razeTargets(room)`. |
| `src/ms.hub.ts` | REACHABLE | 2026 | `"Hub <room>"`: GlobalRespawn's loop for another owned room without the startup creeps (Reboot when creepless, bsrc/asrc or haulers scaled by dropped energy, Worker, Ctrl, Hub once storage, Chemist with a terminal and a lab), all spawned "local"; idles until the room is ours and has a spawn of its own. |
| `src/strat.thor.ts` | REACHABLE | 2026 | `ThorStrat`, registered as strat override `thorclaimed`: `ClaimedStrat` with ramparts capped at 1M hits; deletes `Memory.rooms[x].strat` once the room is no longer ours. Imported by `ms.thorhub.ts`. |
| `src/ms.thorhub.ts` | REACHABLE | 2026 | `"Thorhub <room>"`: Hub for a temporary thorium room. Overrides Hub's `nUpgraders()` and `nCtrlHaulers()` (0 from RCL6, Hub's rules up to RCL5) and `ctrlCap()` (full capacity up to RCL5, RCL2Energy from RCL6; read by `Ctrl.spawn`) so nothing is spent growing a room that Thormine will tear down; sets the room's strat override to `thorclaimed` while running. |
| `src/ms.startup.ts` | REACHABLE | 2026 | `"Startup <room>"`: Scout while invisible, Claimer while not ours (GCL permitting) with Pioneers sent early to build planned roads/containers when the room is free and has saved metas, Pioneers paced at a hardcoded 2 per lifetime until RCL4 (one Guard until a tower stands), then winds down. |
| `src/job.claimer.ts` | REACHABLE | 2026 | Claimer job for Startup: `[MOVE, CLAIM]` from the nearest spawns, claims (or attacks a foreign-owned) controller. |
| `src/job.pioneer.ts` | REACHABLE | 2026 | Pioneer job for the Startup mission: `Startup.body` capped at 6 pairs, "remote" spawn strategy, homed on the mission room; `rolePioneer` -> `roleBootstrap`. |
| `src/metaremote.ts` | REACHABLE | 2026 | `Meta_rsrc`/`Meta_rroad` and `RemotePlanner` (on `roadplan.ts`'s `RoadPlanner`): flagless, multi-room road and container planning for Remote; legs are saved as traffic entries per room (`Meta_rroad`, also used by Startup). |
| `src/roadplan.ts` | REACHABLE | 2026 | The room-to-room road planner shared by `RemotePlanner`, Startup's road and `Experiment`: `roadRoute` (rooms other players own impassable, keeper rooms dear), `roadMatrix` (metatraffic's weights, meta plans, aversions beside sources/minerals/controller and around keeper lairs, intel without vision), `RoadPlanner` (cached matrices, search, stamp). Imports metastruct. |
| `src/ms.experiment.ts` | REACHABLE | 2026 | `Experiment` service (purple flag `Experiment` -> child `dest_Experiment`): plans one road per weight set on a `RoadPlanner`, draws them, `status()` counts tiles by terrain. Settled the 2:3:6 weights (Sept 2026). |
| `src/metatraffic.ts` | LIVE | 2026 | The road planner behind `MetaManager`'s traffic: `TrafficMem` entries, levels, path costs, `trafficMatrix`, `planTraffic`, `pathTraffic` (multi-room path -> per-room entries). Imports only Rewalker and shed, so metastruct can import it. See [traffic-design.md](traffic-design.md). |
| `src/creep.enemy.ts` | REACHABLE | 2026 | `EnemyCreep`: an enemy creep's id and last seen position, kept on a job instance across ticks (`c` re-reads the Creep, `pos` falls back to the last sighting); `Wolf.lastTarget`. |
| `src/suppress.ts` | REACHABLE | 2026 | `suppressMicro`/`suppressPup(mission)`: the unarmed-enemy rules shared by `Farm`/`Remote` and `Hub`/`Thorhub`. |
| `src/job.micro.ts` | REACHABLE | 2026 | Micro job for `Farm`/`Remote`/`Hub`/`Thorhub`: [RANGED_ATTACK, MOVE]; laid once per lifetime after 50 ticks of enemy creeps with no armed hostile; shoots only enemies without RANGED_ATTACK, kites melee, flees ranged. |
| `src/job.pup.ts` | REACHABLE | 2026 | Pup job for `Farm`/`Remote`/`Hub`/`Thorhub`: a Wolf with `memory.size` ATTACK + MOVE pairs; three per lifetime while unarmed enemies with HEAL are in the room, sized heal power / 30 / 2. |
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
| `src/Tasker.ts` | LIVE (types) | 2019 | `TaskRet`; `Tasker` class used only by flag. |
| `src/pace.ts` | LIVE (`humanize`) | 2019 | Tick-rate estimate (sampler not wired). |

## Metastructure and flags

| file | status | since | purpose |
|---|---|---|---|
| `src/metastruct.ts` | LIVE | 2019 | Base templates, planning via genesis flags, construction upkeep, maxHits, spawn energy order, link modes; the manager's traffic (roads for every meta's `traffic()` entries, replanned after any change). |
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
| `src/market.ts` | REACHABLE (swipeworth, Selloff) | 2020, rewritten 2026 | `buyOrderPriceEma(res)` (prices the tick, returns the `buy95` average), `bidUnits(res, minPrice)`, `getBuyOrderPrice`/`getSellOrderPrice` (+ `tryGet*`) tick prices over the best 10k units via `markethack`, energy by effective price, feeding the `Memory.market` averages. |
| `src/swipeworth.ts` | REACHABLE (Swipe mission, Furiosa swipe) | 2026 | `worthSwiping(res, home)` / `minSwipePrice(home)`: a resource is worth looting when it sells for 2x what energy costs delivered to the home room; energy always; everything when there is no market. `worthless(res)`: the buy-order price's short moving average (`market.buyOrderPriceEma`, `buy95`) is under energy's; with a thin book, nobody bids energy's price or better (what swipers and Furiosa will not pick up off the ground). `junkIn(store)`: the worthless minus the catalyzed boosts (`X...`), what Konmari throws out. |
| `src/job.konmari.ts` | REACHABLE (Swipe mission sparkJoy) | 2026 | Carries junk (worthless, catalyzed boosts excepted) out of the home stores and drops them 20 a tick outside the home room. |
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
| `src/powercreep.ts` | LIVE | 2026 | Rebuilt: `TPowerCreep` / `MyPowerCreep` wrappers plus `getPowerCreep(name)` / `myPowerCreeps()` ([tcreep-design.md](tcreep-design.md) Appendix D). The 2019 prototype roles are gone (git history; [legacy-systems.md](legacy-systems.md)). |
| `src/console.js` | REACHABLE (console) | 2019 | Global console helpers and client hacks. |
| `src/markethack.ts` | LIVE (side effect) / REACHABLE (console, no importer yet) | 2020, rewritten 2026 | `getAllOrders` / `getOrderById` with `Game.market`'s signatures, read from the engine's raw order table (a Symbol getter on `Object.prototype`, installed at import) with a fallback to the API; no-op on `shardSeason`. `status()` from the console. See [legacy-systems.md](legacy-systems.md). |
| `src/history.ts`, `memprof.ts`, `memhack.js`, `profiler.ts`, `server.js`, `stack.js`, `planner.js` | ORPHAN | 2017-20 | See [legacy-systems.md](legacy-systems.md). |

## Repo root

| file | status | purpose |
|---|---|---|
| `gulpfile.js`, `tsconfig.json`, `package.json`, `package-lock.json` | TOOLING | Build and deploy ([build-and-deploy.md](build-and-deploy.md)). |
| `console-tools.js` | TOOLING | Shell access to the game console for the `console`/`consoleTail` gulp tasks: websocket client, sourcemap translation of log locations, rotating `logs/`. |
| `blank_credentials.js` | TOOLING | Template for gitignored `credentials.js`. |
| `hacking.js`, `markethack.js` | ORPHAN | Runtime-snooping experiments; not in `src/`, never deployed. |
| `watch.sh`, `.tern-project` | TOOLING (stale) | Linux inotify watcher; Tern autocomplete config. |
| `.gitattributes`, `.editorconfig` | TOOLING | LF line endings everywhere (git normalisation and editor settings); indent width for TS/JS is left to per-file detection. |
| `LICENSE` | | MIT-style licence. |
| `CLAUDE.md`, `docs/` | | This documentation. |

Generated and ignored: `distjs/`, `sourcemaps/`, `logs/`, `node_modules/`,
`credentials.js`.
