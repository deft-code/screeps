# File Inventory

Every file under `src/` plus the repo root, with its reachability on the current
build (traced from `main.ts`, whose loop ends at `theRadar.run()`; the dead
code that followed a `return` there was removed on 5 Nov 2026, when the last
JavaScript in `src/` was converted to TypeScript). Dates are first commit of
the file.

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
| `src/main.ts` | LIVE | 2017 | Entry; imports (the 2017 mixins last), `Service.boot()`, `loop`. TypeScript since Nov 2026; the dead tail after `return` is gone. |
| `src/process.ts` | LIVE | 2022 | Process/Service/priority rows/`runAll`/`canRun`. |
| `src/mission.ts` | LIVE | 2019/2022 | `Mission` base: eggs/hatch/creeps, `nCreeps`, `layEgg`, `findName`. |
| `src/tanycreep.ts` | LIVE | 2026 | `TAnyCreep<G>`: the abstract base of every creep and power creep wrapper, keyed by name; `c` is the game object this tick or null, every reader null-safe ([tcreep-design.md](tcreep-design.md) Appendix D). |
| `src/tcreep.ts` | LIVE | 2026 | `TCreep` (body stats over `creep.ts`'s extras: `partsByType`, `active()`, `melee`/`ranged`/`hostile`/`keeper`/`assault`, `weight`, `spawnTime`) and `EnemyCreep` (someone else's creep by id, position last seen). |
| `src/intents.ts` | LIVE | 2026 | `Intents`: the per-tick intent record (a Creep's `tick.intents`, a MyPowerCreep's `IntentLog`): `can*()` checks (`canWork` both slots, `canAttack` melee, `canRange`, `canMove`, `canTransfer`, ...) and `set*()` records (`setMove(dir)`, `setPulled(puller)`, `setWork`, ...). Every intent access in `src/` goes through it. |
| `src/mybasecreep.ts` | LIVE | 2026 | `MyBaseCreep`: the contract `MyCreep` and `MyPowerCreep` share (`intents`, action wrappers, `homeName`/`birthName`, `walkTo`/`walkRoom`) and the shared bodies `issue`/`issueWork` (record on OK, refuse nothing), `walkTo`/`walkRoom` (record the step's direction), `planWalk`. |
| `src/enemy.ts` | LIVE (`main.ts`) | 2026 | `enemyOf(creep)`/`enemyById(id)`/`enemiesIn(room)`: `EnemyCreep`/`EnemyPowerCreep` wrappers by id in a `tobj.ts` `Registry` (100-tick collections). |
| `src/swipe.ts` | REACHABLE (Swiper, Furiosa) | 2026 | The swipe quest for any `MyBaseCreep`: `questSwipe` over `memory.swipe`, `swipeTargets`/`isSwipeTarget`, `pickTarget` (by path or by value), `swipeFrom`, `deliverHome`/`unloadStore`/`unloadLatch`, `nomNearby`. |
| `src/mycreep.ts` | LIVE | 2022, on `TCreep` since Nov 2026 | `MyCreep` wrapper (exists from the egg on; `c` typed non-null for the jobs, null at runtime for an egg), role registry, `@task`, `Task2Ret`, intent-tracking wrappers for every Creep action sharing the Creep's `tick.intents` with the legacy roles. |
| `src/spawn.ts` | LIVE | 2022 | `SpawnDaemon`, `energyDef`, `runSpawns`. |
| `src/spawnload.ts` | LIVE | 2026 | `SpawnTelemetry` daemon: per-spawn busy ticks and creeps started in `Memory.spawns`; `spawnLoad`/`spawnRate` (+`Long`, `room*`, `global*`) readers, console `spawnLoads()`. No consumer yet. |
| `src/service.flag.ts` | LIVE | 2022 | `FlagService` daemon -> metastruct genesis. |
| `src/ms.globalrespawn.ts` | LIVE | 2022 | The active mission. |
| `src/ms.swipe.ts` | REACHABLE | 2022 | Scout-then-swipe mission; schedule with `"Swipe <target> <home>"`. |
| `src/job.creep.ts` | LIVE | 2022 | `JobCreep` base with Rewalker moves. |
| `src/job.role.ts` | LIVE | 2022 | `JobRole` bridge to legacy roles; `localSpawn`. |
| `src/job.startup.ts`, `job.reboot.ts`, `job.worker.ts`, `job.ctrl.ts`, `job.hub.ts`, `job.hauler.ts`, `job.srcer.ts`, `job.upgrader.ts` | LIVE | 2022 | Job classes spawned by GlobalRespawn (all but Startup also by the Hub mission). `Reboot.spawn` prefers the mission room's spawns. |
| `src/reactor.ts` | LIVE (load-time side effect) / REACHABLE (season missions) | 2026 | Season 11 helpers: `sectorCore`, `findReactors`, `thoriumMineral`, the `ReactorObject` typing. At load it defines `RESOURCE_THORIUM`, `FIND_REACTORS` and `LOOK_REACTORS` as `undefined` where the server lacks them, since a bare undeclared global throws a ReferenceError (`if (!RESOURCE_THORIUM)` included; `updateIntel` threw every tick on shard2 before this). `main.ts` imports it first. |
| `src/ms.reactordepot.ts`, `src/job.warrunner.ts` | REACHABLE | 2022 | `ReactorDepot <home> [cap]`: `Reactor` subclass whose runners (Warrunner, a Warboy subclass without WORK) load thorium from the home terminal while it holds > 1000, instead of mining (Sept 2026). |
| `src/ms.balance.ts` | REACHABLE | 2026 | `Balance`: levels energy across the terminals of the rooms given by `addRoom`/`removeRoom` (`Memory.balance.rooms`); when none is on cooldown the fullest sends half the gap (>= 5k) to the emptiest, shrunk to what its energy can pay in transfer fee. With `setMineralRoom(room)` (`Memory.balance.minerals`) every other listed terminal first sends that room its minerals and compounds (not energy, not thorium), one resource of 100+ per cooldown. No creeps. |
| `src/ms.thormine.ts`, `src/job.thoreater.ts`, `src/job.cleanup.ts` | REACHABLE | 2022 | `Thormine <room> [dest]`: thoreaters mine the room's thorium into its terminal, the mission ships it to `dest` (default W25S7). Gated on thorium left, an extractor on it and a terminal. Exhausted + empty terminal + `teardownEnabled` (off by default, set from the console) = teardown: wind down homed missions, Cleanup creeps drain energy to the terminal, ship, destroy all structures, unclaim (Sept 2026). |
| `src/job.scout.ts`, `src/job.swiper.ts` | REACHABLE | 2022 | Jobs for `Swipe` (Scout also for `Farm`). Swiper is `swipe.ts`'s `questSwipe` with targets by cheapest path (Nov 2026; before, its own copy of the loop with `JobCreep.unloadHome`). |
| `src/ms.farm.ts` | REACHABLE | 2026 | Remote-farm mission; schedule with `"Farm <farm> <home> [spawn]"` (optional third room = the only room its creeps spawn from). Idles until the home (drop) room is ours with a spawn or spawn site. Scouts an invisible farm room; paces minis/guards/wolves against enemies, armed hostiles and invader cores (team.ts suppress* rules). |
| `src/ms.growfarm.ts` | REACHABLE | 2026 | `"GrowFarm <farm> <home> [spawn]"`: runs as `Farm` until the home room reaches 800 energy capacity (full RCL3; 1300, full RCL4, when the farm controller has a single free tile) with a storage built or planned, then evolves into `Remote` on the same arguments. |
| `src/ms.remote.ts` | REACHABLE | 2026 | Remote mission, team.ts `teamRemote` port; `"Remote <remote> <home>"`. Extends `Farm` for the invader-core wolf; scout for visibility; reservers paced every 225 ticks (team.ts rule) hold the controller; plans, tracks, draws and (on windDown) removes rsrc/rroad metas. No harvesters yet. |
| `src/ms.once.ts` | REACHABLE | 2026 | `"Once <Job> <room>"`: spawns one creep of a job, winds down after it hatches. |
| `src/ms.always.ts` | REACHABLE | 2026 | `"Always <Job> <room> [perLife]"`: keeps one creep of a job in the room for good, one egg per lifetime (`paceNJobs`); `windDown()` stops it. |
| `src/ms.paveall.ts` | REACHABLE | 2026 | `"PaveAll <room>"`: a paver every 1400 ticks while we have construction sites in the room, then winds down. Remote and Startup request it for unowned road rooms. |
| `src/job.harvester.ts` | REACHABLE | 2026 | Harvester job for Remote: claims an rsrc meta, drop-mines on its container tile, builds/repairs the container. |
| `src/ms.xfer.ts` | REACHABLE | 2026 | `"Xfer <to> <from> [n]"`: lays n (default 2) fedexes per lifetime carrying energy from `<from>`'s storage to `<to>`; winds down once the home storage is under 50k energy (0 with `takeitall`) or the target storage is over 75% full. A `holding` getter (null here) lets subclasses withhold the eggs. |
| `src/ms.xferstartup.ts` | REACHABLE | 2026 | `"XferStartup <to> <from> [n]"`: an `Xfer` that lays fedexes only while `<to>` has a storage of ours holding less energy than `<from>`'s storage (none without vision or a storage), ignores Xfer's home floor and fill cap, and winds down once `<to>` has a terminal of ours. |
| `src/ms.capture.ts` | REACHABLE | 2026 | `"Capture <room>"`: takes a room with Crows. Picks and keeps the nearest owned RCL7+ room as home (`memory.home`), the next room back on the route as staging; keeps a `Capture`/`CaptureN` flag at the target's intel centre and a `staging_<flag>` child 5 tiles into the staging room; lays one crow egg at a time while the crows' ranged power is not more than the enemy creeps' in the target room; mode staging -> attack when the crows within 5 of the staging flag outgun the enemy, back when the crows in the target or staging room drop under half of it; radar requests (observeNow target, observeBackground staging, the neighbours) or nJobs(Scout, 1) for vision. |
| `src/job.prospector.ts` | REACHABLE | 2026 | `Prospector`: mineral miner on [WORK, CARRY, MOVE, MOVE] units sized to the home room (WORK first, MOVEs last); keeper-room walking and fleeing from Skharvester; retreats home when its WORK is broken or an armed non-keeper enemy is in the room; unloads home when full or under 100 TTL, recycles empty at home under 200 TTL. Laid by `SkFarm.prospect()` and `Reactor.prospect()` under the shared `wantProspector` gate. |
| `src/ms.assault.ts` | REACHABLE | 2026 | `"Assault <room> <home>"`: vision of the room (radar, else a scout), then `evolve` into the sibling for its tower count (2: `AssaultTwo`, 3: `AssaultThree`); waits and logs for counts with no sibling. |
| `src/ms.assaulttwo.ts` | REACHABLE | 2026 | `"AssaultTwo <room> <home>"`: one boosted Wicktwo at a time against a two-tower room; staging room from the route home (foreign-owned rooms skipped), staging position from `staging.ts`, `Assault`/`staging_Assault` flags coloured by mode (plan/stage/attack/retreat/pause, blue = held by hand), targets = towers nearest the entry then spawns, safe mode pauses and donates the creeps to the nearest sibling (else recycle), nukes retreat, ballerinas and a scout once tower-free, winds down once only ramparts are owned. Shielded rooms (1 Nov 2026): no plain path -> the locator over `staging.ts hitsMatrix`, the path's blocked tiles as `memory.breach` heading the targets, replanned every 200 ticks (`watchBreach`). `wickClass` is what `AssaultThree` overrides. |
| `src/ms.assaultthree.ts` | REACHABLE | 2026 | `"AssaultThree <room> <home>"`: `AssaultTwo` with `wickClass = Wickthree`, for three-tower rooms. |
| `src/staging.ts` | REACHABLE | 2026 | Staging locator `findStaging(staging, targets, opts)`: one PathFinder search from the staging room's centre to the targets over the Rewalker matrices (or `opts.matrix`), the edge tile it leaves by (random when several) and the entry tile beyond, then a flee from that edge to 6 from every exit tile (terrain) and keeper lair of the staging room. `hitsMatrix(room)` prices a blocked tile at `log10(hits) * 20` for breach paths; `blockers(pos)` lists what blocks a tile, rampart first. |
| `src/job.wicktwo.ts` | REACHABLE | 2026 | `Wicktwo`, the wick family's base: 4 TOUGH 25 MOVE 12 RANGED_ATTACK 9 HEAL from the home room; boosts itself there (XGHO2, XLHO2, XKHO2 on request; a MOVE boost heading a subclass's list first, from a lab beside a spawn) before leaving; `spawnNearLabs` picks a spawn with a lab within 2 and `spawnDirections` steps out toward the lab; stage/attack by the mission's mode; flees melee within 2; beside a structure target `reposition` moves to the adjacent tile with equal or higher mass-attack damage; firing ladder and own-target picks (heap ids); heals itself every tick under tower threat, else `heal.ts healIdle`. |
| `src/job.wickthree.ts` | REACHABLE | 2026 | `Wickthree`: Wicktwo on 6 TOUGH 10 MOVE 21 RANGED_ATTACK 13 HEAL (the 50-part cap) with XZHO2 on the MOVEs first, `spawnNearLabs`; AssaultThree's fighter. |
| `src/job.ballerina.ts` | REACHABLE | 2026 | `Ballerina`: Wicktwo on the Crow body with no boosts, for tower-free rooms. |
| `src/job.crow.ts` | REACHABLE | 2026 | `Crow`: Guard on a fixed 25 MOVE, 24 RANGED_ATTACK, 1 HEAL body (5100) from the Capture home room; in staging mode walks to within 2 of the staging flag and waits, chasing nothing (after() still shoots and heals within reach, keepers excepted), in attack mode fights as a Guard and holds within 3 of the mission flag; retreats to the staging flag; a mode change drops its task. |
| `src/job.fedex.ts` | REACHABLE | 2026 | Fedex job for Xfer and XferStartup (extends Trucker): CARRY, CARRY, MOVE x 17 (33 CARRY, 1650 a trip, half speed off roads); home storage -> mission room storage (else terminal, containers, any energy structure, controller pile); recycles in the mission room when too old for another round trip. |
| `src/job.trucker.ts` | REACHABLE | 2026 | Trucker job for Remote: rsrc containers -> home storage (or, with none, home containers by most free space; `JobCreep.unloadHome`), paced by the source regen / haul rate. |
| `src/job.paver.ts` | REACHABLE | 2026 | Paver job for Once: harvest, build any site, repair roads/containers in the mission room. |
| `src/job.ctrlhauler.ts` | LIVE | 2026 | CtrlHauler job for GlobalRespawn/Hub: refills the Meta_ctrl container from storage while storage >= 100k and not adjacent to the container, and both container and ctrl creep are empty. |
| `src/job.chemist.ts` | REACHABLE (Hub mission) | 2026 | Chemist job, Task2 port of `role.chemist.ts`: fills labs with their `planType` and energy (claimed boost labs first, emptiest first; energy for a claimed lab under 1000 before any mineral run, since 1 Nov 2026), drains labs per `mineralDrain()`, carries ghodium to the nuker, moves stray non-energy (piles, tombstones, ruins, containers) into the storage. One per Hub room with a terminal and a lab. |
| `src/ms.bulldoze.ts` | REACHABLE (by command string) | 2026 | `"Bulldoze <target> [home]"` (home = spawn room; `aim(x, y)` places its anchor flag, `dozers` setter): keeps a list of tiles to clear (`memory.doze`) with a child flag per tile, seeded by a breach plan from the anchor toward the nearest hostile spawn. `bulldoze*` flags in the target room add a tile / move it to the front and are removed; a breach path from the home room's first spawn to the first tile (plains = swamp, blocked tiles cost `round(log10(hits)*20)`) adds every blocked tile on the way; draws markers; one Bulldozer while the list is not empty. |
| `src/job.bulldozer.ts` | REACHABLE (Bulldoze mission) | 2026 | Dismantler, 1 WORK per MOVE (25W/25M): one `planWalk` over all the mission's tiles with the regular matrix, dismantles what stands on the one it reaches (rampart first); takes an XZH2O boost in the home room when a lab has it. Exports `dozeable(pos)`. |
| `src/ms.raze.ts` | REACHABLE (by command string) | 2026 | `"Raze <room> [home]"`: one Razer clears a room of foreign structures and sites; winds down when the razer decommissions or the room visibly holds no structure another player owns. |
| `src/ms.nidoran.ts` | REACHABLE (by command string) | 2026 | `"Nidoran <room> [player]"`: tracks a player's reserved and claimed rooms from intel, rotates an active reserved room within 2 hops (claimed rooms forbidden, unreachable ones blacklisted, dropped on 2+ defenders or no roads/containers) and paces Chaos creeps at `(1500 - 50*dist)/2` from the "close" spawns of the mission room. |
| `src/job.chaos.ts` | REACHABLE (Nidoran mission) | 2026 | 5 MOVE 1 WORK harasser: dismantles the active room's structures furthest from its sibling, flees armed creeps within 5 (across rooms), retreats into the nearest owned room under 100 hits or TTL. Exports `chaosTargets(room)`, `kChaosBody`. |
| `src/job.razer.ts` | REACHABLE (Raze mission) | 2026 | Bulldozer-bodied dismantler: takes down every structure that is not ours (`targets()`, cheapest walk first, rampart first on a tile), stomps foreign construction sites like a Scout, and after `idleTicks` (10) idle ticks walks back to its origin spawn to be recycled (JobCreep.recycleAt). Exports `razeTargets(room)`; Canopener extends it. |
| `src/ms.loot.ts` | REACHABLE (by command string) | 2026 | `"Loot <room> [home]"`: loots a beaten invader stronghold: a Scout for vision, one Canopener per container under a foreign rampart, one Looter while an open container holds anything, invader creeps ignored, nothing while a core still stands; winds down once every container is empty. |
| `src/job.canopener.ts` | REACHABLE (Loot mission) | 2026 | A Razer (fixed 32 WORK 16 MOVE, home-room spawn with the full 4000) that only dismantles the ramparts over the mission room's containers, flees keepers, and recycles the tick none is left. |
| `src/job.looter.ts` | REACHABLE (Loot mission) | 2026 | A Sktrucker pointed at the mission room's uncovered containers, taking every resource (largest stack first); dodges keepers only (invaders ignored); empty under 100 TTL it recycles at its origin spawn. |
| `src/ms.thorsurvey.ts` | REACHABLE (by command string), TEMPORARY | 2026 | `"ThorSurvey <room> [quadrant]"` (1 Nov 2026): radar-observes a sector's non-highway rooms (or a quadrant) and records each one's thorium holdings in `Memory.thorsurvey`; `status()`/`table()` rank them. Not intel; delete with its memory once a raid target is picked. |
| `src/ms.stealreactor.ts` | REACHABLE (by command string) | 2026 | `"StealReactor <core>"`: radar-observes the core, picks the spawning room whose route to it crosses the fewest rooms, observes the Rewalker route and keeps one Usurper on the way no matter what (since 1 Nov 2026; before, only with a fueled reactor not ours, no CLAIM creep there and every route room's intel under 50 ticks stale). |
| `src/job.usurper.ts` | REACHABLE (StealReactor mission) | 2026 | Immortan body (MOVE x5, CLAIM) from the mission home; walks to the core, claims the reactor until it reads `my`, then walks with the keeper layer off into a neighbouring keeper room and up to a Source Keeper to die. |
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
| `src/creep.enemy.ts` | REACHABLE | 2026 | `EnemyCreep`: an enemy creep's id and last seen position, kept on a job instance across ticks (`c` re-reads the Creep, `pos` falls back to the last sighting); `Wolf.lastTarget`. Also the militant helpers (31 Oct 2026): `isActiveMilitant` (a working ATTACK or RANGED_ATTACK part), `isInactiveMilitant` (weapons all broken, or a healer), `isMilitant`, and the same as getters on the class; the Assault missions and the wick use them. |
| `src/suppress.ts` | REACHABLE | 2026 | `suppressMicro`/`suppressPup(mission)`: the unarmed-enemy rules shared by `Farm`/`Remote` and `Hub`/`Thorhub`. |
| `src/job.micro.ts` | REACHABLE | 2026 | Micro job for `Farm`/`Remote`/`Hub`/`Thorhub`: [RANGED_ATTACK, MOVE]; laid once per lifetime after 50 ticks of enemy creeps with no armed hostile; shoots only enemies without RANGED_ATTACK, kites melee, flees ranged. |
| `src/job.pup.ts` | REACHABLE | 2026 | Pup job for `Farm`/`Remote`/`Hub`/`Thorhub`: a Wolf with `memory.size` ATTACK + MOVE pairs; three per lifetime while unarmed enemies with HEAL are in the room, sized heal power / 30 / 2. |
| `src/job.farmer.ts`, `src/job.wolf.ts`, `src/job.guard.ts`, `src/job.mini.ts`, `src/job.reserver.ts` | REACHABLE | 2026 | Jobs for `Farm`/`Remote`; Task2 ports of `role.farmer.ts`, `role.wolf.ts`, `role.guard.ts` (`Mini` = `Guard` on the `mini` body) and `role.reserver.ts`. |
| `src/strat.ts` | LIVE | 2020 | `NullStrat`/`ActiveStrat`/`ClaimedStrat` per room with `evolve()`; hostile lists; runs towers/labs/links/meta/factory; `ActiveStrat` builds mission metas in unclaimed rooms. |
| `src/shed.ts` | LIVE | 2019 | `run(objs, bucket, fn)` CPU-guarded loop; `canRun`. |
| `src/cache.ts` | LIVE | 2019 | `tick`/`cache` properties on Room/RoomObject; `theTick.inject`. |
| `src/debug.ts` | LIVE | 2019 | Logging with source locations; `Debuggable` mixin. |
| `src/lib.ts` | LIVE | 2017 | `merge`, `roProp`, `byId` (optional-id lookup), room-name helpers, tower falloff math. |
| `src/roomobj.ts` | LIVE | 2019 | `@extender`, `@injecter`; `effectTTL/effectLvl`. |
| `src/guards.ts` | LIVE | 2019 | Type guards (`isSType`, `isStoreStruct`, ...). |
| `src/constants.ts` | LIVE | 2017 | RCL energy caps, reaction tables, `EnergyReserve`. |
| `src/types.d.ts` | LIVE | 2019 | Global type augmentations. |
| `src/tobj.ts` | LIVE (loaded via `tstruct`) | 2026 | `TObj<T>` wrapper keyed by id with the `pos` it was made at (`xy` packed x*100+y and `roomName` derived; `obj` = `Game.getObjectById`, else null; `tryObj` throws) and `Registry`: hot/cold maps with `get(id, make)` / `peek(id)`; a collection every 500-1000 ticks (period plus a random period of jitter), run on fetch, re-sorts by whether `obj` resolves and drops wrappers gone for two periods. The spike's tobj.ts without lifecycle tracking or the sweep daemon. |
| `src/tstruct.ts` | LIVE (`stype6` via `struct.ts`; the wrapper is unused) | 2026 | `TStruct<S extends Structure = Structure> extends TObj<S>` (structType; `s` / `trys` typed `S`) in one shared `Registry`: `make(struct)` builds the class a subclass `@register`ed for the structure type (derived from the class name: TObserver -> observer, camel-cased), else TStruct, typed through the augmentable `Wrappers` map; `makeId(id)` returns an existing wrapper or null; `note` / `toString` as `struct.ts`, whose `stype6` now lives here. Loaded for `stype6`; no live code makes a wrapper yet (first pieces of [tcreep-design.md](tcreep-design.md) phase 2). |
| `src/tstruct.observer.ts` | LIVE (register) via `radar.ts` | 2026 | `@register TObserver extends TStruct<StructureObserver>`: `observeRoom` passthrough and `observeMax` (the `struct.observer.ts` range-check sidestep ported onto the wrapper), both `ERR_INVALID_TARGET` when the observer is out of sight, plus `powered` (under `PWR_OPERATE_OBSERVER`); augments `Wrappers` so `TStruct.make(observer)` is typed `TObserver`. Imported by `radar.ts` and `strat.ts`, which wraps its room's observer with it for `theRadar.add` at RCL8. |
| `src/Tasker.ts` | LIVE (types) | 2019 | `TaskRet`; `Tasker` class used only by flag. |
| `src/pace.ts` | LIVE (`humanize`) | 2019 | Tick-rate estimate (sampler not wired). |

## Metastructure and flags

| file | status | since | purpose |
|---|---|---|---|
| `src/metastruct.ts` | LIVE | 2019 | Base templates, planning via genesis flags, construction upkeep, maxHits, spawn energy order, link modes; the manager's traffic (roads for every meta's `traffic()` entries, replanned after any change). |
| `src/flag.ts` | LIVE | 2019 | `FlagExtra`: parent/child naming, `self`, `role`, `dupe`, colours in `toString`. `run()`/`darkRun()` dead. |
| `src/Visual.ts` | LIVE (draw) | 2019 | `RoomVisual.structure/animatedPosition/speech/resource` used by metastruct `draw`. |

## Creep prototype layer

| file | status | since | purpose |
|---|---|---|---|
| `src/creep.ts` | LIVE | 2019 | `CreepExtra`: body stats, hostile flags, `bodyInfo`. |
| `src/creep.role.ts` | LIVE | 2019 | `CreepRole`: `run/after` dispatch, task memory, boosts, `team` shim. |
| `src/creep.move.ts` | LIVE | 2019 | Rewalker-backed moves, `moveRoom`, `moveSpot`, flee/retreat. |
| `src/creep.carry.ts` | LIVE | 2019 | Transfer/withdraw/pickup families. |
| `src/creep.harvest.ts`, `creep.build.ts`, `creep.repair.ts` | LIVE | 2020 | `goHarvest`; build tasks; repair tasks + `repairable`. |
| `src/creep.work.ts` | LIVE | 2017 | Upgrade/reserve/harvest-spot tasks used by startup/worker; first link of the legacy mixin chain (`CreepWork` -> `CreepOldRepair` -> `CreepAttack` -> `CreepDismantle` -> `CreepHeal`) every 2017 `role.*.ts` class extends. |
| `src/creep.oldrepair.ts` | LIVE (partly) | 2020 | `taskTurtle*` used by worker/bootstrap; references undefined `room.wallMax`/`room.turtle`. |
| `src/creep.attack.ts`, `creep.dismantle.ts`, `creep.heal.ts` | DEAD | 2017 | Combat helpers for roles no job spawns. |
| `src/role.bootstrap.ts` (`startup`), `role.reboot.ts`, `role.worker.ts`, `role.hauler.ts` | LIVE | 2017-18 | Live legacy roles (`role.ctrl.js` was ported into `job.ctrl.ts` and deleted, Nov 2026). |
| `src/role.hub.ts`, `src/role.src.ts` (`asrc`/`bsrc`) | LIVE | 2019-20 | Live TS roles. |
| `src/role.cap.ts`, `role.mason.ts`, `role.mineral.ts`, `role.shovel.ts`, `role.shunt.ts` (`core`/`aux`), `role.depositfarmer.ts` | REACHABLE | 2020 | TS roles with no job class. |
| `src/role.archer.ts`, `bulldozer`, `caboose`, `cart`, `chemist`, `claimer`, `cleaner`, `collector`, `coresrc`, `declaimer`, `defender`, `drain`, `dropper`, `farmer`, `guard`, `harvester`, `manual`, `medic`, `minecart`, `miner`, `paver`, `power`, `ram`, `rambo`, `reserver`, `scout`, `srcer`, `stomper`, `trucker`, `upgrader`, `wolf`, `zombiefarmer` (2017 mixins) | REACHABLE (no job) | 2017-19 | Legacy roles merged onto `Creep`; see [creep-roles.md](creep-roles.md). |
| `src/role.recycle.ts` | ORPHAN | 2019 | Not imported. |
| `src/role.ts`, `src/role.legacy.ts` | ORPHAN | 2018 | Class-based role experiment. |

## Rooms and structures

| file | status | since | purpose |
|---|---|---|---|
| `src/room.ts` | LIVE | 2017/19 | `findStructs`, `lookForAtRange`, spots, `energyFreeAvailable`, `maxHits`. |
| `src/path.ts` | LIVE (packing) | 2017 | `pos.xy`, `packPos/unpackPos`; `Path` class dead. |
| `src/source.ts` | LIVE | 2017 | `source.spots/bestSpot/note/regenTTL`. |
| `src/struct.ts`, `constructionsite.ts`, `tombs.ts` | LIVE | 2017-20 | `note`/`toString`/`hurts`/`repairs`. |
| `src/struct.link.ts` | LIVE | 2019 | Link modes, `runLinks`, `storageBalance`, `hubNeed`. |
| `src/struct.tower.ts` | LIVE | 2017 | `runTowers` (overheal branch broken). |
| `src/heal.ts` | LIVE | 2026 | Heal-target choice shared by every fighter that heals when idle: `isFighter` (ATTACK or RANGED_ATTACK parts), `hurtFriendlies`, `healPick` (fighters before civilians, then the caller's score, hits lost by default). Used by `JobCreep.pickHurt` (Guard, Crow, Toxic), `Guard.after` and `creep.heal.ts` `idleHeal` (Skhunter, legacy roles). `healSelf` and `healIdle` (31 Oct 2026) are the job-layer idle heal cascade (self while hurt, adjacent friendly, rangedHeal within 3, overheal self on request) that `Guard.after` and the wick run. |
| `src/struct.observer.ts` | LIVE (prototype) | 2026 | `observeMax(roomName)` on `StructureObserver`: `observeRoom` with the API's range check sidestepped by lending `this.effects` a `PWR_OPERATE_OBSERVER` entry for the call (the server never checks range; confirmed Oct 2026). Nothing calls it yet. |
| `src/struct.lab.ts` | LIVE | 2017 | `runLabs`, `autoReactAll` (skipped in a room a `LabPlan` manages), boosts. |
| `src/labplan.ts` | REACHABLE | 2026 | `"LabPlan <room>"`: stock-aware lab chooser; walks `Reactions` from a console-edited priority list of products and quotas (`Memory.labplan[room].plan`) and calls `terminal.setLabs()` with the deepest reaction whose inputs are stocked; holds a running product 500 ticks before switching. |
| `src/struct.factory.ts` | LIVE | 2020 | `runFactory` (alloy). |
| `src/struct.container.ts`, `struct.controller.ts` | LIVE | 2017 | `mode`; `resTicks/reservable`. |
| `src/struct.terminal.ts` | LIVE (helpers) / DEAD (`run`) | 2017 | Fill/drain thresholds used by hauler; market automation dead. |
| `src/room.keeper.ts` | DEAD | 2017 | Old construction planner. |
| `src/intel.ts` | LIVE | 2020 | Room intel, `roomKind`, coordinates. |
| `src/radar.ts` | LIVE (`run` from `main.ts` since 13 Oct 2026) | 2020 | Observer scanning on `TObserver` wrappers (`tstruct.observer.ts`) kept in a heap map by id (`add` / `remove`; `strat.ts` adds its room's observer every tick at RCL8 and `run` removes any not in sight): requests queue on the heap in three sets until the next `run()`: `observeNow(...rooms)` (priority, scored 1000 ticks staler), `observe(...rooms)` and `observeBackground(...rooms)` (1000 fresher, and ignored while the room was seen within 50 ticks); `run` sorts them stalest first and gives each the next free observer through `observeMax` (any room on the map, no range check) unless the room is in sight and claimed or holds our creeps or power creeps (a visible room with no creeps is re-observed to keep the vision); observers left over `scan` for the unseen or stalest open room in range not observed this tick (a set `run` keeps and passes in; nothing per tick lives in the tick cache any more) (highways stale at 10 ticks, others at 100). |
| `src/market.ts` | LIVE (`MarketSweep` daemon) / REACHABLE (swipeworth, Selloff) | 2020, rewritten 2026 | `MarketSweep` prices every traded resource each 100 ticks (`sweep()` by hand); `buyOrderPriceEma(res)` (prices the tick, returns the `buy95` average), `bidUnits(res, minPrice)`, `getBuyOrderPrice`/`getSellOrderPrice` (+ `tryGet*`) tick prices over the best 10k units via `markethack`, energy by effective price, feeding the `Memory.market` averages. |
| `src/swipeworth.ts` | REACHABLE (Swipe mission, Furiosa swipe) | 2026 | `worthSwiping(res, home)` / `minSwipePrice(home)`: a resource is worth looting when it sells for 2x what energy costs delivered to the home room; energy always; everything when there is no market. `worthless(res)`: the buy-order price's short moving average (`market.buyOrderPriceEma`, `buy95`) is under energy's; with a thin book, nobody bids energy's price or better (what swipers and Furiosa will not pick up off the ground). `junkIn(store)`: the worthless minus the catalyzed boosts (`X...`), what Konmari throws out. |
| `src/job.konmari.ts` | REACHABLE (Swipe mission sparkJoy) | 2026 | Carries junk (worthless, catalyzed boosts excepted) out of the home stores and drops them 20 a tick outside the home room. |
| `src/deposit.ts` | DEAD | 2020 | Deposit team creation; `depositDist` used by dead team code. |

## Movement

| file | status | since | purpose |
|---|---|---|---|
| `src/Rewalker.ts` | LIVE | 2019 | Pathing/walking engine. |
| `src/routes.ts` | LIVE (`dist`) | 2019 | Room distance cache; `isHostile`. |
| `src/matrix.ts` | DEAD | 2017 | Cost matrices for teams. |
| `src/spots.ts` | LIVE | 2020 | `getSpots`: walkable tiles beside a source/controller, used by `job.reserver`, `ms.farm`, `ms.startup`, `ms.thormine` (and dead `team.ts`). |
| `src/FindRoute.ts`, `src/PriorityQueue.ts` | ORPHAN | 2022 | Custom findRoute. |

## Legacy orchestration and misc

| file | status | since | purpose |
|---|---|---|---|
| `src/team.ts`, `src/team.egg.ts` | DEAD | 2017/19 | Flag teams and egg factories. |
| `src/spawnold.ts` | LIVE (`findSpawns`, `buildBody`) / DEAD (`run`) | 2017 | Body table still used by `JobRole`. |
| `src/powercreep.ts` | LIVE | 2026 | `TPowerCreep` (powers, level, class) on `TAnyCreep`, `EnemyPowerCreep` (by id, for `enemy.ts`) and `MyPowerCreep` (every PowerCreep intent through `issue`, one wrapper per power, `spawn` records `memory.birth`, `idleRenew`/`runRenew`, `questSwipe` on `swipe.ts`) plus `getPowerCreep(name)` / `myPowerCreeps()` ([tcreep-design.md](tcreep-design.md) Appendix D). The 2019 prototype roles are gone (git history; [legacy-systems.md](legacy-systems.md)). |
| `src/console.ts` | REACHABLE (console) | 2019 | Global console helpers and client hacks. |
| `src/markethack.ts` | LIVE (side effect) / REACHABLE (console, no importer yet) | 2020, rewritten 2026 | `getAllOrders` / `getOrderById` with `Game.market`'s signatures, read from the engine's raw order table (a Symbol getter on `Object.prototype`, installed at import) with a fallback to the API; no-op on `shardSeason`. `status()` from the console. See [legacy-systems.md](legacy-systems.md). |
| `src/history.ts`, `memprof.ts`, `memhack.ts`, `profiler.ts`, `server.ts`, `stack.ts`, `planner.ts` | ORPHAN | 2017-20 | See [legacy-systems.md](legacy-systems.md). |

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
