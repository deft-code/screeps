# Creep Roles: Dispatch, Mixin Chain, and Task Conventions

The 2017-2020 creep behaviour lives as methods merged onto `Creep.prototype`.
The 2022 job system reaches it through `JobRole.start()` -> `creep.run()` and
`creep.after()`. See [missions-and-jobs.md](missions-and-jobs.md) for the outer
loop.

## Dispatch (`src/creep.role.ts`)

```
CreepRole.run():   role = _.camelCase('role ' + this.role)   // 'asrc' -> 'roleAsrc'
                   (this[role] || this.roleUndefined).apply(this)
                   accumulate memory.cpu; dlog per-creep CPU
CreepRole.after(): _.camelCase('after ' + this.role) if it exists
```

`this.role` is the first word of the creep name. `run()` refuses spawning
creeps. `roleUndefined` logs `Missing Role!` and returns `false`.

## The mixin chain

TypeScript classes each `extends` the previous one for typing, but at runtime
`@injecter(Creep)` copies each class's *own* prototype methods straight onto
`Creep.prototype` (see [conventions-and-styles.md](conventions-and-styles.md)).

```
Creep
 ├─ CreepExtra   (creep.ts)      @extender  partsByType, activeByType, info/fullInfo (bodyInfo), hostile/assault, weight, bodyCost, spawnTime, hurts, toString(link)
 └─ CreepRole    (creep.role.ts) @injecter  run/after dispatch, home/team/teamRoom/atTeam/atHome, checkMem/checkId/checkFlag, taskTask, boosts (taskNeedBoost/taskBoost*), nearSpawn, idleImmortal (renew at an adjacent spawn when the pool is full; stores memory.ecap on first call and stops renewing once room capacity exceeds it)
     └─ CreepMove    (creep.move.ts)    moveDir/movePos/moveNear/moveRange/moveTarget (Rewalker), moveRoom, taskMoveRoom, taskMoveFlag, moveSpot, fleeHostiles/idleFlee, idleRetreat, actionHospital, moveBump
         └─ CreepCarry  (creep.carry.ts)  transfer/withdraw/pickup families: idleTransfer*, taskTransfer*, goTransfer, idleWithdrawExtra, idleRecharge, taskRecharge(Limit), taskWithdraw*, goWithdraw, idleNom/idleNomNom, taskPickup*, goPickup, taskDrop
             └─ CreepHarvest (creep.harvest.ts)  goHarvest
                 └─ CreepBuild (creep.build.ts)  idleBuild, taskBuildOrdered/Structs/Sites/..., goBuild
                     └─ CreepRepair (creep.repair.ts)  idleRepairAny, taskRepairHurt/Ordered/Structs, taskRepair, goRepair; exports repairable()
                         ├─ SrcerExtra  (role.src.ts)     roleAsrc/roleBsrc, afterAsrc/afterBsrc
                         └─ RoleMason   (role.mason.ts)   roleMason (+ a stray afterWorker)
             ├─ CreepHub    (role.hub.ts)     roleHub/afterHub
             ├─ CreepShovel (role.shovel.ts)  roleShovel/afterShovel
             ├─ CreepShunt  (role.shunt.ts)   roleCore/roleAux, structAtSpot, nearSpawn
             ├─ CapRole     (role.cap.ts)     roleCap/afterCap
             ├─ RoleMineral (role.mineral.ts) roleMineral
             └─ RoleDepositFarmer (role.depositfarmer.ts)

Legacy JS mixins merged by main.js's `mods` loop (lib.merge, overwrite on collision):
 creep.attack.js  goAttack/goRangedAttack/goMassAttack/idleAttack/taskAttack...
 creep.dismantle.js  goDismantle/taskDismantle(Any)/idleDismantle
 creep.heal.js    goHeal/goRangedHeal/idleHeal
 creep.oldrepair.js  idleRepairRoad, taskRepairRemote/Wall, taskTurtleMode/Prep/Turtle
 creep.work.js    idleEmergencyUpgrade, idleUpgrade, taskUpgrade(Room), goUpgradeController, taskReserve, idleHarvest, taskHarvestSpots, taskHarvest, taskCampSrc(s)
                  (taskHarvest remembers task.spot but adopts the current tile when bumped onto another source-adjacent one, so farmers do not walk back and re-bump)
 role.*.js (34 files)  roleXxx/afterXxx and role-private task helpers
```

## Live roles on the current build

Spawned by `GlobalRespawn` -> `JobRole`/`JobCreep` -> these prototype methods:

| Creep name prefix | Job class | Method | File | Behaviour |
|---|---|---|---|---|
| `startup` | `Startup` | `roleStartup` -> `roleBootstrap` | `role.bootstrap.js` | Generalist: emergency upgrade, harvest from source spots, fill towers/extensions/spawns, build towers, turtle repairs, build/repair ordered, upgrade, camp sources. Until RCL2 it only upgrades. `after`: nom, recharge, transfer extra, build/repair/upgrade when over half full, harvest. |
| `reboot` | `Reboot` | `roleReboot` -> `roleBootstrap` | `role.reboot.js` | Same as startup; exists to spawn from whatever energy is available when the room has no creeps. |
| `pioneer` | `Pioneer` | `rolePioneer` -> `roleBootstrap` | `role.bootstrap.js` | Same as startup, laid by the `Startup <room>` mission (not GlobalRespawn): spawned outside the mission room and homed on it, so `atHome`/`home` point at the assisted room. |
| `worker` | `Worker` | `roleWorker` | `role.worker.js` | Build towers, turtle mode, build ordered, repair ordered, turtle prep/turtle, upgrade when storage > 10k or no storage; otherwise recharge (harvest fallback). `after`: idle nom/recharge/build/repair/upgrade, then `idleImmortal` when beside a spawn. |
| `ctrl` | `Ctrl` | `roleCtrl` | `role.ctrl.js` | Sit on the `ctrl` spot, upgrade; refill from an adjacent store/link/container (remembers `memory.struct`). `after`: place a container on the spot below RCL8. |
| `hauler` | `Hauler` | `roleHauler` | `role.hauler.js` | Fill towers, then extensions/spawns (`taskTransferPool`), pick up drops, drain src containers / terminal surplus, distribute to labs/nuker/power spawn/sink containers, dump minerals to terminal/storage. `after`: idle nom/recharge, then `idleImmortal` when beside a spawn. |
| `hub` | `Hub` | `roleHub` | `role.hub.ts` | Stationary on the `hub` spot: shuttle energy among storage, terminal, hub link, and adjacent spawn/tower using `storageBalance` and `hubNeed`. `after`: renew in place (`idleImmortal`). |
| `upgrader` | `Upgrader` | Task2 `start()` (no `roleUpgrader` call) | `job.upgrader.ts` | Surplus sink, laid while RCL < 8 and storage holds >= 100k energy (storage energy / 100k, so 150k = 1.5; priority -1): `taskRecharge` from storage/links/containers, then `goUpgradeController`. `after`: `idleNom` + `idleRecharge`. `role.upgrader.js` is the unported original. |
| `asrc`, `bsrc` | `Srcer` | `roleAsrc`/`roleBsrc` | `role.src.ts` | Static miner on the meta spot: harvest, fill adjacent extensions/spawn, manage the source link mode (`src`/`dump`/`pause`), sip from container/link when recharging. `after`: idle build/repair. |

Everything else with a `roleXxx` method is loaded but not spawned by any job.
To bring one back, write a `Job*` class ([missions-and-jobs.md](missions-and-jobs.md)).

| Prefix | File | Notes |
|---|---|---|
| `cap` | `role.cap.ts` | Extension filler around `Meta_cap`. |
| `shovel` | `role.shovel.ts` | Second hub creep for factory/power spawn/terminal. |
| `core`, `aux` | `role.shunt.ts` | Link/storage shunt (pre-hub design). |
| `mason` | `role.mason.ts` | Boosted wall/rampart repairer. |
| `mineral`, `minecart` | `role.mineral.ts`, `role.minecart.js` | Extractor miner and its hauler. |
| `depositfarmer` | `role.depositfarmer.ts` | Highway deposit farming (needs the dead radar/deposit pipeline). |
| `harvester`, `harvestaga`, `miner`, `srcer`, `coresrc`, `auxsrc` | `.js` | Older source miners; `srcer` (159 lines) is the pre-meta static miner. |
| `trucker`, `truckaga`, `collector`, `cart`, `farmer`, `zombiefarmer`, `dropper` | `.js` | Remote-mining logistics for the flag team system. |
| `upgrader`, `paver`, `reserver`, `claimer`, `declaimer`, `scout`, `manual`, `recycle` | `.js`/`.ts` | Utility roles. `role.recycle.ts` is not imported at all. `paver`, `reserver`, `claimer`, `scout` have Task2 job ports (`job.*.ts`) that the missions use instead. |
| `guard`, `mini`, `tower`, `wolf`, `micro`, `defender`, `medic`, `caboose`, `archer`, `rambo`, `ram`, `bulldozer`, `opener`, `cleaner`, `stomper`, `drain`, `chemist`, `power` | `.js` | Combat, siege, lab, and power roles. `role.power.js` has hardcoded MMO room `W29N11`. |

## Task and return conventions (legacy layer)

Method prefixes are a contract, not decoration:

- `roleXxx()` / `afterXxx()`: entry points. `after` runs once per tick after
  the role and is for opportunistic zero-cost actions on the way past.
- `taskXxx()`: chooses a target, records it with `checkId(name, obj)` /
  `checkFlag(name, flag)` into `memory.task = {task, id|flag, first, ...}` and
  performs the action, moving if needed. Returns a truthy string while busy or
  `false` when done/impossible. `taskTask()` replays `memory.task` by calling
  `_.camelCase('task ' + memory.task.task)` with no arguments; each `taskXxx`
  therefore must accept `undefined` and fall back to `checkId(name, undefined)`
  to reload its target from memory.
- `goXxx(target, move=true)`: perform one intent now; move toward it on
  `ERR_NOT_IN_RANGE` only when `move` is true. Returns `'success'`/a string or
  `false`. Sets `this.intents.<kind>` so later `idle*` calls do not double-book
  the same intent type (`melee`, `range`, `transfer`, `withdraw`, `pickup`, `move`).
- `idleXxx()`: `goXxx(..., false)` variants used from `after`.
- Return type is `TaskRet` (`src/Tasker.ts`): `false` | `'done'` | `'role'` |
  `'again'` | any other string means "busy, stop". `run()` warns on `'done'` or
  `'again'`.
- Chains are written as `a() || b() || c()`; ordering is priority.

## Where creeps stand: spots

`room.getSpot(name)` (room.ts) checks `Memory.rooms[x].spots[name]` first, then
`room.meta.getSpot(name)` (metastruct points: `hub`, `shovel`, `ctrl`,
`asrc`/`bsrc`, `mineral`, `tripod`). `moveSpot()` walks to
`getSpot(memory.spot || role)`. `hub`, `shovel`, `ctrl`, `asrc`, `bsrc`, `core`,
and `aux` are all spot-parked roles.

## Team and home (legacy fields still used)

`creep.team` (creep.role.ts) now fabricates a transient `Flag` object at the
mission room centre, so legacy code that does `this.moveRoom(this.team)` or
`this.atTeam` keeps working without real flags. `creep.home` is
`memory.home` (set by the spawner) or the team room.
