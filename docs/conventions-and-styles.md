# Conventions and Coding Styles (by era)

The repo spans 2017-2026 and three distinct styles coexist. Match the style of
the layer you are editing; new behaviour goes in the 2022 style.

## Era 1: 2017 plain JS (`role.*.js`, `creep.*.js`, `struct.*.js`, `lib.js`, `spawnold.js`, `team.egg.js`)

- `standard`-style: no semicolons, 2-space indent, space before parens
  (`roleHauler () {`), single quotes.
- Mixins are classes that are never instantiated:
  `module.exports = class CreepHauler { roleHauler () {...} }`, merged with
  `lib.merge(Creep, require('role.hauler'))` (own property descriptors copied
  onto the prototype; later merges overwrite earlier ones).
- Structure extras use the same trick: `class TerminalExtra {...}; lib.merge(StructureTerminal, TerminalExtra)`.
- Direct `Klass.prototype.fn = function () {...}` for one-offs
  (`Room.prototype.findStructs`, `Flag.prototype.*Egg`).
- CommonJS exports (`exports.run = ...`) mixed with `import` statements (TS
  compiles both).
- Behaviour is flag-centric: `this.team` (a `Flag`), `Game.flags[...]`,
  `flag.memory.creeps`.
- Debug output through `this.dlog(...)` gated by `creep.debug`.

## Era 2: 2019-2020 TypeScript (`*.ts` except the job/process files)

- 2-space *or* 4-space indent, semicolons mostly present, double or single
  quotes; not normalised.
- Prototype extension via decorators from `src/roomobj.ts`:
  - `@extender class XExtra extends X {...}`: copies the class's own prototype
    members onto `X.prototype` (`Object.getPrototypeOf(extra.prototype)`).
    Use when the class extends the game class directly.
  - `@injecter(Creep) class CreepMove extends CreepRole {...}`: copies onto the
    named target. Used for the creep mixin chain where `extends` is only for
    typing.
  - `merge(Room, RoomMetaExtra)` from `lib` when a decorator is awkward.
- Global typing via `declare global { interface CreepMemory { ... } }` placed in
  the module that owns the field; `src/types.d.ts` holds the leftovers.
- Bare module imports resolved by `baseUrl: src/`: `import { x } from 'mod'`.
- Cache properties from `src/cache.ts`: `obj.tick` (cleared every tick) and
  `obj.cache` (hot/cold, expires 20-50 ticks or when the object vanishes) on
  `Room` and `RoomObject`; `theTick.inject(Klass)` for singletons (`Radar`,
  `Market`, keyed by `id`). Declare fields in `declare global { interface
  CreepCache {...} interface CreepTick {...} }`.
- `Debuggable` (`src/debug.ts`) mixed into `Creep`, `Flag`, `PowerCreep`,
  `Room`: `log`, `dlog` (only while `memory.debug > Game.time`), `warn`
  (deduped per location per tick), `errlog(err, ...)`. Module-level
  `debug.log/dlog/warn/location/where` prefix output with `file:line#func`
  using `Error.prepareStackTrace`. `Memory.debug = true` enables all `dlog`.
- Task memory via `checkId`/`checkFlag` (`creep.role.ts`) or the generic
  `Tasker` (`src/Tasker.ts`, used by power creeps and flags). `TaskRet`
  strings as documented in [creep-roles.md](creep-roles.md).
- `const enum` for compact memory values (`Mode`, `Kind`).
- Exceptions to "fields need initialisers" are allowed by
  `strictPropertyInitialization: false`.

## Era 3: 2022 TypeScript jobs (`process.ts`, `mission.ts`, `mycreep.ts`, `job.*.ts`, `ms.*.ts`, `spawn.ts`, `service.flag.ts`)

- 4-space indent, semicolons, double quotes.
- Registration by decorator into module-level `Map`s: `@register` (process
  services, creep jobs), `@registerAs("name")`, `@daemon` (instantiate and
  enqueue a `Process` at import), `@registerMeta` (metastruct).
- Wrapper objects instead of prototype extension: `MyCreep` instances are keyed
  by creep name and survive the creep's absence (eggs). Access the game object
  through `this.c`, memory through `this.memory`.
- Processes return their next priority row from `run()`; CPU gating via
  `bucket` and `canRun`.
- Commands are strings: `"Swipe W5N8 W6N8"`; `Service.args` splits on spaces.
- `Task2Ret` (`"again" | "start" | "wait" | false`) and the `@task` decorator
  persist resumable tasks in `memory.task2`.
- Population control is TTL-based (`nCreeps`) instead of tick pacing.

## Naming rules that code depends on

- Creep name = `role` + integer; role = first word lowercased. Never rename
  creeps or use camelCase role names (`_.words` splits them).
- Role entry points: `roleXxx` / `afterXxx` with `Xxx` = `_.camelCase(role)`.
- Method prefixes: `task*` (persistent, self-restarting), `go*` (single intent,
  optional move), `idle*` (no-move opportunistic), `pre*` (Tasker preloop).
- Flag names: `<self>_<parent>` for children; genesis flags are the only
  primary-ORANGE flags.
- Metastruct classes: `Meta_<role>`; missions: class name = first word of the
  schedule command; mission module file: `ms.<lowercase>.ts` (needed by
  `getOrImport`).
- Intent bookkeeping: set `this.intents.<kind>` (`melee`, `range`, `transfer`,
  `withdraw`, `pickup`, `move`) after a successful intent; check before issuing
  another of the same kind.
- `toString()` overrides return HTML room links; console output is HTML.

## CPU conventions

- Wrap loops over many objects in `shed.run(objs, bucket, fn)` (shuffles,
  try/catch, stops on throttle) or make them processes.
- Prefer `room.findStructs(type)` over `room.find(FIND_STRUCTURES)` filters.
- Memoise per tick in `obj.tick`, per few dozen ticks in `obj.cache`, and only
  persist in `Memory` what must survive a global reset.

## Migrating a legacy role to the job system

1. Keep the `roleXxx`/`afterXxx` methods; they still run through
   `JobRole.start()`.
2. Add `src/job.xxx.ts` with `@register export class Xxx extends JobRole` and a
   `spawn()` that calls `localSpawn` (body key in `spawnold.buildBody`) or
   builds a body with `energyDef`.
3. Replace `this.team` / `this.memory.team` usage with `this.mycreep.mission`
   or `this.teamRoom` (already patched to the mission room).
4. Remove egg-priority assumptions (`memory.egg.priority`); set
   `priority = N` on the job class instead.
5. Have a mission call `nJobs(Xxx, n)`.
6. Optionally port task chains to `@task` methods and `Task2Ret` so the
   `Creep.prototype` mixin can eventually be deleted.
