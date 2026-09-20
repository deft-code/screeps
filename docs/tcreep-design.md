# TCreep: wrapper classes instead of prototype mixins

Status: design plus a compile-only prototype (`spike/`, `tsconfig.spike.json`),
written 2026-09-11. Nothing here is wired into `main.js` or deployed. The
prototype compiles clean against the live tree under the pinned TypeScript
(3.9.10) and `spike/surface.js` reports the member surface it was sized from.

Decisions already taken (approved 2026-09-11):

- Coexistence follows **Path A**: flip the whole mixin layer onto the wrapper in
  one commit and merge the legacy JS mixins onto the wrapper prototype, so every
  role keeps running unchanged; roles are then converted one at a time.
- Legacy JS roles stay untyped JS until each one is ported.
- The compiler stays at TypeScript 3.9; an upgrade is a separate study.
- `tick`, `cache`, `toString`, `Debuggable` and a thinned `CreepExtra` stay on
  the game prototypes for now.
- The generic base is designed now; creeps are implemented first, structures
  second, rooms third.
- The creep accessor stays a getter (`this.c`), not a method.

## 1. Summary

`MyCreep` (`src/mycreep.ts`) is already a persistent, name-keyed wrapper. What it
lacks is (a) the mixin code, which is written against `this: Creep` and copied
onto `Creep.prototype`, and (b) a lifecycle beyond "delete on death". The design
closes both gaps:

- `TObj<G>` is a generic wrapper keyed by name or id, re-resolving its game
  object every tick and moving through `egg -> alive -> dead -> retired`
  (`unseen` for objects in rooms out of view). A `Registry` holds wrappers and
  a `RetireDaemon` sweeps them by each class's `expired()` policy.
- `TCreep extends TObj<Creep>` presents the Creep API on itself through typed
  forwarders (`interface TCreep extends Pick<Creep, ...>` plus a runtime loop),
  so the existing mixin bodies compile and run unchanged with `this` being the
  wrapper. It records the creep id and last room in memory so it can find its
  `tombstone()` after death, and it frees the creep name only at retirement.
- The mixin chain becomes real inheritance rooted at `TCreep`:
  `TCreep -> CreepStats -> CreepRole -> CreepMove -> CreepCarry -> CreepHarvest
  -> CreepBuild -> CreepRepair -> MyCreep -> <one class per role>`. The 42 legacy
  JS mixins are merged onto `MyCreep.prototype` in the same order they are merged
  onto `Creep.prototype` today.
- `TStruct<S extends Structure>` is the same base keyed by id, with per-tick
  claims as instance state and config memory keyed by position. It is phase 2.

Measured on the live tree (`node spike/surface.js`):

| quantity | value |
|---|---|
| legacy JS mixins merged in `main.js` | 42 |
| TS mixin chain files / members | 7 / 106 |
| TS role files still using `@injecter(Creep)` / members | 9 / 29 |
| distinct `this.X` names used by legacy creep code | 237 |
| of which raw Creep API (forwarders) | 36 |
| busiest raw members: room / store / pos / memory | 235 / 126 / 125 / 113 uses |
| member collisions between wrapper classes and the chain | 11 names, all renames |
| `this.X` references that are dangling today | 1 (`role.chemist.js`, dead role) |
| chain edits to re-root at `TCreep` (measured by diff) | -51 / +20 lines over 1,313 |
| spike compile | 0 errors, 181 files, check time 0.9 s |

## 2. The wrapper model

### 2.1 `TObj<G>`: key, lookup, life

```
abstract class TObj<G> extends Debuggable
  key: string                       creep name | structure id | room name
  life: egg | alive | unseen | dead | retired
  lastSeen, died: number            ticks
  lastRoom?: string; lastXY?: number   packed position (x*100+y), refreshed while alive
  get obj(): G | undefined          resolve once per tick via lookup(); drives life
  protected abstract lookup(): G | undefined
  protected abstract visible(): boolean    does a failed lookup prove death?
  protected observe(o: G)           record lastRoom/lastXY (and, in subclasses, memory)
  protected onDead()                alive -> dead hook
  get alive(): boolean
  expired(): boolean                retirement policy, consulted by Registry.sweep
  retire()                          life = retired; subclasses free memory / lists
```

`obj` is the only place the game object is fetched. It is cached for the current
tick with a `Game.time` stamp, so hundreds of `this.pos`/`this.room` accesses per
creep per tick cost one map lookup plus a getter each.

Life transitions happen inside `obj`:

- lookup succeeds: `alive`, `lastSeen = now`, `observe()`.
- lookup fails while `alive` or `unseen`: `dead` if `visible()` says the absence
  is proof (creeps: always; structures: room in view), else `unseen`.
- `egg` never transitions on a failed lookup; eggs are retired by age.

### 2.2 Registry and sweep

`Registry<T>` is a `Map<key, T>` with `get(key)` (create through a factory on
miss), `getOr(key, make)`, `peek`, `forget`, and `sweep()`, which calls
`expired()` on every wrapper and drops the ones that answer yes. Every registry
declares its sweep period: creeps every tick (tens of entries), structures every
20 ticks. `RetireDaemon` (a `@daemon` `Process` in the `late` row) runs the
sweeps, so retirement happens after the missions and the spawner have run:

```
critical  missions       lay eggs, hatch, run creeps      (unchanged)
normal    strats         towers, links, labs, meta        (unchanged)
low       FlagService                                      (unchanged)
late      SpawnDaemon    eggs -> spawnCreep               (unchanged)
late      RetireDaemon   sweep registries                 (new)
```

This is the same shape as the existing per-room `strat` cache (`strat.ts`), the
`room.meta` cache, and `GlobalCache.clear()` in `cache.ts`, which already purges
ids that no longer resolve. `GlobalCache.clear()` has the visibility bug that
`visible()` exists to avoid: it drops any id that does not resolve, including
objects in rooms that are merely out of view.

### 2.3 Staleness rules

Game objects are recreated every tick. The wrapper may keep across ticks only:
keys (names, ids), packed positions, tick stamps, and small policy state
(`died`, `_tombId`). It must never keep a `Creep`, `Structure`, `Room` or
`RoomPosition` from a previous tick. `observe()` is where a subclass records
what it will need after the object is gone.

### 2.4 `TCreep`

```
class TCreep extends TObj<Creep>
  constructor(name)                 life = dead if memory exists, nest != "egg", and no creep
  lookup()   Game.creeps[name]      visible() true: Game.creeps is complete for my creeps
  get memory(): CreepMemory         Memory.creeps[name]; created lazily only while the creep exists
  get c(): Creep                    asserts alive; throws "<name> is <life>: no creep object"
  get id(): Id<Creep> | undefined   live id, else memory.id
  get role()                        first word of the name, lowercased
  get ticksToLive(): number         creep TTL, or CREEP_LIFE_TIME for an egg (population maths)
  get spawnTime(): number           CREEP_SPAWN_TIME * body length, 0 for an egg
  get hatching(): boolean           creep exists and is spawning
  get mission(): Mission | undefined
  tombstone(): Tombstone | null
  expired()                         see 2.5
  retire()                          delete Memory.creeps[name]
  toString()                        HTML room link alive; "egg:name" / "dead:name" otherwise
  + forwarders                      see section 3
```

`observe()` writes two memory fields on change: `memory.id` (once) and
`memory.lastRoom` (when the room changes). `onDead()` writes `memory.died`.
These survive a global reset, which wipes every registry; a rebuilt wrapper
knows from `nest` whether it is an egg or a corpse and can still find its
tombstone.

### 2.5 Creep lifecycle and retirement

```
egg          Memory.creeps[name] laid by Mission.layEgg; no creep yet
hatching     Game.creeps[name] exists, spawning = true; MyCreep.run() does nothing
alive        role code runs
dead         creep gone; tombstone() may resolve; memory kept
retired      dropped from the registry; Memory.creeps[name] deleted; name reusable
```

Policy in `TCreep.expired()`:

| life | retire when |
|---|---|
| egg | no memory, or `now - laid > 3000` (closes known issue 7, "too-old eggs are never removed") |
| dead | `now - died > TOMBSTONE_DECAY_PER_PART * MAX_CREEP_SIZE` (250), or sooner once the last room is visible and shows no tombstone for this creep |
| alive, hatching, unseen | never |

Two invariants follow:

- **A name is reusable iff neither wrapper nor memory exists.** Today
  `Mission.runCreeps` deletes memory and drops the wrapper the tick the creep
  disappears. In the new flow the mission still removes the name from its
  `creeps` list when `run()` returns false, but memory deletion moves to
  `TCreep.retire()`. `findName` keeps checking `Memory.creeps`, so a name cannot
  be reissued while the corpse is still tracked. Cost: one small memory record
  per dead creep for at most 250 ticks.
- **Retirement cleans mission lists.** `MyCreep.retire()` removes the name from
  `eggs`, `hatch` and `creeps` before calling `super.retire()`, so a stuck egg
  disappears from the mission that laid it. This replaces the `TODO
  mycreep.abort()` in `spawn.ts`.

Mission changes (all small, in `mission.ts`): `runCreeps` stops deleting memory
and calling `unget`; `spawnHatches` calls `mycreep.hatchRun()` each tick while
spawning, which revives the boost request that `CreepRole.spawningRun` was
written for and that nothing calls today; the double-push in `spawnHatches`
(known issue 3) is fixed while there.

### 2.6 Tombstone lookup

`tombstone()` returns `null` while alive. Afterwards it needs the creep id
(remembered in memory) and the last room (instance field, or `memory.lastRoom`
after a reset). If that room is visible it scans `FIND_TOMBSTONES` once for
`t.creep.id === id`, caches the tombstone id, and thereafter resolves by id.
Tombstones live `5 * body parts` ticks, so the scan is bounded and rare. Use
cases: recover dropped resources through a mission hook `onDeath(tcreep)`,
death diagnostics (where, with how much TTL, `Rewalker` already infers
"murdered" from tombstones), and mission accounting.

### 2.7 `TStruct` (phase 2 preview)

```
class TStruct<S extends Structure> extends TObj<S>
  constructor(id, roomName?, xy?)   from memory: lastRoom/lastXY set, life = unseen
  lookup()  Game.getObjectById(id)  visible() = Game.rooms[lastRoom] exists
  get s(): S                        asserting accessor
  get memory(): StructMemory        Memory.rooms[room].structs[xy]  (position-keyed, survives rebuilds)
  claim(kind, who) / claimedBy(kind)   per-tick claims; replaces struct.tick.transfer/taken/renew/withdraw
  expired()                         dead, or unseen for 20,000 ticks
registerStruct(STRUCTURE_X)         class per structure type; tstruct(s) / tstructById(id) look up or create
```

`Link.mode` already keys its memory by position (`room.memory.links[xy]`)
because ids change when a structure is rebuilt; `TStruct.memory` generalises
that. Identity-bound state (cooldowns, store) is game state and needs no memory.

## 3. The `this` problem and the forwarders

Legacy creep code reaches 237 distinct member names through `this.`. 36 of them
are the creep's own API; the rest are mixin methods, `Debuggable`, `tick`,
`cache`, or memory. Three ways to make `this` the wrapper:

| option | typing | CPU | edits |
|---|---|---|---|
| **forwarders**: getters/methods on `TCreep` for the API members, typed by a `Pick<Creep, ...>` declaration merge | exact; `this.pos` is `RoomPosition` | one getter + one cached lookup per access | none in bodies |
| rewrite every access to `this.c.pos` | exact | same | ~600 mechanical edits, plus every future port |
| `Proxy` around the creep | loses types unless cast | Proxy traps are the slowest property path in V8 | none |

Forwarders win. The spike verified the typing under TS 3.9: a control file
assigning `t.pos` to a `RoomPosition` compiled and assigning `t.hits` to a
`string` was rejected.

```ts
const FORWARDED_PROPS = ["pos", "room", "store", "body", "hits", "hitsMax", "fatigue", "my", "owner",
    "spawning", "saying", "effects", "carry", "carryCapacity", "tick", "cache"] as const;
const FORWARDED_METHODS = ["attack", "attackController", "build", "cancelOrder", "claimController",
    "dismantle", "drop", "generateSafeMode", "getActiveBodyparts", "harvest", "heal", "move",
    "moveByPath", "moveTo", "notifyWhenAttacked", "pickup", "pull", "rangedAttack", "rangedHeal",
    "rangedMassAttack", "repair", "reserveController", "say", "signController", "suicide",
    "transfer", "upgradeController", "withdraw"] as const;

export interface TCreep extends Pick<Creep, ForwardedProp | ForwardedMethod> {}
export class TCreep extends TObj<Creep> { ... }

for (const prop of FORWARDED_PROPS)
    Object.defineProperty(TCreep.prototype, prop, { get() { return (this.c as any)[prop]; }, configurable: true });
for (const method of FORWARDED_METHODS)
    (TCreep.prototype as any)[method] = function (...args: any[]) { return (this.c as any)[method](...args); };
```

Deliberately not forwarded: `name` (wrapper field), `id`, `memory`,
`ticksToLive`, `spawnTime`. The last two carry egg semantics that
`Mission.nCreeps` depends on (an egg counts as a full life).

Only three places pass the creep itself into a game API and need `this.c`:
`rewalker.walkTo(this, ...)` in `creep.move.ts`, `lab.boostCreep(this)` and
`spawn.renewCreep(this)` in `creep.role.ts`. `PathFinder` calls use `this.pos`
and are fine. `Rewalker` itself reads only native creep fields and
`memory._walk`, so it is untouched.

CPU: a forwarded property costs a getter call, the `_tick === Game.time` check,
and the property read; a forwarded method adds one frame and a rest/spread. At
a few hundred accesses per creep per tick this is microseconds against
per-creep costs of 0.2 ms and up. Measure before and after the flip with the
existing per-creep accounting (`memory.cpu`, `busyCreeps(n)` in the console).

## 4. Composition: the chain becomes real inheritance

Today the chain uses `extends` only for typing and `@injecter(Creep)` copies each
class's own methods onto `Creep.prototype`. In the new model the same classes
are simply inherited:

```
TCreep                 tcreep.ts        lifecycle, forwarders, tombstone, mission
 └ CreepStats          creep.ts         body maths as functions + wrapper getters (partsByType, info, hurts, hostile, ...)
    └ CreepRole        creep.role.ts    legacy task memory (checkId/checkFlag/taskTask), boosts, team/home shim, legacyRun/legacyAfter
       └ CreepMove     creep.move.ts    move*/taskMove*/moveSpot/flee/retreat  (TaskRet protocol)
          └ CreepCarry creep.carry.ts   transfer/withdraw/pickup families
             └ CreepHarvest └ CreepBuild └ CreepRepair
                └ MyCreep   mycreep.ts   registry, spawn(), localSpawn, Task2 lifecycle (init/start/after/run/runTask), walk*
                   + 42 legacy JS mixins merged onto MyCreep.prototype (creep.attack/dismantle/heal/oldrepair/work, role.*.js)
                   + role.*.ts classes merged onto MyCreep.prototype until each is converted
                   └ Worker, Ctrl, Hauler, Srcer, Startup, Reboot, Scout, Swiper, Farmer, Hub ...  one class per role
```

Rejected alternatives: retargeting `@injecter` at `MyCreep` keeps the copying
without the typing benefit; class-expression mixins (`(Base) => class extends
Base`) work in TS 3.9 but fight decorators and abstract members and buy nothing
for a chain that is already linear. They remain the right tool if optional
bundles (combat: attack + heal + move) are wanted later. A prototype with ~400
methods is fine for V8; lookups are inline-cached.

### 4.1 Collisions and their resolution

`surface.js` finds every name defined on both sides. All are renames:

| name | today | resolution |
|---|---|---|
| `run`, `after` | `CreepRole` dispatch by name vs `MyCreep` lifecycle | `CreepRole.legacyRun()` / `legacyAfter()`; `MyCreep.start()` defaults to `legacyRun()`, `MyCreep.after()` to `legacyAfter()` |
| `spawningRun` | `CreepRole` (boosts) vs `MyCreep` (no-op) | `hatchRun()`; called from `Mission.spawnHatches` |
| `role`, `ticksToLive`, `spawnTime` | duplicated getters/fields | `TCreep` owns them; drop from `CreepRole`/`CreepExtra` |
| `moveRoom`, `moveDir`, `moveTarget`, `movePos` | `CreepMove` (TaskRet) vs `JobCreep` (Task2Ret) | Task2 versions renamed `walkRoom`/`walkDir`/`walkTarget`/`walkPos` next to the existing `walkRange`; call sites: Farmer 4, Scout 1, Swiper 2, internal 7 |
| `home` | `CreepRole` (`Room`) vs `Farmer`/`Swiper` (`Room \| null`) | rename the job getters `homeRoom` |
| `nearSpawn` | `CreepRole` (memory.spawnid) vs `CreepShunt` (memory.spawn) | keep one |
| `mycreep` | `CreepRole` reaches the wrapper through the registry | the wrapper is `this`; `this.mission` replaces `this.mycreep.mission` |

JS-vs-TS and JS-vs-JS collisions: none (the `afterWorker` duplicate is already
fixed). The merge order still matters for the future, so `mycreep.ts` keeps the
`main.js` list order and `surface.js` keeps reporting collisions.

### 4.2 Legacy JS mixins on the wrapper

`lib.merge(MyCreep, require('role.worker'))` for each of the 42 files, in the
current order. Their bodies use only forwarded API, chain members, `Debuggable`,
memory and each other; `surface.js` confirms every live role's transitive
closure resolves (the single unresolved name, `this.findStructs` in
`role.chemist.js`, is broken today too). Members that TypeScript calls are
declared once by interface merge:

```ts
export interface MyCreep {          // was: interface Creep { ... } in types.d.ts
    idleEmergencyUpgrade(): TaskRet
    goUpgradeController(controller: StructureController | undefined, move?: boolean): TaskRet
    taskHarvestSpots(): TaskRet
    ...
}
```

### 4.3 `creep.ts` as functions

The body-stat getters (`partsByType`, `activeByType`, `info`, `hurts`,
`hostile`, `assault`, `weight`, `bodyCost`, `bodyInfo`) become exported
functions over a `Creep`, cached in the creep's own `cache`. `CreepStats` (the
wrapper view) and the kept `@extender CreepExtra` (needed by `strat.ts` for
enemy creeps and by `struct.tower.js`) are both one-line delegations, so there
is one implementation. Phase 4 removes the extender once those two callers use
the functions.

## 5. Coexistence: Path A step by step

Path B (keep injecting into `Creep.prototype` and add the wrapper beside it)
would require every mixin to exist twice, once with `this: Creep` and once with
`this: TCreep`, and every divergence to be fixed twice. Path A makes one commit
that changes where the code lives and nothing about what it does.

### 5.1 The flip commit

| file | edit | size |
|---|---|---|
| `src/tobj.ts`, `src/tcreep.ts` (new) | from `spike/tobj.ts`, `spike/tcreep.ts` | ~190 + ~230 lines |
| `src/creep.ts` | getters -> exported functions; thin extender + `CreepStats` | rewrite, ~230 lines (spike `t.creep.ts`) |
| `src/creep.role.ts` | re-root at `CreepStats`; drop `mycreep`/`JobCreep` imports and getter; rename `run/after/spawningRun`; `this.c` at two API calls; delete dead `spawningRun(room)`; `interface Creep { moveNear }` becomes an interface merge on `CreepRole` | -37 / +14 (measured) |
| `src/creep.move.ts` | drop injecter; `walkTo(this.c, ...)` | -3 / +1 |
| `src/creep.carry.ts` | drop injecter; `taskSortMineral` declaration becomes an interface merge | -5 / +5 |
| `src/creep.harvest.ts`, `creep.build.ts`, `creep.repair.ts` | drop injecter | -2 each |
| `src/mycreep.ts` | `MyCreep extends CreepRepair`; registry on `Registry`; `start()`/`after()` default to legacy dispatch; absorb `job.creep.ts` (`walk*`) and `job.role.ts` (`localSpawn`); the `mods` list and merge loop move here | rewrite, ~290 lines (spike `t.mycreep.ts`) |
| `src/job.creep.ts`, `src/job.role.ts` | delete (or keep as `export { MyCreep as JobCreep, MyCreep as JobRole }` shims) | — |
| `src/job.*.ts` (10) | `extends MyCreep`; `moveRoom` -> `walkRoom` (7 sites); Farmer/Swiper `home` -> `homeRoom`; Farmer `this.cc` -> `this` | ~25 lines |
| `src/role.*.ts` (9) | `@injecter(Creep)` -> `@injecter(MyCreep)` with the import | 2 lines each |
| `src/main.js` | remove the `mods` loop; import `mycreep` before `role.*.ts` and `job.*.ts` | ~-50 lines |
| `src/mission.ts` | `runCreeps` no longer deletes memory / `unget`s; `spawnHatches` calls `hatchRun()`; fix double push | ~10 lines |
| `src/types.d.ts` | move the legacy `interface Creep { run, after, idle*, ... }` declarations to `interface MyCreep` | ~-15 lines |
| `src/console.js` | `global.mc = name => require('mycreep').getMyCreep(name)` | 2 lines |
| `src/spawn.ts`, `src/strat.ts`, `src/struct.tower.js`, `src/debug.ts`, `src/Rewalker.ts` | none | 0 |
| docs | `creep-roles.md`, `conventions-and-styles.md`, `missions-and-jobs.md`, `runtime-tick.md`, `memory-layout.md`, `file-inventory.md`, `CLAUDE.md` | text |

After the flip, `Creep.prototype` carries only `CreepExtra` (thin),
`Debuggable`, `tick`/`cache`, and `toString`. No role or task method is on it.
Behaviour is identical: the same bodies run in the same order with the same
memory, the only runtime differences being the `this.c` indirection, the
deferred memory deletion, and boosts requested during spawning again.

### 5.2 Converting a role (worked example: Hub)

`spike/t.hub.ts` is `role.hub.ts` + `job.hub.ts` as one class:

1. `class Hub extends MyCreep` with `@register`; `spawn()` copied from the job.
2. `roleHub()` body copied verbatim as `shuttle(): TaskRet`; `start()` calls it
   and returns `"wait"` (a stationary role re-decides every tick).
3. `afterHub()` body copied verbatim as `after()`.
4. Delete `role.hub.ts` and `job.hub.ts`; `surface.js` and `tsc` must stay clean.

A role with a task chain (`worker`, `hauler`, `bootstrap`) converts the same way
with `start()` returning `"wait"` when the chain returned a truthy `TaskRet` and
`"start"` otherwise, exactly as `job.farmer.ts` does today, minus the `this.cc`
cast. Porting individual `task*` helpers to `@task` methods is optional and can
follow later (section 6).

### 5.3 Verification, per step

1. `node spike/surface.js`: every live role's `unresolved` list is empty and the
   collision lists contain only the intended renames.
2. `npx tsc -p tsconfig.json --noEmit`: clean (the baseline is clean today).
3. Deploy with `npx gulp season` while the bucket is full; note the previous
   commit for rollback.
4. Watch the console for `Missing Role!`, `no creep object` (the `c` assertion),
   `mismatched tasks`, and `runRow` error notifications for a few hundred ticks;
   `Memory.debug = true` briefly for the full `dlog` stream.
5. Compare per-creep CPU (`busyCreeps(10)`, `memory.cpu / age`) with the
   pre-flip numbers; the expected change is within noise.
6. Confirm the lifecycle: `Memory.missions.GlobalRespawn` lists stay stable,
   `retired creeps ...` log lines appear up to 250 ticks after deaths, and
   `Memory.creeps` holds `id`/`lastRoom`/`died` for corpses only.
7. Rollback is `git revert` plus `npx gulp season`; the extra memory fields are
   harmless to the old code.

## 6. Task protocol

Three protocols coexist: legacy `TaskRet` strings with `memory.task` and
`checkId`, Task2 (`@task`, `memory.task2`, `Task2Ret`, the `run()` loop), and
`Tasker` (power creeps, flags). The new style uses **Task2** and keeps the
legacy helpers callable from it:

| legacy `TaskRet` | meaning | in a Task2 `start()` |
|---|---|---|
| truthy string | intent issued, busy | `return "wait"` |
| `false` | nothing to do / failed | fall through to the next choice, finally `return "start"` |
| `'success'` | one-shot intent done | `return "wait"` (or `"again"` to re-decide this tick) |

Improvements to make while the protocol is being touched, none required for the
flip:

- `checkId` verifies the caller's name with `debug.where(2)`, which calls
  `Error.captureStackTrace` on every task tick. Drop the check; the name is
  already passed explicitly.
- `@task` should serialise game-object arguments by id itself (`{$id}` marker)
  instead of the never-set `task.id` index that `runTask` looks for.
- `Tasker` stays for flags and power creeps until phase 3 wraps those.

## 7. Dispatch and registry

The registry (`myroles`: role name -> class, `@register`/`@registerAs`)
replaces name-based dispatch as roles convert. Until then `MyCreep.start()`
dispatches `roleXxx` on the wrapper by name exactly as `CreepRole.run()` does
today, including the CPU accounting and task line drawing. Unknown roles still
fall back to a bare `MyCreep` with a `Missing Role!` log. `hatchRun()` is the
spawning-phase hook (boost requests); `eggRun()` stays the egg-phase hook.
Console access: `mc('asrc0').debug = 500`; `Game.creeps.asrc0.debug = 500`
keeps working because both read the same memory field.

## 8. Consumers outside the creep layer

| consumer | uses | flip | phase 4 |
|---|---|---|---|
| `strat.ts` `legacyInit` | `c.hostile/assault/melee` on enemy creeps | unchanged (`CreepExtra` kept) | `isHostile(c)` etc. from `creep.ts` |
| `struct.tower.js` | `c.hurts` on my creeps and power creeps (undefined for power creeps today) | unchanged | `hurts(c)` |
| `spawn.ts` | `Game.creeps[x].log(...)` | unchanged (`Debuggable` kept) | `getMyCreep(x).log` |
| `creep.role.ts` `spawningRun(room)` | never called | deleted | — |
| `mission.ts`, `job.role.ts` | `this.c.run()/after()` bridge | replaced by `legacyRun()` on the wrapper | — |
| logs everywhere | `${creep}` HTML link | unchanged (`toString` kept) | engine `[creep name]` if removed |
| `console.js` | `busyCreeps` reads memory only | add `mc()` | — |

## 9. Structures (phase 2)

Sites that move onto `TStruct` instances, counted across `src/`:

| today | sites | becomes |
|---|---|---|
| `struct.tick.transfer/taken/renew/withdraw` per-tick claims | 13 | `tstruct(s).claim('transfer', this.name)` |
| `.mode` on links and containers (`room.memory.links[xy]`, `containers[id]`) | 38 | `TLink.mode`, `TContainer.mode` backed by `TStruct.memory` |
| `lab.planType`, `room.memory.labs` | 30 | `TLab` |
| `terminal.energyFill()/energyDrain()/requestMineral` | 6 | `TTerminal` |
| `runTowers/runLinks/runLabs/runFactory(room)` | 4 runners | iterate wrappers; still called from `ClaimedStrat.run()` |
| `struct.note/xy/hurts/obstacle` (`struct.ts`) | ~70 | stay on the prototype (infra, like `toString`) |

Creep code gets wrappers from `room.find` results through `tstruct(s)`: a Map
lookup per structure touched, created on first sight with the class registered
for its `structureType`. Memory keyed by position means a rebuilt link or
container keeps its mode. The room runners keep their signatures so
`ClaimedStrat` does not change.

## 10. Rooms and the rest (phase 3)

Room extension use across `src/`: `findStructs` 64, `log/dlog/errlog` 63,
`lookForAtRange` 31, `packPos/unpackPos` 33, `meta` 17, `hostiles/enemies/
assaulters/melees/allies` 51, `energyFreeAvailable` 9, `getSpot` 8, `maxHits`
7. `room.strat` and `room.meta` are already persistent objects keyed by room
name. A `TRoom` (keyed by name; `visible()` = `Game.rooms[name]`) would own
strat, meta, the hostile lists and the structure grouping, and be introduced as
a facade while `Room.prototype` extensions stay until callers migrate. Flags
(`Tasker`, metastruct planning), sources (`spots/bestSpot`), construction sites
and tombstones follow the same pattern. `RoomPosition.xy`, `Room.packPos` and
the `RoomVisual` helpers stay as prototype infrastructure.

## 11. Runtime constraints

- **Global reset.** Every registry is empty after a reset and refills on first
  access; state is derived from `Memory` plus the game. The only memory the
  design adds is `id`, `lastRoom`, `died` on creeps (about 40 bytes each) and,
  in phase 2, `Memory.rooms[x].structs[xy]`.
- **Heap.** Wrappers are small objects; tens for creeps, hundreds per room for
  structures, bounded by retirement. Unrelated but worth knowing: `spots.ts`
  caches positions by JSON key without eviction.
- **CPU.** See section 3; the per-tick sweep of the creep registry is a loop
  over tens of entries doing one cached lookup each. Structure sweeps run every
  20 ticks.
- **TypeScript 3.9.** `interface X extends Pick<...>` merging with a class
  works (verified). `import type` is available. There is no `override`
  keyword, so collisions surface only as type mismatches or silently as
  shadowing; `surface.js` is the guard. Getter/setter pairs must agree in type;
  `Debuggable.debug` relies on the pre-4.3 rule that an unannotated getter takes
  the setter's parameter type, so overrides must not annotate the getter.
- **Compiler upgrade (separate study).** `gulp-typescript` 3 accepts a newer
  `typescript` through `createProject({ typescript })`; TS 5 keeps
  `experimentalDecorators`. What it would unlock here is `override`, better
  mixin typing, and `satisfies`; nothing in this design needs it. `@types/lodash`
  must stay at 3.x to match the game's lodash.
- **Server runtime.** Only ES2019 features already in use are required; no
  `WeakRef`/`FinalizationRegistry`, no `Proxy`.

## 12. Sizing and sequencing

| phase | content | leaves the game | effort |
|---|---|---|---|
| 0 (done) | design, `spike/`, `surface.js` | untouched | — |
| 1 flip | section 5.1; deploy; verify | identical behaviour, `Creep.prototype` free of role code | 1 to 2 sessions including the deploy watch |
| 1b convert | Hub and Srcer (spike shows Hub); then Ctrl, Worker, Hauler, Bootstrap/Startup/Reboot as `MyCreep` subclasses; delete the `role.*.ts`/`role.*.js` files as they empty out | one file per live role | about half a session per role |
| 2 structures | `TStruct`, claims, link/container modes, labs, terminal, tower/link/lab/factory runners | structure logic on wrappers, `struct.*` merges removed | 2 to 3 sessions |
| 3 rooms and others | `TRoom` facade, then callers; flags, sources, sites, tombstones | `Room.prototype` reduced to infra | 3 or more sessions, incremental |
| 4 cleanup | `strat.ts`/`struct.tower.js` to functions; remove `CreepExtra`, then `Debuggable`/`tick`/`cache` from `Creep`; drop `@injecter`/`@extender` for creeps; remove `checkId` stack check; `@task` id serialisation | game prototypes untouched by creep code | 1 session |

Docs to update at phase 1: `creep-roles.md` (dispatch and mixin chain sections),
`conventions-and-styles.md` (era 3 rules: no `@injecter(Creep)`, `walk*` vs
`move*`), `missions-and-jobs.md` (class map, lifecycle, retirement),
`runtime-tick.md` (RetireDaemon row), `memory-layout.md` (new creep fields),
`file-inventory.md`, `known-issues.md` (items 3 and 7 closed), `CLAUDE.md`.

## Appendix D: first shipped wrappers, `TPowerCreep` / `MyPowerCreep` (Sept 2026)

`src/powercreep.ts` was rebuilt around the first wrappers built on this design
that `src/` actually imports. They are self-contained rather than built on
`spike/tobj.ts`, since nothing in `src/` may import `spike/`:

- `TPowerCreep(name)`: any power creep, mine or foreign. `obj` resolves once per
  tick (`Game.powerCreeps[name]`, else a per-tick index of
  `FIND_HOSTILE_POWER_CREEPS` over visible rooms); `p` returns the game object
  or throws. Inspection only: `exists`, `my`, `spawned`, `onThisShard`, `pos`,
  `room`, `level`, `className`, `hits`, `store`, `powers`, `hasPower`,
  `powerLevel`, `powerCooldown`, `powerReady` (cooldown and ops),
  `roomPowerEnabled`, `spawnCooldown` (wall-clock ms). `mine()` returns the
  `MyPowerCreep` for one of mine, else null. Keeps only `name`, `lastSeen`,
  `lastRoom`, `lastXY` across ticks.
- `MyPowerCreep extends TPowerCreep`: every PowerCreep intent (`spawn`, `renew`,
  `upgrade`, `rename`, `delete`, `suicide`, `usePower`, `enableRoom`, `move`,
  `moveTo`, `moveByPath`, `withdraw`, `transfer`, `pickup`, `drop`, `say`, ...),
  each recording `intents.<kind>` on `OK` per the CLAUDE.md convention.
  `spawn(ps)` records the power spawn's room as `memory.home` (`homeName`/`home`
  getters on `TPowerCreep`). Movement helpers `walkTo(pos, range)` / `moveRoom(room)` wrap Rewalker.
  `idleRenew()` renews at an adjacent own power spawn without moving (questSwipe
  calls it first); `runRenew(room = homeName)` walks to that room's power spawn and renews.
  Behaviours are plain methods a service calls each tick; the first is
  `questSwipe(targetRoom, homeRoom)`, the `job.swiper.ts` loop for a power creep:
  fill from the cheapest-path non-own stocked structure (`planWalk` over the
  candidates; nuker and rampart-covered tiles excluded, refusals skipped 1500
  ticks), then straight to the home storage/terminal (else drop at the
  controller) one resource per tick; state in `memory.swipe = { target, skip }`;
  returns a status string, or false (and clears the state) once the creep is
  empty and the target room has nothing left: standing there, or back home after
  unloading the last partial load (`memory.swipe.dry`).
- `getPowerCreep(name)` is the registry (one wrapper per name per global; mine
  always come back as `MyPowerCreep`), `myPowerCreeps()` lists mine.


## Appendix A: spike

```
npx tsc -p tsconfig.spike.json          # src/ + spike/ together; 0 errors, 181 files, check 0.9 s
node spike/surface.js                   # report used for every number in this document
```

Files and what each demonstrates are listed in `spike/README.md`. The chain
copies carry a `t.` prefix only so they can sit beside the originals; the diff
below is measured with the import renames normalised away.

```
creep.role.ts:    370 lines, -37 +14
creep.move.ts:    195 lines,  -3  +1
creep.carry.ts:   527 lines,  -5  +5
creep.harvest.ts:  18 lines,  -2  +0
creep.build.ts:    78 lines,  -2  +0
creep.repair.ts:  125 lines,  -2  +0
TOTAL:                       -51 +20
```

Of the 37 removed lines in `creep.role.ts`, 14 are the dead `spawningRun(room)`
function and 6 are the `mycreep`/`role` getters the wrapper makes redundant.

## Appendix B: surface report highlights

Forwarders needed (36), by use count: room 235, store 126, pos 125, memory 113,
ticksToLive 18, name 12, body 10, say 10, hits 8, drop 5, harvest 5, spawning 3,
transfer 3, withdraw 3, carryCapacity 3, attackController 3, rangedMassAttack 2,
suicide 2, then one each of hitsMax, move, id, pickup, build, repair,
rangedAttack, attack, dismantle, heal, rangedHeal, reserveController,
upgradeController, claimController, getActiveBodyparts, fatigue, signController,
notifyWhenAttacked. Never used through `this`: cancelOrder, carry,
generateSafeMode, moveByPath, moveTo, my, owner, pull, saying, effects
(forwarded anyway for uniformity).

Live-role closures (files reached through `this.X`): startup/reboot/worker 12
to 13 files, asrc/bsrc 10, ctrl 9, hauler/hub/farmer 7. Every closure passes
through `creep.role.ts`, `creep.move.ts`, `creep.carry.ts` and `creep.ts`, which
is why the flip is one commit and not many.

## Appendix C: open points and risks

- The forwarders make an egg or corpse look like a creep at the type level; a
  role that touches `this.pos` outside the alive phase throws `no creep object`.
  That is the intended loud failure, but `eggRun()`/`hatchRun()` code must use
  `obj`, `memory` and `mission` only.
- A creep spawned by hand from the console has no mission; its wrapper is a bare
  `MyCreep` (`Missing Role!`) and is retired normally when it dies.
- `role.js` (orphan, not imported) defines `Creep.prototype.role`; leave it
  unimported or delete it.
- `powercreep.ts` merges its own extras onto `PowerCreep.prototype` and uses
  `Tasker`; a `TPowerCreep` mirrors `TCreep` when power creeps come back
  (`Rewalker` already accepts `PowerCreep`).
- The Season server's Node version was not checked from here; the design uses
  nothing beyond what the current build already runs.
