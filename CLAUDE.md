# Screeps AI (deft-code/screeps)

Game AI for [Screeps](https://screeps.com), 2017-2026, ~30k lines in `src/`
(120 TypeScript, 65 JavaScript). Compiled with gulp-typescript to `distjs/` and
pushed with gulp-screeps. **Current target: Season 11 (`shardSeason`)**; the
code also accepts MMO `shard2` and refuses every other shard.

Detailed docs live in `docs/`. Read the one that matches your task before
grepping: most function names you find have two or three implementations from
different eras, and only one is live.

## Read this first: what is actually running

`src/main.js` has an unconditional `return` right after `process.runAll()`
(line 419 as of Oct 2026); everything below it is dead. The live loop is:

```
shard guard -> genPixels (shard2 only)
run(rooms, 500, r => r.strat.init())   # hostile lists, updateIntel, Rewalker.gatherIntel per visible room
process.runAll()                       # everything else happens here
return                                 # the rest of the function is dead
```

`process.runAll()` runs a priority table of processes
([docs/runtime-tick.md](docs/runtime-tick.md)):

| process | how it gets there | does |
|---|---|---|
| `Hub <room>` missions (W26S8, W25S7, W27S4 since 11 Oct 2026) | `scheduleService('Hub W25S7')`, then `Memory.scheduler.services`, replayed by `Service.boot()` at every global reset; **never constructed in code** | lays eggs for asrc/bsrc/hauler (1-3 by dropped energy)/worker/ctrl/hub/upgrader/ctrlhauler/chemist from the room's own spawns, plus one hubminer while the `min` meta's extractor stands on a non-thorium mineral with minerals left and storage + terminal hold under 100k of it, and one hubminecart while that mineral container holds anything (two past half full), and runs those creeps |
| `Thorhub <room>` missions (W29S7, W24S7; W27S4 was evolved into `Hub W27S4` on 11 Oct 2026) | scheduled, same way | `Hub` for a temporary thorium room: plain Hub with a full-size ctrl up to RCL5; from RCL6 an RCL2-sized ctrl and no upgraders or ctrlhaulers; runs the room on the `thorclaimed` strat (`strat.thor.ts`, ramparts capped at 1M) via `setRoomStrat`. To turn one into a full room: `getService('Thorhub X').evolve('Hub X')` then `require('strat').setRoomStrat('X', null)` (`evolve` kills without `windDown`, so the strat is not reset by itself) |
| `GlobalRespawn` mission | **not scheduled** since Sept 2026 (evolved into `Hub W26S8`); schedule it by hand after a respawn | the Hub loop plus `max(1, 6-rcl)` startups and a fixed 2 haulers, in `Game.spawns.Home`'s room; `evolve('Hub <room>')` it once the room stands |
| `Remote <farm> <home> [spawn]` missions | scheduled, same way | remote sources: harvester/trucker/reserver/scout, plus guard/mini/wolf against hostiles and invader cores |
| `Reactor <home>` missions | not scheduled as of 22 Sept 2026 (replaced by `ReactorDepot W25S7`); `scheduleService('Reactor W26S8')` brings one back | Season 11 scoring: scout, warboys (thorium runners), immortan (reactor claimer), guard at the sector core, plus one toxic (bait-and-trap mini) per lifetime while an armed enemy without HEAL is there, and one prospector per 1450 ticks on the core's ordinary mineral while no armed enemy is there and home holds under 50k of it (`ReactorDepot` inherits it) |
| `ReactorDepot <home> [cap]` mission | scheduled (`ReactorDepot W25S7`, since 22 Sept 2026; **paused by hand since 9 Oct 2026**, `resume()` restarts it), same way | `Reactor` with warrunners in place of warboys: they load thorium from the home terminal (laid only while it holds over 1000) and carry it to the reactor; scout, guard, immortan and the core pause are inherited. `pause()` (persisted as `held` in mission memory) lays nothing at all, scouts included, and purges the eggs; `status()` shows `held`; `resume()` clears it |
| `SkFarm <room> <home>` mission (`SkFarm W25S6 W25S7`, since 9 Oct 2026) | scheduled, same way | Source Keeper farm: a scout while the keeper room is out of sight, then one skhunter, one skvulture, three skharvesters one sktrucker per source container holding 500+ energy, and one prospector while a Source Keeper tombstone lies within 5 of the mineral with no armed enemy about and home holds under 50k of that mineral, all from the home room and paced per 1450 ticks (`paceNJobs(x, n, 1450)`); the hunter kills the keeper room's Source Keepers one at a time, the vulture hauls the piles and tombstones home. With vision it picks a spot per source and mineral (the tile beside it furthest from the nearest lair, heap only) and keeps an `rsrc` meta per source spot for the `skharvester`s |
| `Thormine <room> [dest]` missions (W29S7 scheduled as of 11 Oct 2026 with teardown off; W27S5, W29S4 and W27S4 are done and descheduled; `getService(x).status()` for the current state) | scheduled, same way | one thoreater per walkable tile beside the room's thorium but one (at least one) (only with thorium left, an extractor on it and a terminal); they mine into the terminal, which ships to `dest` (default W25S7) every cooldown. Teardown is **off by default** (`getService('Thormine W27S5').teardownEnabled = true` turns it on, persisted in mission memory); with it on, once the thorium is exhausted and the terminal holds nothing but energy it **tears the room down** (a mineral remainder under `TERMINAL_MIN_SEND` cannot ship by itself: top it up from the destination terminal and the next cooldown ships it back): winds down every mission homed there, drains all energy into the terminal with `cleanup` creeps, ships it, destroys every structure and unclaims (`abortTeardown()` works until destruction starts) |
| `Startup <room> [home]` mission (`Startup W28S8 W29S7` since 11 Oct 2026, waiting on GCL 6 to claim; W24S7, genesis `Front`, was claimed under it) | scheduled, same way | claiming another room: scout, claimer, pioneers, one harvester per asrc/bsrc meta while owned below RCL3, guard until it has a tower (and, while unowned, one guard whenever an enemy creep is in the room). With GCL full it plans (and draws, yellow dashed) a Rewalker-costed road from the controller to the home spawn instead of laying a claimer, but keeps only the tiles within 3 of the controller as an `rroad_<room>_startup` traffic entry (stub end to controller) that the room's MetaManager turns into road (the rest of the room is the genesis metas' job), and sends pavers to the room while it is unowned with sites, and while the room is free sets its prebuild level so ActiveStrat places every planned road up to level 3 ahead of the claim and holds the reservation with reservers paced like Remote's; a foreign reservation draws reservers while GCL is full; an invader core in the room draws a wolf every 1500 ticks |
| `Capture <room>` mission (`Capture W25S5` scheduled 11 Oct 2026 as the first test) | scheduled, same way | takes a room with `crow`s (25 MOVE 24 RANGED_ATTACK 1 HEAL) from the nearest owned RCL7+ room (kept as home); a `Capture` flag at the target's intel centre and a `staging_Capture` child 5 tiles into the room before it on the route home (both left alone while in their rooms); one crow egg at a time while the crows' ranged power is not more than the enemy creeps' in the target room; crows wait at the staging flag until those within 5 of it outgun the enemy, then fight as guards and hold at the flag, falling back when the crows in the target or staging room drop under half the enemy's power; the home observer (else a scout) gives vision |
| `LabPlan <room>` service (`LabPlan W25S7` since 11 Oct 2026) | scheduled, same way | stock-aware lab chooser (`labplan.ts`): walks the reaction chains of a console-edited priority list (`Memory.labplan[room].plan`, default XLHO2 then XGHO2 at 3000) and sets the labs to the deepest reaction whose two inputs are stocked in terminal + storage, idling them when nothing is makeable; keeps `struct.lab.js`'s autoReactAll off in that room |
| `ClaimedStrat` per owned room | `room.strat` constructor `exec`s itself | towers, safe mode, labs, links, metastruct construction (traffic replans included), factory |
| `FlagService` daemon | `@daemon` at import | orange genesis flags -> metastruct planning; purple flags -> transient services named by the flag (`Swipe_W4N3_W3N4`) |
| `SpawnDaemon` | `@daemon` at import | turns eggs into `spawnCreep` |
| `SpawnTelemetry` | `@daemon` at import (`spawnload.ts`) | per-spawn busy ticks and creeps started, 500-tick windows in `Memory.spawns`; `spawnLoads()` prints it |

Consequences: no market automation, radar scanning, deposit farming, or flag
"teams" run on this build even though their code loads. The only
flags in the game are metastruct genesis/child flags (genesis `Home` W26S8,
`Port` W25S7, `Forth` W27S5, `Wind` W27S4, `Rote` W29S7, `Front` W24S7) and
purple service flags. Missions exist only while scheduled: the table is
`Memory.scheduler.services` (the room lists above are an Oct 2026 snapshot),
so read that key rather than trusting this list. Also scheduled as of Oct
2026: `Balance` (terminal energy leveller; rooms via
`getService('Balance').addRoom(room)`), `Always Guard W24S8 2`, `GrowFarm W29S6
W29S7` (`GrowFarm W23S7 W24S7` and `Farm W28S7 W29S7` have since evolved into `Remote`s; `Remote W22S7 W24S7` was added 11 Oct 2026). Run only by command string or a purple flag:
`Farm`, `GrowFarm` (a Farm that evolves into `Remote` at 800 home energy
capacity, 1300 if the farm controller has one free tile), `Once`, `Always`
(`Once` that keeps one creep of the job alive for good), `Swipe`, the
`Experiment` road-weight comparison (purple flag `Experiment` plus child
`dest_Experiment`), the `Selloff <room>` terminal-selling service and the
`Xfer <to> <from> [n]` storage-to-storage energy haul (fedexes; ends at 50k
left at home or the target storage 75% full)
([docs/missions-and-jobs.md](docs/missions-and-jobs.md)).

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
 ├─ strat.ts        NullStrat/ClaimedStrat per room (also processes); registerStrat/setRoomStrat override via Memory.rooms[x].strat (strat.thor.ts: ThorStrat)
 ├─ metastruct.ts   base templates + flag-driven planning + construction upkeep + maxHits + spot lookup
 │   ├─ metatraffic.ts  road planner: metas declare traffic() src/dest entries, MetaManager plans the room's roads; the shared road weights (2:3:6, Sept 2026)
 │   └─ roadplan.ts     room-to-room road planner on those weights (RoadPlanner): Remote legs, Startup's road, the Experiment purple-flag service (ms.experiment.ts)
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
while storage >= 100k and container + ctrl creep are empty), `hubminer`
(`job.hubminer.ts`, 2 WORK per MOVE sized to the room, drop-mines the `min`
meta's mineral into its container, never thorium, only while the extractor
stands, the mineral has something left and the room stocks under 100k of it),
`hubminecart` (`job.hubminecart.ts`, CARRY/CARRY/MOVE x 3, a Chemist that empties
that container and puts the mineral away by the Chemist's rules; recycles when
empty under 50 TTL or with container and mineral both empty). Those are the
base-room roles from `GlobalRespawn`/`Hub`. The scheduled missions add pure
job-layer creeps (no `roleXxx` method): `harvester` (also `Startup` below RCL3), `trucker`, `reserver`
(`Remote`); `paver` (`PaveAll`, requested by `Remote`/`Startup` for unowned road rooms with our sites); `warboy`, `immortan` (`Reactor`); `warrunner` (`ReactorDepot`); `thoreater`, `cleanup` (`Thormine`); `claimer`, `pioneer` (`Startup`);
and `scout`, `guard`, `mini`, `wolf` wherever a mission wants vision or a
fight; `micro` (`job.micro.ts`, RANGED_ATTACK + MOVE) and `pup` (`job.pup.ts`, a wolf sized to the enemy heal power) from `Farm`/`Remote`/`Hub`/`Thorhub` (`suppress.ts`) against unarmed enemies; `toxic` (`job.toxic.ts`, bait-and-trap mini) only by `Once Toxic <room> [count]`; `razer` (`job.razer.ts`, Bulldozer body) only by `Raze <room> [home]`, which clears a room of foreign structures and sites and recycles the creep when done; `skhunter` (`job.skhunter.ts`, 25 MOVE 20 ATTACK 5 HEAL, kills a keeper room's Source Keepers one at a time, healing up at range 4 between them) by `SkFarm <room> <home>`; `skvulture` (`job.skvulture.ts`, CARRY/MOVE x 17, loots the keeper room's largest energy pile or tombstone, locked by id, flees keepers within 4, hauls home when full, follows the skhunter when idle) by `SkFarm`; `skharvester` (`job.skharvester.ts`, 4 MOVE 8 WORK 1 CARRY, a Harvester on SkFarm's `rsrc` metas that flees keepers within 5 to range 6, holds at 6, and flees lairs under 4 ticks from spawning, and lays its own container site) and `sktrucker` (`job.sktrucker.ts`, CARRY/MOVE x 25, empties the fullest farm container home, same keeper flee) by `SkFarm`; `prospector` (`job.prospector.ts`, WORK/CARRY/MOVE/MOVE units sized to the home room, WORK first and MOVEs last; mines the farm's mineral from its spot, same keeper flee, home when full, under 100 TTL, broken or threatened, recycles empty at home under 200 TTL) by `SkFarm` and `Reactor`/`ReactorDepot`; `crow` (`job.crow.ts`, 25 MOVE 24 RANGED_ATTACK 1 HEAL, a Guard that stages and attacks on the Capture mission's mode) only by `Capture <room>`; `fedex` (`job.fedex.ts`, CARRY/MOVE x 25) only by `Xfer <to> <from> [n]`, which walks energy from one room's storage to another room; `chaos` (`job.chaos.ts`, 5 MOVE 1 WORK) only by `Nidoran <room> [player]`, which rotates paired dismantlers through a player's reserved remote rooms. Everything else with a `roleXxx` method is loaded but no job spawns it.
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
- Multi-statement probes: wrap in an IIFE and return `JSON.stringify(...)`:
  `echo '(function(){ ... return JSON.stringify(o); })()' | npx gulp console | grep "^< "`.
- Two console calls land ~3 ticks apart with `sleep 10` between them; longer
  sleeps are blocked by the tool, so sample in separate calls instead.
- `Game.creeps.x.debug = N` stores an expiry tick (`Memory.creeps.x.debug = Game.time+N`);
  writing a small number into `Memory.creeps.x.debug` directly is already expired.
- A creep that moves when `require('mycreep').getMyCreep(name).run()` is called from the
  console but never on its own means its mission is not being run: check
  `Memory.missions[m].hatch` (a hatched creep stuck there) and `require('process').Process.all()`.
- Bash heredocs holding big Python edit scripts with mixed quotes fail to parse in Git Bash;
  write the script to the scratchpad with Write and run `python -I <path>`.

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
getService('ReactorDepot W25S7').pause()      // lay nothing (scouts included), purge eggs, keep the mission; resume() undoes it
scheduleService('Reactor W25S7')              // bring it back
Game.rooms.W25S7.createFlag(30, 29, 'reactor_Port', COLOR_GREY, COLOR_GREY)  // child flag, then YELLOW, check log, GREEN
createFlagAt('W30S4', 25, 25, 'Loot', COLOR_ORANGE, COLOR_CYAN)   // any room, vision or not; genesis passes run blind too
Memory.creeps.hub1.fillTerminal = 50000       // hub creep fills the terminal from storage to this energy, ignoring storageBalance
getService('Thormine W29S4').teardownEnabled = true   // teardown gate; stranded minerals: top up from dest (see Thormine row)
getService('LabPlan W25S7').add('XZHO2', 3000)   // lab targets: add(res, quota, before?), remove, setQuota, reset, replan; status() shows chain stocks
require('intel').RoomIntel.get('W24S8').centerPos     // room centre (findRoomCenter), cached in intel.center; recenter() redoes it
```

Genesis flags reset themselves to CYAN (secondary `4`) when a command is done.
Remove a stuck egg: `delete Memory.creeps.warboy0` and `_.pull` it from
`Memory.missions[m].eggs`.

More in [docs/console-operations.md](docs/console-operations.md), including the
destructive `wipe`/`worldWipe`/`scalp`/`purgeWalls` helpers.

## Season 11 state and rules (measured live, Oct 2026)

- Owned rooms (11 Oct 2026): `W26S8` RCL7 (spawn `Home`, genesis `Home`), `W25S7` RCL8
  (`Port`), `W27S4` RCL6 (`Wind`, a Hub since 11 Oct 2026, its thorium mined
  out), `W29S7` RCL6 (`Rote`, a Thorhub), `W24S7` RCL4 (`Front`, a Thorhub)
  and `W29S4` torn down and unclaimed on 7 Oct 2026; GCL 5/5. `Balance`
  levels W26S8, W25S7 and W27S4. The sector core is `W25S5`
  (an x5y5 room is `Kind.Portal` in `intel.ts`). The reactor is fed by
  `ReactorDepot W25S7` (warrunners from the W25S7 terminal, which the
  Thormines fill); neither `Reactor` mission is scheduled. The walk to the
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
(`nest`, `home`, `task`, `task2`, `_walk`, `rewalksk`), `Memory.rooms[x].{intel, meta,
links, labs, spots, containers}`, `Memory.intel`, `Memory.flags[genesis].newer`,
`Memory.spawns[name]` (spawn telemetry, `spawnload.ts`; read it with
`spawnLoads()`), `Memory.Rewalker.rooms[x].{sk, cost}` (what blind walks know of
keeper tiles and route costs, written by `Rewalker.gatherIntel` from `strat.init`),
`Memory.debug`. Shapes in [docs/memory-layout.md](docs/memory-layout.md).

## Known traps (full list in docs/known-issues.md)

- A room claimed after first sight keeps `NullStrat` until reset (`evolve()`
  always returns `null`).
- `GlobalRespawn` (unscheduled, see above) uses the spawn named `Home`, else the first spawn in `Game.spawns`; with no spawns at all it throws every tick.
- `afterWorker` exists in both `role.worker.js` (wins) and `role.mason.ts`.
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
- Creep names (`role` + integer) are reused the moment a creep dies, across
  missions. Key any per-creep state that outlives the creep by `id`, never by
  name (mission tombs did, Oct 2026, and stalled a teardown for 1500 ticks).
- `terminal.send` to a terminal in a room we unclaimed returns OK and the
  resources vanish: structures there stay `my` but `isActive()` is false.
  Filter on `isActive()` before sending or balancing.
- If every creep of one mission freezes while others move, the mission's
  process fell out of the run table (a throw escaping `runRow`, fixed Oct
  2026 for `toString()`); `lsProcess` still shows it with a row. A push
  rebuilds the table.

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
- Room lists, RCLs and scheduled missions in this file are a dated snapshot;
  verify with `Memory.scheduler.services` and `Game.rooms` before relying on
  them, and refresh the snapshot when you change them.
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
| [docs/traffic-design.md](docs/traffic-design.md) | why and how roads are a MetaManager service: entries, the planner, replan triggers, decisions taken |
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
