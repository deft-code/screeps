# Console Operations

Everything here is typed into the Screeps in-game console. Console output is
HTML; most `toString()` overrides print clickable room links.

## Missions

```js
const P = require('process');

P.Service.schedule('GlobalRespawn')          // start and persist across resets
P.Service.schedule('Swipe W5N8 W6N8')        // target room, home room
P.Service.getType('GlobalRespawn')           // live instance (or null)
P.Service.getType('GlobalRespawn').kill()    // stops now: dropped from the priority table and from Memory
P.Service.getType('Swipe W5N8 W6N8').windDown()  // stop laying eggs, purge eggs, run creeps to death, then kill()

spawnService('Swipe W5N8 W6N8')              // global helper for P.Service.spawn
getService('Swipe W5N8 W6N8')                // global helper for P.Service.getType
lsService()                                  // print svc.name + svc.status() for every live service
lsProcess()                                  // every live process: daemons, room strats, services; name + status()
scheduleService('GlobalRespawn')             // global helper for P.Service.schedule
Memory.scheduler.services                    // what boot() will replay
Memory.missions.GlobalRespawn                // { eggs, hatch, creeps }
```

`kill()` takes effect on the next `runAll()`: it sets `proc.dead`, which
`runRow` checks before running a process and again before re-filing it, so the
instance is dropped from the priority table as well as from
`Memory.scheduler.services`. A process may also retire itself by returning
`"kill"` from `run()`, which parks it in the `kill` row that `runAll()` never
runs.

Every process that passes through `exec()` (daemons, `NullStrat`/`ClaimedStrat`
per room, and services) is tracked in a module `Map` with its current row;
`Process.all()` returns them and `lsProcess()` prints `name [status()]`. A dead
process is removed from that map when `runRow` drops it. Killing a daemon is
only a pause: it has no memory entry, so the `@daemon` decorator recreates it at
the next global reset. `status()` prints `daemon` so that is visible.

`kill()` abandons living creeps (nothing else runs them) and leaves laid eggs
in `Memory.creeps`, where the `SpawnDaemon` will still spawn them. `windDown()`
is the clean alternative: it purges the eggs, keeps running the creeps until
they and their tombstones are gone, then kills and deletes
`Memory.missions[name]`. It is persisted in mission memory, so it survives a
global reset.

Forcing a global reset (to reload stuck module state) is still done by pushing
code (`npx gulp season`); assigning to a top-level module from the console and
re-`require`ing is unreliable.

## Inspecting creeps

```js
lup('<id>')                                  // Game.getObjectById shorthand (console.js)
busyCreeps(10)                               // top CPU users by memory.cpu per tick alive
Game.creeps.asrc0.debug = 500                // enable creep.dlog for 500 ticks (Debuggable setter)
Game.creeps.asrc0.debug = false
Game.rooms.W5N8.debug = 200                  // room-level dlog
Memory.debug = true                          // every module-level debug.dlog prints
require('mycreep').getMyCreep('hauler0')     // the MyCreep wrapper
Memory.creeps.hauler0                        // task / task2 / _walk / nest / home
```

Legacy task memory can be cleared with `delete Memory.creeps.X.task`; new-style
with `delete Memory.creeps.X.task2`.

## Spawning

- Force a body preview: `require('spawn').energyDef({move:2, base:[MOVE,CARRY], per:[WORK,CARRY], energy: 800})`.
- Eggs waiting: `_.filter(_.keys(Memory.creeps), n => Memory.creeps[n].nest === 'egg')`.
- Remove a stuck egg: `delete Memory.creeps.startup3` and pull the name from
  `Memory.missions.<m>.eggs`.
- Spawn-energy order a room will use: `Game.rooms.X.strat.spawnEnergy()`.

## Metastructures

```js
Game.rooms.W5N8.meta                          // MetaManager
Game.rooms.W5N8.meta.metas.map(m => [m.name, m.priority])
Game.rooms.W5N8.meta.getSpot('hub')
Game.rooms.W5N8.meta.getMeta('asrc').targetid()
Memory.rooms.W5N8.meta                         // persisted plans
Game.flags.genesis.setColor(COLOR_ORANGE, COLOR_YELLOW)   // plan children
Game.flags.genesis.setColor(COLOR_ORANGE, COLOR_GREEN)    // commit
Game.flags.genesis.setColor(COLOR_ORANGE, COLOR_GREY)     // recreate child flags from memory
```

Flag protocol details in [metastruct.md](metastruct.md). Draw the current plan
without changing anything: set YELLOW and then back to CYAN; planned-but-
uncommitted metas sit in `Memory.flags.genesis.newer`.

## Links, labs, spots

```js
Game.rooms.X.findStructs(STRUCTURE_LINK).map(l => [l.pos.xy, l.mode])
Memory.rooms.X.links                           // per-xy mode overrides ("^" "+" "-" "=" "x")
Game.rooms.X.terminal.autoReactAll(true)       // re-pick lab plan now
Game.rooms.X.orderedLabs()
Game.rooms.X.addSpot('ctrl', new RoomPosition(20, 21, 'X'))   // manual spot override
Game.rooms.X.drawSpots()
```

## Destructive helpers (console.js) — read before using

| call | effect |
|---|---|
| `purgeWalls(room, dry=true)` | With `dry=false` destroys every wall more than 5 tiles from the edge. |
| `wipe(room)` | Suicides all creeps, removes all flags and construction sites, destroys every structure except extractors. |
| `worldWipe(keepRoomName)` | `wipe()` every room that has a flag, except one. |
| `scalp(shard, ptr)` | Wipes rooms named `*N21`-`*N24` on the given shard. |
| `injectAbuse()` / `clientAbuse()` | Print HTML that patches the web client to log clicks into `Memory.client`. |

## Reading errors

Screeps stack traces name compiled modules (`process:60:50`). Translate with:

```
npx gulp decodeStack --stack "process:60:50 job.hub:12:3"
```

Processes that throw are reported through `Game.notify` (30-minute grouping)
and deferred, so a single bad mission spams notifications rather than crashing
the tick. `Bucket Throttled` / `Max CPU Throttled` warnings come from
`process.canRun` and `shed.canRun` and include the caller location.
