# Spawning and Body Construction

Two spawners exist. Only the first is live.

| | New (`src/spawn.ts`) | Old (`src/spawnold.js` `run()`) |
|---|---|---|
| Trigger | `SpawnDaemon` process, `late` row, bucket gate 2000 | `spawn.run()` after the `return` in `main.js` (dead) |
| Egg source | `Memory.creeps[name].nest === "egg"` (laid by Missions) | `Memory.creeps[name].egg` object (laid by flag teams) |
| Body | `MyCreep.spawn(spawns)` per job class | `buildBody(spawns, eggMem)` |
| Still used from old file | `findSpawns` and `buildBody` via `JobRole.localSpawn` | |

## SpawnDaemon (`runSpawns`)

1. Eggs = shuffled names with `nest === "egg"`, sorted by `eggOrder`: higher
   `MyCreep.priority` first (Reboot 10, Hauler 9, Srcer 8, others 0), then
   older eggs first in 500-tick buckets.
2. `[spawn, body] = mycreep.spawn(shuffledSpawns)`. Each job decides its own
   spawn and body. A `null` spawn means "cannot spawn now".
3. Per-room `usedEnergy` accumulates body costs so several eggs do not all
   assume the same energy. `spawn.spawning` rooms are skipped after accounting.
4. `spawn.spawnCreep(body, name, { energyStructures: room.strat.spawnEnergy() })`.
   Failure with an existing creep of that name marks `nest = "not egg!!!"`.
   Eggs older than 3000 ticks are logged as "Too Old" but never removed (TODO in
   code).
5. Success: `nest = spawn.name`, `home = room.name`.

## Body definitions

### `energyDef({ move, base?, per, energy, max? })` (both spawn.ts and spawnold.js)

Grows `level` from 2 while `defCost(level) <= energy` and `level <= max` (50),
then builds `per` repeated `level` times, plus `ceil(parts / move)` MOVE parts,
plus `base`. `move` is the parts-per-MOVE ratio (2 = one MOVE per two other
parts; 1 = one MOVE each). Parts are sorted by `partsOrdered`:
`TOUGH, WORK, CARRY, premove, ATTACK, RANGED_ATTACK, MOVE, CLAIM, HEAL`; half
the MOVEs are placed early (`premove`) so damage strips them before WORK/CARRY.
`base` is appended (and sorted) as well.

### Job-specific `spawn()`

- **Startup**: `_.sample(Game.spawns)`; body by `room.energyCapacityAvailable`:
  300 -> rotates `[W,W,C,M]` / `[W,C,M,M]` / `[W,C,C,M,M]` by `Game.time % 3`;
  350/400-450/500/550 fixed tables; else `energyDef({move:2, base:[M,C], per:[W,C]})`.
- **Reboot**: same shape but sized from `energyAvailable`, so it spawns
  immediately with whatever is in the spawn.
- **Scout**: `[MOVE]`. **Swiper**: `[MOVE, CARRY]`.
- **JobRole subclasses** (`Worker`, `Ctrl`, `Hub`, `Hauler`, `Srcer`):
  `localSpawn(spawns, eggMem)` -> `findSpawns(spawns, mission.roomName, {spawn:"local", body: role, ...eggMem})`
  -> `buildBody(possibleSpawns, eggMem, { maxRCL })`.

### `findSpawns(allSpawns, roomName, eggMem)` strategies

`local` = spawns in the room(s) at minimum `routes.dist` from the target;
`close` = within min+1; `max` = highest-RCL rooms within 10; `remote` = nearest
rooms with distance > 0; anything else is treated as a room name. Spawning
spawns are filtered out at the end.

### `buildBody` cases (`eggMem.body`)

The role name doubles as the body key unless the job overrides it (`Srcer`
passes `body: "srcer"`). Live keys are marked.

| key | live | shape |
|---|---|---|
| `worker` | yes | `energyDef({move:2, base:[M,C], per:[W,C]})`, spawn with capacity >= 300 |
| `ctrl` | yes | `buildCtrl`: RCL8 fixed 8M/15W/3C at >= 2050 energy; RCL7 15M/30W/5C at >= 4200; else `energyDef({move:2, per:[W], base:[C](+C above RCL4), energy: eggMem.ecap})` |
| `hub` | yes | `9x CARRY + MOVE`, spawn with >= 500 available |
| `hauler` | yes | `energyDef({move:2, per:[C], energy: eggMem.energy})`, spawn with >= `eggMem.energy` available (energy drops to available if under 550) |
| `srcer` | yes | `srcerBody`: `harvesterBody(eggMem.lvl)` (6 to 15 WORK by source regen level) plus extra CARRY at RCL7/8, trimmed to `energyAvailable` |
| `startup`, `reboot` | via `Startup`/`Reboot` classes instead | tables shown above; `reboot` case here is `[W,C,M]` |
| `bootstrap`, `bulldozer`, `cart`, `chemist`, `claimer`, `cap`, `cleaner`, `collector`, `coresrc`, `declaimer`, `defender`, `depositfarmer`, `farmer`, `guard`, `mason`, `micro`, `minecart`, `miner`, `mineral`, `mini`, `rambo`, `reserver`, `scout`, `shunt`, `tower`, `wolf` | no | see `src/spawnold.js:271-586` |

`eggMem` fields honoured by `buildBody`: `body`, `energy`, `ecap`, `lvl`, `max`,
`move`, `per`, `base` (the last three via `_.defaults` into `energyDef`).

## Naming

`findName(role)` in `mission.ts` (and the dead twin in `team.egg.js`) returns
`role + i` for the lowest `i` with no `Memory.creeps` entry, rotating a start
offset so names are reused slowly. The role is always recoverable from the
name: `_.words(name)[0].toLowerCase()`. Never give a creep a name whose first
word is not a registered role.

## Spawn energy ordering

`ClaimedStrat.spawnEnergy()` returns `room.meta.spawnEnergy()`: extensions and
spawns owned by `hub`, `cap`, and `asrc/bsrc` metas first (shuffled within a
priority tier, and already-full ones ahead), then remaining structures sorted by
range to storage/terminal, then `Meta_lab` energies last. `NullStrat` returns
`undefined` (engine default order).
