# Memory Layout

What each top-level `Memory` key holds, who writes it, and whether the current
build still uses it. Screeps `Memory` is JSON-serialised every tick, so keep it
small; per-tick data belongs in `obj.tick` / `obj.cache`
([conventions-and-styles.md](conventions-and-styles.md)).

## Live keys

### `Memory.scheduler` (`process.ts`)
```
{ services: ["GlobalRespawn", ...],   // command strings replayed by Service.boot()
  next: number }                       // next tick the "extra" row runs
```

### `Memory.missions` (`mission.ts`)
```
{ "GlobalRespawn": { eggs: ["startup2"], hatch: ["hauler0"], creeps: ["startup0", "asrc0", ...],
                     windDown?: true, tombs?: { "asrc0": tick },      // set by windDown(); tick = expected tombstone decay
                     when?: { wolf: tick } } }                        // paceCreeps: tick the last paced egg was laid
  "Remote W27S9 W26S8": { ..., metas?: { W27S9: ["rsrc_608", "rroad_W27S9_608"], W26S9: [...] },  // room -> metas the mission planned
                          planned?: tick }                            // present once planning was attempted; windDown removes the metas
```

### `Memory.creeps[name]` (`mission.ts`, `spawn.ts`, roles)
New-system creeps start as eggs:
```
{ laid: tick, cpu: 0, mission: "GlobalRespawn", home: "egg", birth: tick, nest: "egg" }
```
After spawn: `nest = spawnName`, `home = roomName`. Roles then add:
`task` (legacy `{task, id?, flag?, first?, resource?, max?, spot?}`), `task2`
(`{name, args, id?}`), `_walk` (Rewalker `[destXY, destRoom, [xy, room, dirs], incomplete?]`),
`srcid/contid/linkid` (srcer), `struct` (ctrl), `repairid`, `spawnid`,
`boosts[]`, `debug` (expiry tick), `spot`, `start`, `team`.
Legacy team eggs used `{ team: flagName, egg: { team, body, laid, spawn, priority, ... } }`
and are no longer created; `Mission.hatchEggs` treats any `nest !== "egg"` as
a stuck egg and resets it.

### `Memory.rooms[name]`
| field | writer | live | shape |
|---|---|---|---|
| `intel` | `intel.ts` | yes | `{ last, enabled?, owner?: [userIdx, rcl], core?: [lvl, expire], power?: [xy, amount, expire], deposit?: [xy, cooldown, expire], portal? }` |
| `meta` | `metastruct.ts` | yes | `{ metas: MetaMem[], keep?, drop?, roadkeep?, roaddrop?: xy[], rampart?, constructedWall?: {xy: MAXHITS} }` see [metastruct.md](metastruct.md) |
| `links` | `struct.link.ts` | yes | `{ [xy]: { mode: "^"|"+"|"-"|"="|"x" } }` (old entries may still say `"src"`/`"sink"`) |
| `labs` | `struct.lab.js` | yes | `{ current?: resource, order?: labId[], [labId]: { note, planType?, boost?, boostTime? } }` |
| `spots` | `room.ts` | yes (read) | `{ [name]: xy }` manual standing spots; metastruct points are the usual source |
| `containers` | `struct.container.js` | yes | `{ [id]: { note, mode: "src"|"sink" } }` |
| `nstructs`, `thostiles`, `tassaulters`, `tenemies`, `hostilestime`, `assaulterstime`, `enemiestime` | `strat.ts` | yes | hostile presence ratchets |
| `bestSpots` | `source.js` | yes (read) | `{ [srcNote]: [x, y] }` manual override of best harvest tile |
| `role` | manual | yes (read) | overrides `room.role` |
| `keeper` | `room.keeper.js` | dead | old planner `{ plans: {stype: xy[]}, last, lastStructs, rcl }` |
| `stalls` | `matrix.js` | dead | per-creep stall tracking |

### `Memory.intel` (`intel.ts`)
```
{ users: string[],          // username table; intel.owner[0] indexes into it
  recs: string[],           // sorted highway rooms with deposits/power banks
  recExpire: tick }
```

### `Memory.flags[name]` (`flag.ts`, `metastruct.ts`)
Genesis flags: `{ newer: { [childSelf]: MetaMem } }` (planned but unsaved
metas). `flag.temp()` uses `{ room, born }`. Legacy team flags used
`{ creeps, when, pace, over, junior, depositDist, <srcNote>: PathMem }`.

### `Memory.dists` (`routes.ts`)
`{ "W1N1_W5N5": n }` for room-route lengths above 4.

### `Memory.debug`
Boolean; when true, every module-level `debug.dlog` prints.

### `Memory.stats`
Created by `main.init()` (never called) and written only by the dead heap
code; effectively unused.

## Dead or historical keys

| key | writer | notes |
|---|---|---|
| `Memory.market` | `market.ts run()` (dead) | `{ [resource]: { buy, buy95, buy99, buy9500, buy9900, sell, sell95, sell99, sell9500, sell9900 } }`, read by terminal helpers |
| `Memory.evil`, `Memory.client`, `Memory.theMatrix`, `Memory.logo` | `main.js` hacks, `console.js`, `team.ts` | dead paths |
| `Memory.servers` | `server.js` | orphan module |
| `Memory.history` | `history.ts` | orphan module |
| `Memory.zProfileAccumulator`, `Memory.zPostProfile` | `profiler.ts` | commented out |

## Cleaning up after a season reset

A fresh season needs: `Memory.scheduler.services = ["GlobalRespawn"]` (or a
console `schedule` call), a spawn named `Home`, and genesis/child flags for the
metastructures. Everything else is recreated lazily. Stale `Memory.creeps`
entries with `nest === "egg"` but no mission will be spawned by `SpawnDaemon`
forever if their role class resolves, so delete them when retiring a mission.
