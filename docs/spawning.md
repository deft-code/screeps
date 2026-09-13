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
then steps back one and builds `per` repeated `level` times, plus
`ceil(parts / move)` MOVE parts, plus `base`. `move` is the parts-per-MOVE
ratio (2 = one MOVE per two other parts; 1 = one MOVE each). Parts are sorted
by `partsOrdered`:
`TOUGH, WORK, CARRY, premove, ATTACK, RANGED_ATTACK, MOVE, CLAIM, HEAL`; half
the MOVEs are placed early (`premove`) so damage strips them before WORK/CARRY.
`base` is appended (and sorted) as well.

How the scaling plays out, since it is easy to misread:

- **Two energy numbers.** The `buildBody` cases pair `energyDef` with
  `energySpawn(spawns, min)`, which picks the first candidate spawn whose room
  `energyCapacityAvailable >= min`. `min` is a gate on the *room*, not on the
  body. The body is then sized from `energy: spawn.room.energyAvailable`, what
  is banked in that room at the tick the egg is tried. A rich room that has
  just spawned something gets a small creep; the same room full gets a big one.
- **The floor is level 1.** `level` starts at 2, so if even level 2 costs more
  than `energy` the loop never runs and the final `level--` leaves level 1:
  one copy of `per` plus its MOVEs plus `base`. `energyDef` never returns an
  empty body, so `spawnCreep` fails with `ERR_NOT_ENOUGH_ENERGY` when
  `energyAvailable` is below the level-1 cost and the egg retries next tick.
- **The ceiling is the part cap.** `defCost` returns `Infinity` once
  `per * level + MOVEs > 50 - base.length`, which ends the loop regardless of
  energy. `max` caps `level` directly when a job wants a smaller creep.

Worked example, the `guard` case (`base: [MOVE, HEAL]`, `per: [TOUGH,
RANGED_ATTACK]`, `move: 1`, room capacity >= 550):

| level | body | parts | cost |
|---|---|---|---|
| 1 | `T RA M M H` | 5 | 510 |
| 2 | `2T 2RA 3M H` | 8 | 820 |
| n | `nT nRA (n+1)M H` | 4n + 2 | 300 + 260n |
| 12 | `12T 12RA 13M H` | 50 | 3420 |

So a 550-capacity room (RCL 2) always gets the level-1 guard, a full RCL 4 room
(1300) level 3, and RCL 7 and 8 rooms the 50-part cap. `wolf` (`per: [ATTACK]`,
`move: 1`, no base, capacity >= 700) runs 130 energy per level from level 1
(260) to level 25 (3250, 50 parts).

### Job-specific `spawn()`

- **Startup**: `_.sample(Game.spawns)`; body by `room.energyCapacityAvailable`:
  300 -> rotates `[W,W,C,M]` / `[W,C,M,M]` / `[W,C,C,M,M]` by `Game.time % 3`;
  350/400-450/500/550 fixed tables; else `energyDef({move:2, base:[M,C], per:[W,C]})`.
- **Pioneer** (`ms.startup.ts`): `findSpawns(spawns, mission.roomName, {spawn:"remote"})`,
  i.e. the nearest spawns at route distance > 0 from the mission room, never the
  room itself; `Startup.body(ecap, 6)`, so the energyDef branch stops at 6 WORK/CARRY
  pairs (20 parts, 1300 energy).
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
| `wolf` | `Farm`/`Remote` (`Wolf`) | `energyDef({move:1, per:[ATTACK]})` sized from `energyAvailable`, spawn with capacity >= 700 |
| `guard` | `Farm`/`Remote` (`Guard`) | `energyDef({move:1, base:[M,H], per:[TOUGH,RA]})` sized from `energyAvailable`, spawn with capacity >= 550; worked example above |
| `mini` | `Farm`/`Remote` (`Mini`) | fixed `[RA, M, M, H]` (400), first spawn with that much available; does not scale |
| `bootstrap`, `bulldozer`, `cart`, `chemist`, `claimer`, `cap`, `cleaner`, `collector`, `coresrc`, `declaimer`, `defender`, `depositfarmer`, `farmer`, `mason`, `micro`, `minecart`, `miner`, `mineral`, `rambo`, `reserver`, `scout`, `shunt`, `tower` | no | see `src/spawnold.js:271-586` |

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
