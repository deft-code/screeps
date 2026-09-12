# Missions, Jobs, and MyCreep (the 2022 architecture)

Files: `src/process.ts`, `src/mission.ts`, `src/mycreep.ts`, `src/job.creep.ts`,
`src/job.role.ts`, `src/job.*.ts`, `src/ms.*.ts`, `src/spawn.ts`.

This is the active design and the target for any new behaviour. It replaced the
flag-driven "team" system ([legacy-systems.md](legacy-systems.md)).

## Class map

```
Process                      run(): Priority; kill()           (process.ts)
 └─ Service                  named by a command string, e.g. "Swipe W5N8 W6N8"
     └─ Mission (abstract)   owns eggs/hatch/creeps lists in Memory.missions[name]
         ├─ GlobalRespawn    @register  (ms.globalrespawn.ts)  ACTIVE
         ├─ Swipe            @register  (ms.swipe.ts)          registered, not scheduled
         └─ Farm             @register  (ms.farm.ts)           "Farm <farm> <home> [n]"; nJobs(Farmer, n);
                                                              Scout while the farm room is invisible;
                                                              paceJobs(Wolf, 1500) while an invader core stands;
                                                              paceJobs(Reserver, 225|450) to hold the controller

MyCreep                      wrapper object per creep *name* (mycreep.ts); not a prototype extension
 └─ JobCreep                 knows its Mission; Rewalker movement helpers (job.creep.ts)
     ├─ Startup  @register   body table keyed by energyCapacity      (job.startup.ts)
     ├─ Reboot   @register   priority 10, body from energyAvailable   (job.reboot.ts)
     ├─ Scout    @register   [MOVE] from the "home" room if any, walks to the mission room (job.scout.ts)
     ├─ Swiper   @register   [MOVE,CARRY], work in progress          (job.swiper.ts)
     └─ JobRole              bridge to legacy roles: start() calls creep.run()/after() (job.role.ts)
         ├─ Worker  @register              (job.worker.ts)
         ├─ Ctrl    @register              (job.ctrl.ts)   boosts XGH2O, ecap rules
         ├─ Hub     @register              (job.hub.ts)    needs storage + meta 'hub' spot
         ├─ Hauler  @register  priority 9  (job.hauler.ts) energy = min(2500, ecap/2)
         ├─ Farmer  @register              (job.farmer.ts) port of role.farmer.js; Task2 start() calls legacy task* helpers
         ├─ Wolf    @register              (job.wolf.ts)   port of role.wolf.js; Task2 @task attack/retreat, body 'wolf' from "home"
         ├─ Reserver @register             (job.reserver.ts) port of role.reserver.js; @task reserve, swamp road pooper, body 'reserver' from "home"
         └─ Srcer   @registerAs("asrc"), @registerAs("bsrc")  priority 8, body 'srcer' (job.srcer.ts)
```

## Registration and lookup

- `process.register(klass)` stores `klass` in a module-level `Map` under
  `klass.name`. `Service.spawn("GlobalRespawn")` looks up the first word of the
  command; if missing it tries `require("ms." + name)` (`getOrImport`).
- `mycreep.register(klass)` stores under `klass.name.toLowerCase()`;
  `registerAs("asrc")` stores under an explicit name. A creep's role is
  `_.words(name)[0].toLowerCase()`, so creep `asrc3` resolves to `Srcer` and
  `startup0` to `Startup`.
- `getMyCreep(name)` caches wrapper instances in a `Map`; `unget(name)` drops
  one when the creep dies. Unknown roles fall back to a bare `MyCreep` and log
  `Missing Role!`.

## Scheduling a mission

```js
// From the game console. The convenience globals in main.js are broken; use:
require('process').Service.schedule('GlobalRespawn')
require('process').Service.schedule('Swipe W5N8 W6N8')   // args[1]=target, args[2]=home
require('process').Service.schedule('Farm W5N8 W6N8 2')  // args[1]=farm room, args[2]=home, args[3]=farmers (default 1)
```

`schedule` = `spawn` + push the command onto `Memory.scheduler.services`, which
`Service.boot()` replays on every global reset. That is why `GlobalRespawn` is
alive with no constructor call anywhere in the code. `Service.getType(cmd)`
returns the live instance. `kill()` removes the name from
`Memory.scheduler.services` and the services map and sets `dead`, so `runAll`
drops it from the run table on the next tick. Living creeps are then never run
again (nothing outside the mission calls `mycreep.run()`), and eggs left in
`Memory.creeps` still spawn. Prefer `windDown()` for a clean exit.

## Winding down a mission

```js
require('process').Service.getType('Swipe W5N8 W6N8').windDown()
```

`windDown()` sets `Memory.missions[name].windDown`, which survives resets.
While it is set `Mission.run()` skips the normal path and runs `runWindDown()`:

1. `purgeEggs`: every egg that is not yet spawning is deleted from
   `Memory.creeps` (so the `SpawnDaemon` never sees it); one already spawning
   is moved to `hatch`.
2. `spawnHatches` and `runCreeps` continue as usual, so living creeps keep
   working until they die of age.
3. `watchTombs` records, per living creep, the tick its tombstone would decay
   (`body.length * TOMBSTONE_DECAY_PER_PART`) in `Memory.missions[name].tombs`;
   `expireTombs` drops entries once that tick passes, or once a visible
   tombstone for that creep has decayed.
4. When `eggs`, `hatch`, `creeps` and `tombs` are all empty the mission calls
   `kill()`, deletes `Memory.missions[name]`, and returns `"kill"`.

`Process.status()` returns the one-line summary `lsProcess()`/`lsService()`
print (`process|daemon|scheduled|transient`, `row:<priority>`, `dead`). `Mission.status()` appends `windDown` and
`tombs:` while winding down, then `eggs: hatch: creeps:` counts. A subclass
that wants more should call `super.status()` and append to the result.

The three shipped missions check `this.windingDown` first thing in `run()` and
skip straight to `super.run()`, so they lay no eggs while winding down. A new
`Mission` subclass should do the same.

## Mission lifecycle

`Memory.missions[name] = { eggs: string[], hatch: string[], creeps: string[] }`

1. **Lay** (`layEgg(role)`): pick a free name via `findName(role)` (`role` plus the
   lowest free integer), push to `eggs`, and create
   `Memory.creeps[name] = { laid, cpu: 0, mission, home: "egg", birth, nest: "egg" }`.
2. **Spawn** (`SpawnDaemon.runSpawns` in `spawn.ts`, `late` row): collect all
   `Memory.creeps` with `nest === "egg"`, sort by `MyCreep.priority` desc then
   age (500-tick buckets), skip hibernating eggs, call `mycreep.spawn(spawns)`
   for `[spawn, body]`, and `spawnCreep` when the room can afford it. Energy
   already committed to earlier eggs in the same room is subtracted. On success
   `nest = spawn.name`, `home = room.name`. `energyStructures` comes from
   `room.strat.spawnEnergy()` (metastruct ordering).
3. **Hatch** (`hatchEggs`): once `Game.creeps[name]` exists the name moves from
   `eggs` to `hatch`. Eggs whose `nest` was mutated are reset with a "Stuck egg"
   log. `mycreep.eggRun()` runs each tick while waiting (no-op for jobs).
4. **Born** (`spawnHatches`): when `!spawning`, the name moves to `creeps`.
5. **Run** (`runCreeps`): `mycreep.run()` every tick. Returns `false` when the
   creep is gone; then `Memory.creeps[name]` is deleted and the wrapper dropped.

### Population helpers on `Mission`

- `nCreeps(role, n, life=1500)`: keep total remaining TTL (creeps + hatches +
  eggs) above `(n-1)*life` plus spawn lag. With `n=1` the replacement is laid as
  the last creep dies.
- `nCreepsPace(role, n, life)`: one egg at a time, each hibernating for
  `life/n` ticks after the youngest existing creep. A rate limiter; used when
  `nCreeps` is called with a fractional `n` below 1.
- `nJobs(ctor, n)`: `nCreeps(ctor.name.toLowerCase(), n)`.
- `paceCreeps(role, rate)` / `paceJobs(ctor, rate)`: port of `team.ts
  paceRole`. Lays at most one egg per `rate` ticks (tracked in
  `memory.when[role]`), never while one is unhatched, and does not replace a
  creep that dies early. Use it for "suppress" style spawning that should stop
  the moment the trigger goes away (`Farm.suppressInvaderCore`).
- `hasEgg(role)`, `hasRole(role)`, `roleCreeps/roleHatches/roleEggs(role)`.
- `getRoomName(alias)`: `""` = mission room, a room-name string passes through;
  subclasses add aliases (`Swipe` maps `"home"` to `args[2]`).

## GlobalRespawn (`src/ms.globalrespawn.ts`)

Room = `Game.spawns.Home.room`. **A spawn named `Home` is required.** Each tick:

```
if no creeps at all:              nJobs(Reboot, 1)        # emergency: body sized from energyAvailable
nCreeps('startup', max(1, 6-rcl)) # 5 at RCL1 down to 1 at RCL5+
  || (ecap >= 550 && (nCreeps('bsrc',1) || nCreeps('asrc',1)))
  || nCreeps('hauler', 1)
nJobs(Worker, 1); nJobs(Ctrl, 1); if storage: nJobs(Hub, 1)
super.run(); return "critical"
```

The `||` chain lays at most one of startup/bsrc/asrc/hauler per tick. `asrc`/
`bsrc` need `Meta_asrc`/`Meta_bsrc` metastructures to find their source
([metastruct.md](metastruct.md)); `Hub.spawn` returns no spawn until a `hub`
spot exists.

## MyCreep.run() and Task2

```
run():  if creep gone -> return false
        init()
        up to 3 times: ret = runTask()            # replays memory.task2 {name, args, id?}
                       if ret === "start": delete task2; ret = start()
                       loop while ret in {"again","start"}
        after(); return true
```

`Task2Ret = "again" | "start" | "wait" | false`. A method decorated with
`@task` (mycreep.ts) records its name and JSON-cloned args in `memory.task2` on
first call so the next tick resumes it without re-deciding. The first argument
that is a game object (has a string `id`) is stored as its id with `task.id`
set to its 1-based position; `runTask` swaps `Game.getObjectById(...)` back in
and returns `"start"` when the object is gone. Users: `Swiper.dropRange`,
`Wolf.attack`, `Wolf.retreat`, `Reserver.reserve`.

Default `start()` (MyCreep and JobRole) is `this.c.run(); this.c.after();
return "wait"`, which hands control to the legacy prototype role dispatch
([creep-roles.md](creep-roles.md)). This bridge is what lets the 2017 role
mixins run under the 2022 mission system.

## Adding a new job

1. Create `src/job.foo.ts` with `@register export class Foo extends JobRole` (or
   `JobCreep` for fully new behaviour).
2. Implement `spawn(spawns): [StructureSpawn|null, BodyPartConstant[]]`. For a
   `JobRole`, `this.localSpawn(spawns, eggMem)` runs `spawnold.buildBody` with
   `eggMem.body` defaulting to the role name; that name must be a `case` in
   `buildBody` ([spawning.md](spawning.md)).
3. Either rely on an existing `roleFoo()` prototype method, or override
   `start()` with Task2 logic.
4. Import the module from `main.js` (or from the mission that uses it) so the
   decorator runs; then call `this.nJobs(Foo, n)` from a mission.
