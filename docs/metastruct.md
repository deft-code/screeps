# Metastructures: Base Planning and Upkeep

File: `src/metastruct.ts` (1739 lines, 2019-2020). Driven by `FlagService`
(`src/service.flag.ts`) and run from `ClaimedStrat.run()` -> `room.meta.run()`.
The flags described here are the only flags that exist in the game today.

## Concepts

- **MetaManager** (`room.meta`, cached per room in `room.cache.meta`): loads
  `Memory.rooms[name].meta.metas` into `MetaStructure` instances sorted by
  priority desc then name, and exposes `run()`, `getSpot`, `getSite(s)`,
  `getMatrix`, `path`, `spawnEnergy`, `maxHits`, `getLinkMode`.
- **MetaStructure**: one planned cluster. Persistent form is `MetaMem`:

  ```
  { name: "hub", color: COLOR_x (template rotation), priority?: number, xy: anchor,
    points: { hub: xy, shovel: xy },            // named standing spots
    structs: { extension: { 2: [xy...], 3: [xy...], 9: [xy...] }, ... }, // by RCL
    onramps?: xy[] }                            // Meta_wall only
  ```

  Level `9` means *optional*: built only after all required sites and purged
  when `ERR_RCL_NOT_ENOUGH`.
- **Templates**: ASCII layouts with a legend `{ char: [rcl, STRUCTURE_x] }`,
  digits for named points, `.` for empty. `rotate()` flips/rotates by the child
  flag's secondary colour (RED, ORANGE, BLUE, YELLOW, PURPLE; anything else = as
  drawn).

## Registered metas (`@registerMeta`, class name `Meta_<role>`)

| role | priority | what it plans |
|---|---|---|
| `hub` | 102 | 4x4 core: spawn(1), towers(3/5/7), roads, storage(4), link(5), terminal(6), factory(7), power spawn(8); points `hub`, `shovel`; ramparts on everything important. Link mode `hub`. |
| `cap` | 101 | 5x5 extension cluster with a centre container (RCL2-4). Link mode `sink`. |
| `lab` | 0 | 10 labs (RCL6-8), 2 spawns, observer, nuker. Its spawn energies are filled last. |
| `extna` / `extnb` / `extnc` | 0 | Optional (level 9) extension fields, 3x3 / 5x5 / 7x7 checkerboards with roads at RCL5. |
| `asrc` / `bsrc` | 103 | Source cluster: container on the path step nearest storage, road, link(5) at the adjacent tile nearest storage, extensions(3) on the other free neighbours. `myspot` = container tile; `targetid()` = the source. Link mode `src`. |
| `min` | 0 | Container on the flag tile (RCL6), point `mineral`. |
| `ctrl` | 0 | Path from flag to storage; point `ctrl` at step 2, link(5) at step 3. Link mode `sink`. |
| `tripod` | 0 | Three towers around a point (`parkedLayout`); deployed layout with link and roads exists but is not used. |
| `traffic` | 0 | Roads: ring around storage/terminal/spawns, then repeated `PathFinder` runs from storage and terminal to every other meta's `dests()` until CPU says stop. Needs storage, terminal, and 3 spawns planned first. |
| `wall` | 0 | Horizontal rampart/wall line east of the flag (rampart every other tile or beside terrain walls), a parallel road, and on-ramps from each rampart to the road. |
| `nuke` | 200 | Auto-created by `checkNukes(room)` (never called): ramparts over blast tiles with hits scaled by expected damage. |

## Flag protocol (`runGenesis`, driven by `FlagService`)

`FlagService` (a `@daemon` in the `low` row) iterates `Game.flags` every tick:
`COLOR_ORANGE` primary -> `runGenesis(flag)`; `COLOR_GREY` primary with no parent
-> `flag.remove()`.

A **genesis flag** is any flag with primary `COLOR_ORANGE`. Its secondary colour
is a command; after acting it usually resets itself to `COLOR_CYAN` (idle):

| secondary | action |
|---|---|
| GREY | Create a `COLOR_GREY` child flag for every meta already in memory (so you can see/move them). |
| WHITE | Remove all child flags. |
| BROWN | Delete metas whose child flag is also BROWN, then save. |
| YELLOW | Plan (`Meta_<role>.plan`) for children that have no meta yet; draw the result. |
| GREEN | Save all newly planned/changed metas into room memory (`setMeta` + `save`). |
| BLUE | Force re-planning of every child even if its meta still matches. |
| CYAN | Idle. |

**Child flags** are named `<self>_<parentName>` (`FlagExtra.childName`), e.g.
`asrc_genesis`, `hub_genesis`, `extna1_genesis`. `self` is the part before `_`
and its first word (lowercased) selects `Meta_<role>`; a trailing digit makes
several of the same kind unique (`extna1`, `extna2`). The child's **secondary
colour is the template rotation** and is stored in `mem.color`;
`meta.check(flag)` fails (forcing a re-plan) if the flag moved or changed colour.
Planned-but-unsaved metas are parked in the genesis flag's `memory.newer[self]`.

Manual workflow: place `genesis` (orange/cyan) in the room; add child flags
(`hub_genesis`, `cap_genesis`, `asrc_genesis` on source A, `bsrc_genesis` on
source B, `ctrl_genesis` near the controller, `lab_genesis`, `extn*_genesis`,
`traffic_genesis`, `wall_genesis`, `min_genesis` on the mineral); set genesis
secondary to YELLOW to plan and inspect the visuals; set GREEN to commit. `hub`
must be saved before `asrc`, `ctrl`, `traffic`, and `wall` can plan (they path
to the storage site).

## Upkeep (`MetaManager.run()`, every tick for owned rooms)

Skips when more than 2 of the room's construction sites exist. Then in order:
tower or spawn if the room has none; extensions while
`energyCapacityAvailable < 600`; then
`terminal, tower, spawn, extension, storage, wall, link, container, extractor
(RCL6+ on the mineral), lab, observer, nuker, power spawn, factory, rampart,
road`. `makeSite` walks metas in priority order, tries required levels
`0..RCL`, then optional level 9. A tile blocked by a wrong structure or a
foreign site is `removeDestroy`ed (storage/terminal/factory are protected while
a replacement site exists). `ERR_RCL_NOT_ENOUGH` triggers `purge` of structures
no meta claims at this RCL.

## Services metas provide to the rest of the bot

- `maxHits(stype, xy, rcl)` -> repair ceilings used by `room.maxHits(struct)`,
  `creep.repair.ts`, and towers. Results are cached in room memory
  (`keep/drop/roadkeep/roaddrop` arrays, `rampart`/`constructedWall` maps) and
  wiped on every `save()`. Ramparts/walls scale with RCL via `calcRclHits`
  (Skip, 100, 1000, 5k, 1M, 5M, 10M, 20M); `Meta_wall` on-ramps use `rcl-3`.
- `spawnEnergy()` -> extension fill order for `spawnCreep` (see
  [spawning.md](spawning.md)).
- `getSpot(name)` -> standing tiles for `hub`, `shovel`, `ctrl`, `asrc`, `bsrc`,
  `mineral`, `tripod`.
- `getLinkMode(xy)` -> initial `Mode` for links (`struct.link.ts`).
- `getMeta('asrc').targetid()` -> the source a srcer mines.
- `getDests()` -> goals used by `Meta_traffic`.

## Path costs used while planning

`kPathRoad = 7`, `kPathPlain = 11`, `kPathSwamp = 12` with `heuristicWeight`
7; existing metas fill the matrix with `0xFF` (roads `10`, ramparts ignored) so
new plans avoid them. `calcWeight` (asrc) prefers tiles with fewer wall
neighbours.
