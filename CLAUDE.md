# Screeps AI (deft-code/screeps)

Game AI for [Screeps](https://screeps.com), 2017-2026, ~30k lines in `src/`
(120 TypeScript, 65 JavaScript). Compiled with gulp-typescript to `distjs/` and
pushed with gulp-screeps. The shard guard in `src/main.js` accepts the seasonal
shard `shardSeason` and MMO `shard2` and refuses every other shard.

Detailed docs live in `docs/`. Read the one that matches your task before
grepping: most function names you find have two or three implementations from
different eras, and only one is live.

## Status: between seasons (read this first)

Season 11 (`shardSeason`, Sept-Oct 2026) ended on 1 Nov 2026 and the code
base was pushed to MMO `shard2` the same day (`npx gulp deploy`). What
follows from that:

- **Nothing in this file or in `docs/` describes a live game.** Room names,
  missions with rooms in their names (`Hub W25S7`, `Remote W27S9 W26S8`), RCLs,
  GCL, dates and battle results that appear in the docs are Season 11 examples
  and history kept because they explain why code is the way it is. The only
  truth about what is scheduled is `Memory.scheduler.services` on the server
  the code runs on; the only truth about rooms is `Game.rooms`.
- **Console tasks still default to the season world:** pass
  `SCREEPS_WORLD=mmo` to `gulp console`/`consoleTail`/`room` for shard2.
- **Before deploying to a new target:** pick the target and its gulp task
  (`npx gulp deploy` pushes to MMO `shard2`, `npx gulp season` to the seasonal
  server, `npx gulp ptr` to PTR), check `credentials.js`, widen the shard
  guard if the target is a new shard, and set `SCREEPS_WORLD` for the console
  tasks (they default to the season world). Expect an empty `Memory`: after a
  respawn, `scheduleService('GlobalRespawn')` by hand (the only mission that
  bootstraps a room from a lone spawn, in the room of the spawn named `Home`,
  else the first spawn), and `evolve('Hub <room>')` it once the room stands.
- **Season 11 code is still compiled and loads:** `reactor.ts`, the
  `Reactor`, `ReactorDepot`, `Thormine`, `Thorhub` and `StealReactor` missions
  and their jobs (`warboy`, `warrunner`, `immortan`, `thoreater`, `cleanup`,
  `usurper`), `Meta_reactor`, `Balance`'s thorium override and the `LabPlan`
  boost quotas. `reactor.ts` defines `RESOURCE_THORIUM`, `FIND_REACTORS` and
  `LOOK_REACTORS` as `undefined` at load where the server lacks them (a bare
  undeclared global throws, `if (!X)` guards included; `updateIntel` threw
  every tick on shard2 until it did), so every guard reads as written and
  the code is inert without the season's structures. Decide whether to keep,
  generalise or delete it once the next target is known, and update
  `docs/file-inventory.md` with the decision.
- Market code (`market.ts`, `markethack.ts`, `Selloff`) is a no-op on
  `shardSeason` (no market there). On shard2 the `MarketSweep` daemon keeps
  the `Memory.market` price averages current; `Selloff` was last measured
  there in Sept 2026 (`docs/legacy-systems.md`); re-check it before relying
  on it.

## What is actually running

`src/main.js` has an unconditional `return` right after `process.runAll()`;
everything below it is dead. The live loop is:

```
shard guard -> genPixels (shard2 only)
run(rooms, 500, r => r.strat.init())   # hostile lists, updateIntel, Rewalker.gatherIntel per visible room
process.runAll()                       # everything else happens here
theRadar.run()                         # observers serve observe requests, idle ones scan stale rooms
return                                 # the rest of the function is dead
```

`process.runAll()` runs a priority table of processes
([docs/runtime-tick.md](docs/runtime-tick.md)). Missions exist only while
scheduled: `scheduleService('Hub W25S7')` writes the command string to
`Memory.scheduler.services`, and `Service.boot()` replays that list at every
global reset. **No mission is constructed in code.** Daemons (`@daemon`) and
per-room strats start themselves. What each process does:

| process | does |
|---|---|
| `GlobalRespawn` | the room bootstrap: in `Game.spawns.Home`'s room (else the first spawn's) lays `max(1, 6-rcl)` startups and a fixed 2 haulers on top of the Hub loop below. Schedule by hand after a respawn; `evolve('Hub <room>')` once the room stands. Throws every tick with no spawns at all |
| `Hub <room>` | an owned room's economy from its own spawns: asrc/bsrc, hauler (1-3 by dropped energy), worker, ctrl, hub, upgrader, ctrlhauler, chemist, plus one hubminer while the `min` meta's extractor stands on a non-thorium mineral with minerals left and storage + terminal hold under 100k of it, and one hubminecart while that mineral container holds anything (two past half full) |
| `Thorhub <room>` | `Hub` for a temporary thorium room (Season 11): full-size ctrl to RCL5, then an RCL2-sized ctrl and no upgraders or ctrlhaulers; puts the room on the `thorclaimed` strat (`strat.thor.ts`, ramparts capped at 100k). `getService('Thorhub X').evolve('Hub X')` then `require('strat').setRoomStrat('X', null)` makes it a full room (`evolve` kills without `windDown`, so the strat is not reset by itself) |
| `Remote <farm> <home> [spawn]` | remote sources: harvester, trucker (once a container there holds over 500 energy), reserver (once a harvester of the mission stands in the room), scout, plus guard/mini/wolf against hostiles and invader cores; asks `PaveAll` for pavers in the road rooms |
| `Farm <farm> <home>`, `GrowFarm` | the older remote-source missions, command or purple flag only; `GrowFarm` evolves into `Remote` at 800 home energy capacity (1300 if the farm controller has a free tile) |
| `Startup <room> [home]` | claiming another room: scout, claimer, pioneers below RCL4, fedexes from the home storage (while it holds 50k+: one per pioneer standing in the room while it has only source containers, handing the load over; one per non-source container under 500 energy once it has one; two per lifetime while home holds more energy than the room's storage), one harvester per asrc/bsrc meta while owned below RCL3, guard until the room has a tower. With GCL full it plans a road from the controller to the home spawn instead of laying a claimer (only the tiles within 3 of the controller become an `rroad_<room>_startup` traffic entry), sends pavers, prebuilds planned roads to level 3 and holds the reservation with reservers. Winds down at RCL4 once the room has a terminal |
| `XferStartup <to> <from> [n]`, `Xfer <to> <from> [n]` | fedex energy hauls storage to storage; `Xfer` ends at 50k left at home or the target storage 75% full, `XferStartup` lays fedexes only while the target has a storage holding less than home's and ends once it has a terminal |
| `SkFarm <room> <home>` | Source Keeper farm from `home`: scout while out of sight, then one skhunter, one skvulture, three skharvesters (none while an armed non-keeper enemy is there), one sktrucker per source container holding 500+, one prospector while a keeper tombstone lies within 5 of the mineral and home holds under 50k of it, all paced per 1450 ticks; two wolves against a healing Invader, one guard against any armed non-keeper. Picks a harvest spot per source and mineral (furthest tile from the nearest lair) and keeps an `rsrc` meta per spot. `harvesting = false` stops the harvester/trucker eggs; `invaderless = true` background-radars the sector's eight keeper rooms and lays no skharvesters while a core in any of them is deployed or deploys within 3000 ticks. A core in the farm room itself holds every role but the scout |
| `Loot <room> [home]` | loots a beaten invader stronghold: scout for vision, one canopener (32 WORK 16 MOVE) per container under a foreign rampart, one looter while an uncovered container holds anything; winds down once every container is empty |
| `Raze <room> [home]` | one razer clears a room of foreign structures and sites and recycles when done |
| `Nidoran <room> [player]` | paired chaos dismantlers rotate through a player's reserved remote rooms within 2 hops of the seed room |
| `Bulldoze <room> <home>` | boosted dozers open a breach from an anchor flag (`aim(x, y)`, `dozers = n`) |
| `Capture <room>` | takes a room with crows (25 MOVE 24 RANGED_ATTACK 1 HEAL) from the nearest owned RCL7+ room: `Capture` flag at the target centre, `staging_Capture` flag one room back on the route; one crow egg at a time while the crows' ranged power does not exceed the enemy's (neighbours within 2 exits and enemy spawn rooms within 4 by route are radar-watched and counted in); crows wait at staging until they outgun the enemy, then fight as guards and fall back under half the enemy's power. `pause()`/`resume()` |
| `Assault <room> <home>`, `AssaultTwo <room> <home>`, `AssaultThree <room> <home>` | end-of-season tower assaults (`ms.assault.ts`, `ms.assaulttwo.ts`, `ms.assaultthree.ts`, `staging.ts`): `Assault` gets vision and evolves into the sibling for the tower count (`AssaultTwo` for two towers, `AssaultThree` for three; no other sibling exists). `AssaultTwo` keeps one boosted wicktwo (4 TOUGH 25 MOVE 12 RANGED_ATTACK 9 HEAL) from home, laid only while home holds the boosts; `AssaultThree` is the same mission with a wickthree (6 TOUGH 10 MOVE 21 RANGED_ATTACK 13 HEAL, MOVEs boosted with XZHO2 first, spawned from a home spawn with a lab within 2 and stepped out toward the boost lab); a shielded room (no path from staging to the targets) gets a breach: the locator rerun over a hits-weighted matrix (`log10(hits) * 20` per blocked tile, as `Bulldoze`), its blocked tiles listed in walking order ahead of the towers and replanned every 200 ticks; a wick beside a structure target steps to the adjacent tile where a mass attack deals as much or more; staging room = the target's safest neighbour nearest home, staging spot from `findStaging`; modes plan/stage/attack/retreat (nuke)/pause (safe mode over 400 ticks, creeps donated to the nearest other `AssaultTwo`), flag secondary colour shows the mode and blue set by hand holds everything; towers nearest the entry first, spawns spared while a tower stands (a spawn hit pops safe mode); a ballerina (wick on the crow body) replaces the wick once the room is tower-free. Results in `docs/missions-and-jobs.md` |
| `Reactor <home>`, `ReactorDepot <home> [cap]` | Season 11 scoring: scout, thorium runners (warboys mining, or warrunners loading from the home terminal), immortan holding the reactor, guard, toxic bait, prospector on the core's mineral. The depot's persisted `active` switch follows the terminal's thorium; `pause()`/`resume()`; it no longer pauses the core's `Capture` (it did as it went cold, until 1 Nov 2026), only lifts a pause it set |
| `Thormine <room> [dest]` | thoreaters mine a room's thorium into its terminal, which ships to `dest` every cooldown; with `teardownEnabled = true` (persisted) it tears the room down when the thorium is gone: winds down every mission homed there, drains energy with cleanups, ships it, destroys everything but roads and ramparts, unclaims (`abortTeardown()` until destruction starts) |
| `StealReactor <core>` | radar-watches a sector's core and keeps one usurper (MOVE x5 CLAIM) on the way from the nearest spawning room no matter what (since 1 Nov 2026; before, only while the reactor was fueled, not ours and free of CLAIM creeps, and the route freshly seen) to claim the reactor, then die to a keeper next door |
| `ThorSurvey <room> [NW\|NE\|SW\|SE\|all]` | temporary (1 Nov 2026): radar-observes the non-highway rooms of that room's sector, or a quadrant of it, and records each one's thorium (structure stores, piles, tombstones, ruins, creeps, the mineral) in `Memory.thorsurvey`; `status()`/`table()` list them most thorium first. Not intel; delete with its memory once a raid target is picked |
| `LabPlan <room>` | stock-aware lab chooser (`labplan.ts`): walks the reaction chains of a console-edited priority list (`Memory.labplan[room].plan`, `add`/`remove`/`setQuota`/`reset`) and sets the labs to the deepest reaction whose inputs are stocked, else an idle ladder (`docs/balance-design.md`); turns `struct.lab.js`'s autoReactAll off in that room |
| `Balance` | terminal balancer, no creeps: levels energy, brings RCL8 rooms to 10k of each base mineral, feeds lower rooms' minerals to their nearest RCL8 room, sends all thorium to one room, levels catalyzed boosts among RCL8 rooms (`docs/balance-design.md`); rooms via `addRoom`/`removeRoom` |
| `Once <Job> <room> [n]`, `Always <Job> <room> [n]` | one creep of a job class at a time, `n` in turn (`Once`) or one per lifetime for good (`Always`); the generic test harness for any job |
| `Swipe`, `Experiment`, `Selloff <room>`, `PaveAll` | purple-flag or command services: swiping loot, the road-weight experiment, terminal selling (no market on a seasonal shard), pavers for unowned road rooms with our sites |
| `ClaimedStrat` per owned room | `room.strat` constructor `exec`s itself: towers, safe mode, labs, links, metastruct construction and traffic replans, factory |
| `FlagService` daemon | orange genesis flags -> metastruct planning; purple flags -> transient services named by the flag (`Swipe_W4N3_W3N4`) |
| `SpawnDaemon` | turns eggs into `spawnCreep` |
| `SpawnTelemetry` | per-spawn busy ticks and creeps started, 500-tick windows in `Memory.spawns`; `spawnLoads()` prints it |
| `MarketSweep` | every 100 ticks prices both sides of every resource with an open order (best 10k units, `market.ts`), feeding the `buy`/`sell` 1/20 and 1/100 decaying averages in `Memory.market`; the on-demand sampling by swipers and `Selloff` only touches what they look at. No-op off-market; `require('market').sweep()` runs one by hand; its `status()` shows the last sweep's cost |

Not on this build even though the code loads: market automation, deposit
farming, flag "teams", power creeps. The only flags the code makes are
metastruct genesis/child flags, the `Capture`/`Assault` mission flags and
purple service flags ([docs/missions-and-jobs.md](docs/missions-and-jobs.md)).

## Architecture in one screen

```
main.js
 ├─ process.ts      Process/Service, priority rows critical>normal>low>late(>extra), canRun CPU gate
 ├─ mission.ts      Mission = Service with eggs->hatch->creeps lists in Memory.missions
 │   └─ ms.*.ts     @register, scheduled by command string
 ├─ mycreep.ts      MyCreep wrapper per creep name; role registry (@register/@registerAs); Task2
 │   ├─ job.creep.ts -> job.*.ts            pure Task2 jobs (this.c is the Creep)
 │   └─ job.role.ts  -> job.worker/ctrl/hub/hauler/srcer/guard/immortan.ts   start() = creep.run()+after()  (bridge)
 ├─ spawn.ts        SpawnDaemon + energyDef; spawnold.js supplies findSpawns/buildBody body table
 ├─ creep.role.ts   dispatch: creep name "asrc3" -> role "asrc" -> Creep.prototype.roleAsrc()
 │   creep.ts > creep.role.ts > creep.move.ts > creep.carry.ts > creep.harvest/build/repair.ts (mixins)
 │   role.*.ts (@injecter) and role.*.js (lib.merge via main.js `mods`) add roleXxx/afterXxx
 ├─ strat.ts        NullStrat/ClaimedStrat per room (also processes); registerStrat/setRoomStrat override via Memory.rooms[x].strat (strat.thor.ts: ThorStrat)
 ├─ metastruct.ts   base templates + flag-driven planning + construction upkeep + maxHits + spot lookup
 │   ├─ metatraffic.ts  road planner: metas declare traffic() src/dest entries, MetaManager plans the room's roads; the shared road weights (2:3:6)
 │   └─ roadplan.ts     room-to-room road planner on those weights (RoadPlanner): Remote legs, Startup's road, the Experiment service
 ├─ struct.link/tower/lab/factory/terminal/container/controller/observer  structure logic and prototype helpers
 ├─ Rewalker.ts     movement engine (matrix.js is dead)
 ├─ staging.ts / heal.ts / suppress.ts / labplan.ts   shared mission helpers
 ├─ cache.ts / debug.ts / roomobj.ts / lib.js / shed.ts   infrastructure
 ├─ reactor.ts      Season 11 helpers: sectorCore, findReactors, thoriumMineral; defines the season globals as undefined off-season (main.js imports it first)
 └─ intel.ts / radar.ts / market.ts / deposit.ts          intel and radar are live; the rest only registers
```

Docs: [missions-and-jobs](docs/missions-and-jobs.md),
[spawning](docs/spawning.md), [creep-roles](docs/creep-roles.md),
[metastruct](docs/metastruct.md), [room-and-structures](docs/room-and-structures.md),
[movement](docs/movement.md), [memory-layout](docs/memory-layout.md).

## Live creep roles

Base-room roles laid by `GlobalRespawn`/`Hub` (legacy `roleXxx` methods behind
the `job.role.ts` bridge): `startup`/`reboot` (`role.bootstrap.js`), `worker`
(`role.worker.js`), `ctrl` (`role.ctrl.js`), `hauler` (`role.hauler.js`), `hub`
(`role.hub.ts`), `asrc`/`bsrc` (`role.src.ts`); and pure jobs `upgrader`
(`job.upgrader.ts`, only while RCL < 8 and storage >= 100k energy),
`ctrlhauler` (`job.ctrlhauler.ts`), `hubminer` (`job.hubminer.ts`, drop-mines
the `min` meta's mineral, never thorium), `hubminecart` (`job.hubminecart.ts`, a
Chemist that empties that container).

Mission jobs (`job.*.ts`, no `roleXxx` method): `harvester`, `trucker`,
`reserver` (`Remote`; the harvester lays its own container site); `paver`
(`PaveAll`); `claimer`, `pioneer`, `fedex` (`Startup`, `Xfer`, `XferStartup`;
a fedex in a room with no container hands its load to the creeps that take it,
`donate`); `scout`, `guard`, `mini`, `wolf` wherever a mission wants vision or
a fight; `micro` and `pup` (`suppress.ts`) against unarmed enemies in farms and
hubs; `toxic` (bait-and-trap mini, `Once Toxic <room>`); `razer` (`Raze`);
`canopener` and `looter` (`Loot`); `chaos` (`Nidoran`); `bulldozer`
(`Bulldoze`); `skhunter`, `skvulture`, `skharvester`, `sktrucker`, `prospector`
(`SkFarm`; the prospector also for `Reactor`); `crow` (`Capture`); `wicktwo`,
`wickthree` and `ballerina` (`AssaultTwo`/`AssaultThree`); Season 11 only: `warboy`, `warrunner`,
`immortan` (`Reactor`/`ReactorDepot`), `thoreater`, `cleanup` (`Thormine`),
`usurper` (`StealReactor`). Bodies, flee rules and quirks of each are in
[docs/creep-roles.md](docs/creep-roles.md) and the file headers. Everything
else with a `roleXxx` method is loaded but no job spawns it.

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
- `@task` persists a job method's arguments in `memory.task2` and resumes it
  each tick; it was a no-op until Oct 2026 and most former uses are the
  no-op `@taskbroken` (re-enters `start()` every tick). Move a job to the fixed
  `@task` deliberately (docs/known-issues.md).

## Build & deploy

`npm install`; copy `blank_credentials.js` to `credentials.js` (gitignored).
`npx gulp season` compiles and pushes to the seasonal server, `deploy` = MMO
(`shard2`), `ptr` = PTR, `watch*` = on change. `npx gulp decodeStack --stack
"process:60:50"` maps stack tokens to `.ts` lines; `npx gulp console` and
`consoleTail` reach the live console from the shell (next section). Never run
`gulp fetch` casually (overwrites `src/*.js` from the server). `gulp
sim`/`swc`/`plus` push raw JS and cannot run the TS code. There is no test
suite: `npx gulp compile` (TypeScript plus the module-cycle check) and
watching the live game are the checks. `gulp consoleLog` is `consoleTail`
for 60 s; `gulp market`/`money` are 2017 MMO API probes. Details:
[docs/build-and-deploy.md](docs/build-and-deploy.md).

## Console from the shell (for Claude)

Two gulp tasks reach the live game console without the web client, so game
state can be inspected, and changed, from this terminal. Implementation:
`console-tools.js` (auth is `credentials.token`). Both default to the season
world and its `shardSeason` shard; `SCREEPS_WORLD=season|ptr|mmo` and
`SCREEPS_SHARD` pick another.

```
npx gulp console --cmd "Game.time"                  # send one expression, print that tick's console output, exit
echo 'JSON.stringify(Memory.missions)' | npx gulp console    # expression on stdin (no quoting fights)
npx gulp consoleTail                                # stream to stdout + logs/console-<world>.log until Ctrl+C
SCREEPS_CONSOLE_SECONDS=30 npx gulp consoleTail     # ...or stop after 30 s
npx gulp room --room W25S5                          # every object in a room, vision or not (--json for the raw response)
```

How to read the output:

- Locations are translated back to `src/` with `sourcemaps/`: `process:60:50`
  in a stack trace prints as `src/process.ts:90:18`, and the `file:line#func`
  prefix that `debug.ts` `log`/`dlog`/`warn` put on every line prints as
  `src/mission.ts:316#nCreeps`. The maps are from the last `gulp compile`, so
  push after editing `src/` before trusting line numbers.
- Command results are the lines starting with `< `. The game stringifies
  results, so wrap objects in `JSON.stringify(...)` or `[object Object]` comes
  back. The log lines above the result are the same tick's `console.log`
  output, so a quiet expression still shows what the loop printed that tick.
- HTML the console emits (room links, colours) is stripped.
  `SCREEPS_CONSOLE_RAW=1` prints the server text untouched.
- `consoleTail` lines carry `HH:MM:SS [shard]`. The file is appended to and
  rotates to `.1.log` ... `.5.log` at 5 MiB (`SCREEPS_LOG_MAX_BYTES`,
  `SCREEPS_LOG_KEEP`). `logs/` is gitignored.
- `SCREEPS_CONSOLE_TIMEOUT` (seconds to wait for a result, default 30); the
  task exits 1 on timeout, which usually means the script is not running on
  that shard.

Recipe for iterating on game state:

1. Ask with `npx gulp console --cmd "..."`. The expression runs inside the
   game VM at the start of the next tick with full access: `Memory.creeps.hauler0`,
   `getService('Hub W25S7').status()`, `lsProcess()`, or anything in
   [docs/console-operations.md](docs/console-operations.md). Assignments and
   calls take effect in the live game, so treat anything that is not a read
   as a change and check with the user before the destructive helpers.
2. To watch behaviour over several ticks, run `consoleTail` in the background
   and read the log, or run it in the foreground with `SCREEPS_CONSOLE_SECONDS`,
   or sample with console calls from a background shell loop (foreground
   sleeps over a few seconds are blocked by the tool).
3. After changing code, a push forces a global reset. A running tail survives
   the reset and reconnects if the websocket drops.

Quoting: PowerShell wants double quotes and no `$`; bash wants single quotes;
anything needing both kinds of quote goes through stdin. `VAR=value npx gulp
...` is bash syntax; in PowerShell set `$env:VAR = value` on the line before.
Expressions over about 1k characters are silently dropped: wrap long probes
in an IIFE and keep them short.

Debugging patterns that worked:

- Results only: `echo '<expr>' | npx gulp console 2>&1 | grep "^< "`.
  **No `< ` line means the expression threw** (typically a null deref such as
  `getService(x).status()` after that mission was killed). Rerun null-safe, or
  drop the grep and `| tail -5` to see the tick's output.
- Rates and movement: sample in a loop; calls land ~2 ticks apart; include
  `Game.time` in the result. Measure before theorising.
- Any module is requirable by bare name in the console, so verify code right
  after a push: `require("job.warboy").Warboy.body`,
  `require("spawnold").buildBody(Object.values(Game.spawns),{body:"immortan"},{maxRCL:8})`.
- Push and check in one line: `npx gulp season 2>&1 | grep -i "error\|Committed"`.
  `Committed` = pushed; any `error` line is a TS error that did **not** stop the
  push. `npx gulp compile` compiles without pushing.
- Every push is a global reset: module-level state (memo `Map`s, constants
  edited in-game) is rebuilt from source, `Memory` (creep memory included)
  survives. Pushes are rate limited (the `RateLimiting: (N/240 ...)` counter in
  the output), so batch edits rather than pushing per line.
- The log lines above the result are greppable by their `file:line#func` tag,
  e.g. `| grep "#runGenesis"` shows the planned `mem:` JSON after a YELLOW.
- Multi-statement probes: wrap in an IIFE and return `JSON.stringify(...)`.
- `Game.creeps.x.debug = N` stores an expiry tick; writing a small number into
  `Memory.creeps.x.debug` directly is already expired.
- A creep that moves when `require('mycreep').getMyCreep(name).run()` is called
  from the console but never on its own means its mission is not being run:
  check `Memory.missions[m].hatch` (a hatched creep stuck there) and
  `require('process').Process.all()`.
- Bash heredocs holding big Python edit scripts with mixed quotes fail to parse
  in Git Bash; write the script to the scratchpad with Write and run
  `python -I <path>`.

## Console essentials

Room names below are placeholders.

```js
scheduleService('GlobalRespawn')      // persists in Memory; replayed by Service.boot()
spawnService('Swipe W5N8 W6N8')       // runs only until the next global reset
getService('Hub W25S7')               // = Service.getType; null once killed
getService('Hub W25S7').status()      // every mission: row, egg/hatch/creep counts, mission specifics
getService('Hub W25S7').layEgg('hauler')   // one extra egg (lowercased job class); nJobs never culls it
getService('Remote W27S9 W26S8').windDown()  // purge eggs, run creeps to death, kill + deschedule
getService('Thorhub W29S7').evolve('Hub W29S7')  // reschedule under new args, moving every egg/creep; kills the old one
getService('ReactorDepot W25S7').pause()     // Reactor and Capture missions: lay nothing, purge eggs, keep the mission; resume() undoes it
require('process').Service.getType('GlobalRespawn').kill()   // stops it now, stays scheduled
Game.creeps.asrc0.debug = 500; Memory.debug = true           // per-creep / global dlog
Game.flags.genesis.setColor(COLOR_ORANGE, COLOR_YELLOW)      // plan metas; GREEN commits
Game.rooms.W25S7.createFlag(30, 29, 'reactor_Port', COLOR_GREY, COLOR_GREY)  // child flag, then YELLOW, check log, GREEN
createFlagAt('W30S4', 25, 25, 'Loot', COLOR_ORANGE, COLOR_CYAN)   // any room, vision or not; genesis passes run blind too
Memory.creeps.hub1.fillTerminal = 50000       // hub creep fills the terminal from storage to this energy, ignoring storageBalance
getService('Thormine W29S4').teardownEnabled = true   // teardown gate (see the Thormine row)
Game.rooms.W25S7.findStructs(STRUCTURE_OBSERVER)[0].observeMax('W40S7')  // observe any room, range be damned (struct.observer.ts)
getService('SkFarm W25S6 W25S7').harvesting = false   // no skharvester/sktrucker eggs (persisted; = true restores)
getService('SkFarm W25S6 W25S7').invaderless = true   // background-radar the sector's 8 keeper rooms; no skharvesters while a core there is live
getService('LabPlan W25S7').add('XZHO2', 3000)   // lab targets: add(res, quota) appends, remove, setQuota, reset, replan; status() shows chain stocks
getService('Balance').addRoom('W25S7'); getService('Balance').boosts()   // balancer rooms; boost stocks
require('intel').RoomIntel.get('W24S8').centerPos     // room centre (findRoomCenter), cached in intel.center; recenter() redoes it
```

Genesis flags reset themselves to CYAN (secondary `4`) when a command is done.
Remove a stuck egg: `delete Memory.creeps.warboy0` and `_.pull` it from
`Memory.missions[m].eggs`.

More in [docs/console-operations.md](docs/console-operations.md), including the
destructive `wipe`/`worldWipe`/`scalp`/`purgeWalls` helpers.

## Season 11 mechanics the code encodes

Kept so the reactor and thorium code can be read; none of it applies off a
Season 11 server.

- Rooms held two minerals, an ordinary one and thorium (`RESOURCE_THORIUM` =
  `"T"`, declared `ResourceConstant | undefined` in `reactor.ts`), but
  `CONTROLLER_STRUCTURES.extractor` was 1 at every RCL. Extractors are planned
  structs: `Meta_reactor` (thorium, priority 10) outranks `Meta_min`; there is
  no mineral scan outside the metas.
- Thorium aging: a creep lost `1 + floor(log10(thorium on its tile))` TTL per
  tick, cargo, piles, tombstones and ruins on the tile all counting; under 10
  was free. A loaded warboy's 1500 TTL was ~500 real ticks.
- The sector core (an x5y5 room, `Kind.Portal` in `intel.ts`) held a reactor
  (`findReactors(room)[0]`): 1000 capacity, burning 1/tick, `continuousWork`
  reset the tick it ran dry. Anyone with a CLAIM part could `claimReactor` it,
  hence the standing immortan and the `StealReactor` mission.
- General API facts learned there: `transfer` with no amount is `ERR_FULL`
  unless the whole load fits, so pass `min(carried, getFreeCapacity)`;
  `pickup` has no amount; only `withdraw` can be limited. A safe mode blocks
  every action of ours in the room, healing included.

## Memory keys you will touch

`Memory.scheduler.services`, `Memory.missions[name]`, `Memory.creeps[name]`
(`nest`, `home`, `task`, `task2`, `_walk`, `rewalksk`), `Memory.rooms[x].{intel, meta,
links, labs, spots, containers}`, `Memory.intel`, `Memory.flags[genesis].newer`,
`Memory.spawns[name]` (spawn telemetry, `spawnload.ts`; read it with
`spawnLoads()`), `Memory.Rewalker.rooms[x].{sk, cost}` (what blind walks know of
keeper tiles and route costs, written by `Rewalker.gatherIntel` from `strat.init`),
`Memory.labplan[room]`, `Memory.balance`, `Memory.debug`. Shapes in
[docs/memory-layout.md](docs/memory-layout.md).

## Known traps (full list in docs/known-issues.md)

- A room claimed after first sight keeps `NullStrat` until reset (`evolve()`
  always returns `null`).
- `GlobalRespawn` uses the spawn named `Home`, else the first spawn in
  `Game.spawns`; with no spawns at all it throws every tick.
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
- A base layout can seal its own exit (two extensions in the only terrain
  gap did, in Season 11); `findRoute` still routes through it, so
  `Rewalker._search` falls back to an unrestricted search when the
  route-restricted one is exhausted (logged `Rewalker route ... dead ends`).
- `room.enemies` includes Source Keepers and unarmed scouts; `room.hostiles` is
  the armed subset. Gate spawning on `hostiles`, and filter `creep.keeper` for
  anything walking through an SK room.
- Creep names (`role` + integer) are reused the moment a creep dies, across
  missions. Key any per-creep state that outlives the creep by `id`, never by
  name.
- `terminal.send` to a terminal in a room we unclaimed returns OK and the
  resources vanish: structures there stay `my` but `isActive()` is false.
  Filter on `isActive()` before sending or balancing.
- If every creep of one mission freezes while others move, the mission's
  process fell out of the run table (a throw escaping `runRow`); `lsProcess`
  still shows it with a row. A push rebuilds the table.

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
- Compile errors do not stop `gulp season`/`deploy`; check the gulp output.
  `npx gulp compile` alone checks TypeScript and module cycles.
- When you change what a mission or job does, update its row here and in
  `docs/missions-and-jobs.md`, `docs/creep-roles.md` and
  `docs/file-inventory.md`. Do not write live game state (rooms, schedules,
  dates, results) into this file; it goes stale within days. History that
  explains a design belongs in the relevant `docs/*-design.md`.
- `spike/` plus `tsconfig.spike.json` is a compile-only prototype of
  [docs/tcreep-design.md](docs/tcreep-design.md). Nothing imports it and
  `gulp` never sees it; check it with `npx tsc -p tsconfig.spike.json` and
  re-run `node spike/surface.js` after moving creep code.
- Commit messages: five-word subjects; commit only when asked or at the
  milestones of an unattended run.

## Docs index

| doc | when to read |
|---|---|
| [docs/runtime-tick.md](docs/runtime-tick.md) | anything about "what runs when", CPU, process rows |
| [docs/missions-and-jobs.md](docs/missions-and-jobs.md) | adding/changing missions or jobs, egg lifecycle, every mission's command string and rules |
| [docs/spawning.md](docs/spawning.md) | bodies, spawn selection, priorities, naming |
| [docs/creep-roles.md](docs/creep-roles.md) | role dispatch, mixin chain, task conventions, role tables |
| [docs/metastruct.md](docs/metastruct.md) | base layouts, genesis flag protocol, construction order, maxHits, traffic (roads) |
| [docs/traffic-design.md](docs/traffic-design.md) | why and how roads are a MetaManager service: entries, the planner, replan triggers, decisions taken |
| [docs/hub-design.md](docs/hub-design.md) | the hub creep's planned refactor: a per-tick snapshot and two first-truthy-wins chains of named rungs |
| [docs/balance-design.md](docs/balance-design.md) | how `Balance` moves thorium, minerals and energy between terminals and the lab idle ladder |
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
