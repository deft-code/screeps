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
         ├─ Hub              @register  (ms.hub.ts)            "Hub <room>"; GlobalRespawn for any owned room, without the startup creeps:
                                                              Reboot while the mission has no creeps, bsrc/asrc (ecap >= 550) or haulers (1 + one per 2k dropped energy over 1k, max 3), Worker, Ctrl, Hub once storage exists, Upgrader.want(room) upgraders (below RCL8: storage energy / 100k, from 100k, fractional),
                                                              all spawned "local"; idles (paced log) while the room is not ours. Distinct from the `Hub` job class (separate registries).
         ├─ Swipe            @register  (ms.swipe.ts)          registered, not scheduled
         ├─ Reactor          @register  (ms.reactor.ts)        "Reactor <room>"; mission room = sector core of <room>
         │                                                     (both coords rounded to x5); Scout from <room> while the core is
         │                                                     invisible; once visible logs
         │                                                     the reactor (FIND_REACTORS) every 500 ticks (probe);
         │                                                     nJobs(Immortan, 1) only while the reactor is visible and not `my` (CLAIM creeps are costly);
         │                                                     nJobs(Warboy, min(args[2], 700 / tripLoad)) once the home room has an
         │                                                     extractor on a thorium mineral with thorium left and the reactor is visible
         ├─ Farm             @register  (ms.farm.ts)           "Farm <farm> <home> [cap]"; paceNJobs(Farmer, n), n = source capacity / (2*avg farmer store), max 2 per spot;
                                                              Scout while the farm room is invisible;
                                                              paceJobs(Mini, 1500) while memory.tenemies (any enemy creep seen; team.ts suppressMini);
                                                              paceJobs(Guard, max(1500 - thostiles, 350)) once memory.thostiles >= 100 (team.ts suppressGuard used 3);
                                                              paceJobs(Wolf, max(1500 - thostiles, 350)) once memory.thostiles >= 300
                                                              (armed hostiles seen 300 consecutive ticks; team.ts suppressWolf);
                                                              paceJobs(Wolf, 1500) while an invader core stands;
                                                              paceJobs(Reserver, 550/ctrl spots) while someone else holds the reservation, no hostiles,
                                                              and living reservers' ttl*CLAIM < ticks left;
                                                              no farmers while that reservation has > 100 ticks left
         │   └─ Remote       @register  (ms.remote.ts)         "Remote <remote> <home>"; port of team.ts teamRemote, phase 1. Extends Farm for
                                                              the suppress* rules but replaces run() and reserve():
                                                              Scout while invisible; Mini/Guard/Wolf against enemies, hostiles, an invader core; reserve() is team.ts reserve():
                                                              paceJobs(Reserver, 225), 450 once our reservation > 450 ticks, none above 1000,
                                                              none while hostiles are present or the controller is owned (the Reserver job attacks
                                                              a foreign reservation itself); no farmers.
                                                              Phase 2: planMetas() once the remote is visible (or planMetas(true) from the console):
                                                              RemotePlanner (metaremote.ts) saves rsrc/rroad metas into each room's meta memory and
                                                              memory.metas tracks room -> names; drawMetas() every tick; windDown() removes them.
                                                              schedulePavers(): "Once Paver <room>" for any tracked unclaimed room with our sites in view,
                                                              at most one per room per 1500 ticks.
                                                              harvest(): paceJobs(Harvester, (1500 - 50*route dist) / rsrc metas) while visible, no hostiles,
                                                              not foreign-reserved (civilians in remotes are paced, never replaced).
                                                              truck(): paceJobs(Trucker, min(1500, 1500 / (5*sum(src cap) / (avg carry * 1500 / (2*legSteps+10)))))
                                                              same gates; 1500 while no trucker is alive; legSteps = longest source leg from planning
         ├─ Once             @register  (ms.once.ts)           "Once <Job> <room>"; lays one egg of the job, winds down once it has spawned,
                                                              kills and deschedules itself when the creep and its tombstone are gone
         └─ Startup          @register  (ms.startup.ts)        "Startup <room>"; claims and boots a room: nJobs(Scout, 1) while the room is invisible;
                                                              nJobs(Claimer, 1, 600) while the controller is not ours and owned rooms < GCL;
                                                              while ours and below RCL4, paceNJobs(Pioneer, max(1, 6 - rcl)) and nJobs(Guard, 1) while the room has no tower (the GlobalRespawn
                                                              startup count per lifetime) spawned outside the room; at RCL4 windDown(): pioneers live
                                                              out their lives, then the mission kills and deschedules itself. Distinct from
                                                              the `Startup` job class (separate registries).
MyCreep                      wrapper object per creep *name* (mycreep.ts); not a prototype extension
 └─ JobCreep                 knows its Mission; Rewalker movement helpers (job.creep.ts)
     ├─ Startup  @register   body table keyed by energyCapacity      (job.startup.ts)
     │   └─ Pioneer @register (job.pioneer.ts) startup for another room, laid by the Startup mission: same body table capped at 6
     │                       WORK/CARRY pairs, spawned via the "remote" strategy (nearest spawns outside the mission room), and
     │                       init() sets memory.home to the mission room so roleBootstrap works there (rolePioneer in role.bootstrap.js)
     ├─ Reboot   @register   priority 10, body from energyAvailable   (job.reboot.ts)
     ├─ Scout    @register   [MOVE] from the "home" room if any, walks to the mission room (job.scout.ts)
     ├─ Paver    @register   (job.paver.ts) port of role.paver.js; body 'farmer' via the "remote" spawn strategy; harvests in the
     │                       mission room when empty, taskBuildAny, then taskRepairRemote (roads/containers); after(): idleNom + idleBuild|idleRepairAny; spawned by Once
     ├─ Harvester @register  (job.harvester.ts) port of role.harvester.js for Remote; 6W/1C/3M from "home" (falls back to the nearest spawns) (floor 3W/1C/2M); claims an rsrc meta
     │                       (memory.rsrc; if all are claimed it shadows the harvester with the fewest ticks to live), stands on the
     │                       container tile drop-mining; builds the container site and repairs the container, withdrawing from it for that;
     │                       after() idles (nom/build/repair) only while inside the mission room
     ├─ Trucker  @register   (job.trucker.ts) port of role.trucker.js for Remote; 2 CARRY per MOVE from the nearest spawns (closeSpawns, offroad
     │                       when empty); withdraws from the fullest rsrc container (sweeps dropped energy), unloads into the home storage
     │                       when more than half full; after() idleNom picks up adjacent energy
     ├─ Swiper   @register   [MOVE,CARRY], work in progress          (job.swiper.ts)
     └─ JobRole              bridge to legacy roles: start() calls creep.run()/after() (job.role.ts)
         ├─ Worker  @register              (job.worker.ts)
         ├─ Ctrl    @register              (job.ctrl.ts)   boosts XGH2O, ecap rules
         ├─ Hub     @register              (job.hub.ts)    needs storage + meta 'hub' spot
         ├─ Hauler  @register  priority 9  (job.hauler.ts) energy = min(2500, ecap/2)
         ├─ Upgrader @register priority -1 (job.upgrader.ts) port of role.upgrader.js; surplus sink: taskRecharge then goUpgradeController,
         │                                                 after() idleNom + idleRecharge; body 'upgrader' (2W/1C per level) via "local";
         │                                                 Upgrader.want(room) = 0 at RCL8, without storage, or below 100k, else storage energy / 100k (linear, fractional: 150k = 1.5)
         ├─ Farmer  @register              (job.farmer.ts) port of role.farmer.js; Task2 start() calls legacy task* helpers
         ├─ Wolf    @register              (job.wolf.ts)   port of role.wolf.js; Task2 @task attack/retreat, body 'wolf' via "close"
         ├─ Guard   @register              (job.guard.ts)  port of role.guard.js; Task2 @task hunt/duel/healCreep/retreat, kites melees via idleFlee;
         │                                                 body 'guard' via "remote": room capacity >= 550, energyDef scales T/RA pairs to energy available (spawning.md)
         │   └─ Mini @register             (job.mini.ts)   Guard on the fixed 'mini' body [RANGED_ATTACK, MOVE, MOVE, HEAL], still via "close"
         ├─ Reserver @register             (job.reserver.ts) port of role.reserver.js; @task reserve, body 'reserver' via "close"
         ├─ Claimer  @register             (job.claimer.ts) port of role.claimer.js for Startup; body 'claimer' ([MOVE, CLAIM]) via "remote";
         │                                                 @task claim: claimController, or attackController when someone else owns it; idles once `my`
         ├─ Immortan @register             (job.immortan.ts) Season 11 reactor reserver; body 'claimer' ([MOVE, CLAIM]) via "close", walks to the sector core,
         │                                                  @task reserve calls creep.claimReactor(reactor) at range 1 (needs a CLAIM part) and logs each new return code
         ├─ Warboy   @register             (job.warboy.ts) Season 11 thorium runner; WORK/CARRY/MOVE x levels from "home" ecap (max 16, 800 carry);
         │                                                @task harvest (home thorium mineral) -> deliver (transfer only while reactor.my, waits otherwise)
         │                                                -> scavenge dropped/tombstone/ruin thorium in its room -> back to the mineral; never suicides
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
// From the game console. scheduleService is a global wrapper around Service.schedule
// (main.js) and works; require('process').Service.schedule(...) is the long form.
scheduleService('GlobalRespawn')
scheduleService('Hub W25S7')         // args[1]=owned room; GlobalRespawn without startups, from the room's own spawns
scheduleService('Swipe W5N8 W6N8')   // args[1]=target, args[2]=home
scheduleService('Farm W5N8 W6N8 2')  // args[1]=farm room, args[2]=home, args[3]=optional farmer cap
scheduleService('Reactor W6N8')      // args[1]=home room; mission works on that sector's core (W5N5)
scheduleService('Reactor W6N8 2')    // optional args[2]=cap on warboys
scheduleService('Remote W5N8 W6N8')  // args[1]=remote room, args[2]=home; scout + held reservation (phase 1)
scheduleService('Once Paver W5N8')   // args[1]=job class, args[2]=room; one creep, then winds down (Remote schedules these itself)
```

`schedule` = `spawn` + push the command onto `Memory.scheduler.services`, which
`Service.boot()` replays on every global reset. Both are idempotent: a command
that is already live returns the existing instance and is not pushed twice
(`boot()` also dedupes the list). That is why `GlobalRespawn` is
alive with no constructor call anywhere in the code. `Service.getType(cmd)`
returns the live instance. `kill()` removes the name from
`Memory.scheduler.services` and the services map and sets `dead`, so `runAll`
drops it from the run table on the next tick. Living creeps are then never run
again (nothing outside the mission calls `mycreep.run()`), and eggs left in
`Memory.creeps` still spawn. Prefer `windDown()` for a clean exit.

## Evolving a mission into another command

```js
getService('Farm W25S8 W26S8').evolve('Farm W25S8 W25S7')
```

`Mission.evolve(cmd)` schedules `cmd` (idempotent; a live instance is reused),
`donateAll`s its eggs, hatches and creeps to it (`donateRole` per role) (each creep's
`memory.mission` is repointed), merges the `paceCreeps` timers (`memory.when`),
then `kill()`s the old mission and deletes `Memory.missions[old]`. Nothing is
purged, so no creep is lost. Only the base `MissionMemory` moves: a subclass
with extra state should override `evolve`; `Remote.evolve` calls
`removeMetas()` first so the old plan and its sites go, and the new Remote
replans against its own home on its next visible run. The target may be a different mission class; the creeps keep their
jobs and simply resolve `this.mission` to the new instance.

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
show via `Process.toString()` = `name [status()]` (`process|daemon|scheduled|transient`, `row:<priority>`, `dead`). `Mission.status()` appends `windDown` and
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
  the last creep dies. Never more than one unhatched egg per role at a time
  (`hasEgg`), so `n=2` from nothing lays the second egg only after the first
  hatches.
- `nJobs(ctor, n, life=1500)`: `nCreeps(ctor.name.toLowerCase(), n, life)`.
- `donate(ctor, other)` / `donateRole(role, other)` / `donateAll(other)`: move
  one role's, or every role's, eggs, hatches and creeps to mission `other`,
  repointing each creep's `memory.mission`; return the moved names.
- `paceNJobs(ctor, n, life=1500)`: `paceJobs(ctor, life / n)`, i.e. `n` creeps
  per lifetime as a rate; `n <= 0` lays nothing (`Farm` farmers, `Startup`
  pioneers).
- `paceCreeps(role, rate)` / `paceJobs(ctor, rate)`: port of `team.ts
  paceRole`. Lays at most one egg per `rate` ticks (tracked in
  `memory.when[role]`), never while one is unhatched, and does not replace a
  creep that dies early. Rates below `kMinPaceRate` (100) are clamped up to
  it; non-positive or non-finite rates lay nothing. Use it for spawning that
  should stop the moment the trigger goes away (`Farm.suppressInvaderCore`,
  `Farm.reserve`) or when the target is a rate rather than a head count
  (`Farm` farmers: `1500 / nFarmers`).
- `nCreeps`/`nJobs` accept fractional `n` (TTL-based; 1.5 averages 1.5 creeps).
  Below 1 they delegate to `paceCreeps(role, life / n)`, a duty cycle. `n <= 0`
  lays nothing.
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
nJobs(Upgrader, Upgrader.want(room))   # 0 at RCL8 / no storage / < 100k, else storage energy / 100k (150k = 1.5); laid last (priority -1)
super.run(); return "critical"
```

The `||` chain lays at most one of startup/bsrc/asrc/hauler per tick. `asrc`/
`bsrc` need `Meta_asrc`/`Meta_bsrc` metastructures to find their source
([metastruct.md](metastruct.md)); `Hub.spawn` returns no spawn until a `hub`
spot exists.

## Hub (`src/ms.hub.ts`)

`"Hub <room>"`, the same loop for any other owned room, minus the startup line:

```
if room invisible or controller not ours: paced log; super.run(); return "normal"
if no creeps at all:              nJobs(Reboot, 1)
(ecap >= 550 && (nCreeps('bsrc',1) || nCreeps('asrc',1))) || nCreeps('hauler', nHaulers())
  # nHaulers = min(3, 1 + floor(max(0, dropped energy - 1000) / 2000)); constants at the top of ms.hub.ts
nJobs(Worker, 1); nJobs(Ctrl, 1); if storage: nJobs(Hub, 1)
nJobs(Upgrader, Upgrader.want(room))   # 0 at RCL8 / no storage / < 100k, else storage energy / 100k (150k = 1.5); laid last (priority -1)
super.run(); return "critical"
```

Every job spawns "local" (nearest spawns by route distance), so the room's own
spawn once it has one; `Reboot.spawn` prefers the mission room's spawns for the
same reason. Before the room has a spawn the `Startup` mission's pioneers carry
it, so both missions can run side by side until `Startup` winds down at RCL4.
The mission class is `Hub` in the process registry and the job class is `Hub`
in the creep registry; `nJobs(HubJob, 1)` still lays `hub<n>` eggs because
`nJobs` uses the constructor's runtime name. `status()` appends `rcl:<level>`,
the dropped energy and the current hauler target.

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
