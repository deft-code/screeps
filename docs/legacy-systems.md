# Legacy Systems (loaded but not driving anything)

These modules are still compiled and imported, so their prototype extensions and
`Memory` defaults run every global reset, but their control flow is unreachable
on the current build. Know them so you can (a) not mistake them for live code
and (b) mine them when porting behaviour to the job system.

## Flag-driven teams (`src/team.ts`, `src/team.egg.js`, `src/spawnold.js run()`, `src/flag.ts run()`)

The 2017-2020 orchestration layer. A **team** was a flag with primary
`COLOR_BLUE`; its secondary colour chose the behaviour and its name's first word
chose sub-behaviour:

| secondary | `TeamExtra` method | purpose |
|---|---|---|
| BLUE | `teamCore` | owned room using shunts (`core`/`aux`) and `coresrc`/`auxsrc` miners |
| GREEN | `teamHub` | owned room using hub/shovel/asrc/bsrc (the metastruct-era base) |
| YELLOW | `teamRemote` | remote mining: reservers, harvesters, pavers, truckers; builds road pathways |
| RED | `teamWhat` | by name: `startup`, `declaim`, `wipe`, `logo`, `commando`, `kraken`, `zombie`, `deposit` |
| GREY | `teamWho` | spawn the role named by the flag at `memory.pace` |
| WHITE | `teamOnce` | one creep then flip to BROWN |
| BROWN | `teamDone` | abort eggs, remove flag when empty |

Population control was `paceRole(role, rate)` (one egg per `rate` ticks) and
`replaceRole(role, overlapTicks)` (spawn when TTL sum drops below overlap).
Eggs were `Flag.prototype.<role>Egg()` -> `makeEgg` -> `Memory.creeps[name].egg`,
consumed by `spawnold.run()`. Entry points were `flag.run()` (never wired in the
current `main`) and `flag.darkRun()` for rooms without vision (after the dead
`return`). `creep.team` now returns a fake flag at the mission room, so role
code written against teams still functions under missions.

Porting note: `teamHub`'s spawn order (`reboot, hauler, hub, defender, micro,
asrc, bsrc, worker, shovel, controller, mineral, chemist`) is the closest
ancestor of `GlobalRespawn` and a good checklist for what jobs are still
missing (`defender`, `shovel`, `mineral`/`minecart`, `chemist`, `cap`, `mason`).

## Old base planner (`src/room.keeper.js`, `src/planner.js`)

Pre-metastruct construction: `RoomKeeper` kept `Memory.rooms[x].keeper.plans`
per structure type and placed sites in RCL order; `planner.js` (`BasePlan`)
laid out a base from an orange flag and committed to the keeper. `runKeeper`
is exported but never called; `planner` is not imported (its `require` in
`flag.ts` is commented out). Superseded by [metastruct.md](metastruct.md).

## Class-based Role experiment (`src/role.js`, `src/role.legacy.js`, 2018)

A `Role` class per creep (`require('role.' + role)`) with `init/pre/run/after`
hooks and a `Creep.prototype.role` getter. Neither file is imported; if it were,
the `role` getter would clash with `CreepRole.role`. Dead end.

## Market automation (`src/struct.terminal.js run()`, `src/market.ts run()`, `src/markethack.js`)

The live replacement, since Sept 2026, is the `Selloff <room>` service
(`ms.selloff.ts`, [missions-and-jobs.md](missions-and-jobs.md)): buy-order
selling only, scheduled by command or purple flag.

Terminal balancing, auto-buying core minerals, selling surplus, price EMAs in
`Memory.market`, and the `getRawMarket` hack that hijacks `Object.prototype`
with a `Symbol` getter to grab the engine's raw order table. All callers are
after the `return` in `main.js`. `markethack.enable()` still executes at import
and leaves the prototype patch in place.

## Radar, deposits, power creeps (`src/radar.ts run()`, `src/deposit.ts`, `src/powercreep.ts`)

- Radar: RCL8 observers scan a 21x21 neighbourhood for stale intel, preferring
  highways. Registration is live; `run()` is dead.
- Deposits: `depositRun` creates `deposit_<room>` BLUE/RED team flags for nearby
  highway deposits and `role.depositfarmer.ts` farms them. Dead with teams.
- Power creeps: `HarleyQuinn`, `Heimdall`, `Genesis`, `Magellan` with hardcoded
  MMO rooms (`W29N11`, `W21N15`, `W23N15`) and shard checks, Tasker-driven
  task*/idle* methods (drain extensions, regen sources, operate observer, renew
  at home, enable rooms, ping-pong flags). Removed from `src/powercreep.ts` in
  Sept 2026 (see git history before the rewrite); the file now holds only the
  `TPowerCreep`/`MyPowerCreep` wrappers and `ms.furiosa.ts` drives power creeps.

## `main.js` hacks

`powerHack` (buy power, process power in two MMO rooms, spawn `power` creeps
from `Game.spawns.Aycaga`), `hackAlloy`, `doCrazy` (cost-matrix experiment),
`doMarket`, `evil` (order manipulation, disabled by `if (Game.time) return`),
`drawStaleness`, heap/GC monitoring, `init()` (creates a `Startup` flag; never
called). All dead.

## Console client hacks (`src/console.js`)

`global.injectAbuse` / `global.clientAbuse` print HTML that, when clicked in the
web client, patches the Angular room controller to write click/selection info
into `Memory.client`. `global.lup`, `busyCreeps`, `purgeWalls`, `wipe`,
`worldWipe`, `scalp` are console helpers; the last four are destructive. See
[console-operations.md](console-operations.md).

## Orphans (not imported anywhere)

| file | what it was |
|---|---|
| `src/FindRoute.ts` + `src/PriorityQueue.js` | 2022 reimplementation of `Game.map.findRoute` with sector-aware costs |
| `src/history.ts` | market transaction history aggregation into `Memory.history` |
| `src/memprof.ts` | incremental `Memory` size profiler |
| `src/memhack.js`, `src/profiler.ts` | fully commented-out Memory parse hack and CPU profiler |
| `src/role.recycle.ts` | `roleRecycle` walks to a spawn to be recycled (never merged onto `Creep`) |
| `src/server.js`, `src/stack.js` | 2017 utilities (server identity, stack formatting) |
| `hacking.js` (repo root) | hijacks `Function.prototype.bind` to capture the Screeps runtime object; not deployed (only `src/` is compiled) |
| `markethack.js` (repo root) | older copy of `src/markethack.js` |
| `.tern-project`, `watch.sh` | editor/watch tooling from 2017 |

## Files deleted from history worth knowing

Git shows earlier generations that no longer exist: `squad.*.js` (2017 squads),
`team.*.js` splits, `ai.*.js`, `globals.js` (defined `Game.terminals`,
`Game.storages`, `Game.ncreeps`, whose absence now leaves dangling references),
`spawners.ts`, `role.startup.ts`, `ms.swiper.ts`. Use `git log --all --
src/<name>` to recover them.
