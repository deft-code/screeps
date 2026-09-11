# Console Operations

Everything here is typed into the Screeps in-game console. Console output is
HTML; most `toString()` overrides print clickable room links.

## Missions

```js
const P = require('process');

P.Service.schedule('GlobalRespawn')          // start and persist across resets
P.Service.schedule('Swipe W5N8 W6N8')        // target room, home room
P.Service.getType('GlobalRespawn')           // live instance (or null)
P.Service.getType('GlobalRespawn').kill()    // stop persisting; still runs until next global reset
Memory.scheduler.services                    // what boot() will replay
Memory.missions.GlobalRespawn                // { eggs, hatch, creeps }
```

`global.spawn(...)` and `console.schedule(...)` look like they should work and
do not (see [known-issues.md](known-issues.md)).

Forcing a global reset (to make `kill()` take effect or reload stuck module
state): push code (`npx gulp season`), or from the console assign a new value
to any top-level module and re-`require`, which is unreliable; the code push is
the dependable way.

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
