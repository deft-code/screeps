# Metastructures: Base Planning and Upkeep

File: `src/metastruct.ts` (1739 lines, 2019-2020). Driven by `FlagService`
(`src/service.flag.ts`) and run from `ClaimedStrat.run()` -> `room.meta.run()`.
The flags described here are the only flags that exist in the game today.

## Concepts

- **MetaManager** (`room.meta`, or `getMetaManager(roomName)` for a room
  without vision; one instance per room per global, in a module-level map):
  loads `Memory.rooms[name].meta.metas` into `MetaStructure` instances sorted
  by priority desc then name, and exposes `run()`, `runUnowned()`, `getSpot`,
  `getSite(s)`, `getMatrix`, `path`, `spawnEnergy`, `maxHits`, `getLinkMode`.
  Never construct a second manager for a room: each `save()` overwrites the
  room's meta list with that instance's view. `hasMetas(roomName)` answers
  from raw memory without allocating anything.
- **MetaStructure**: one planned cluster. Persistent form is `MetaMem`:

  ```
  { name: "hub", color: COLOR_x (template rotation), priority?: number, xy: anchor,
    points: { hub: xy, shovel: xy },            // named standing spots
    structs: { extension: { 2: [xy...], 3: [xy...], 9: [xy...] }, ... }, // by RCL
    onramps?: xy[],                             // Meta_wall only
    retire?: { [xy]: rcl } }                    // tile retired from this RCL on (see Retiring structures)
  ```

  Level `9` (`kAllLvls`) means *optional*: offered at every RCL but only by
  `makeSite`'s second pass, after all required sites, and purged when
  `ERR_RCL_NOT_ENOUGH`.
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
| `extna` / `extnb` / `extnc` | 0 | Optional (level 9) extension fields, 3x3 / 5x5 / 7x7 checkerboards with roads at RCL5. Tiles are stored nearest the `hub` spot first (`Meta_extn.orderByHub`; storage site, then the anchor, without a hub), which is the build order; `migrate()` re-sorts fields planned earlier. |
| `asrc` / `bsrc` | 103 | Source cluster: container on the path step nearest storage (the parent flag stands in for storage while no storage meta is saved), road, link(5) at the adjacent tile nearest storage, extensions(2) on the other free neighbours (RCL2 so they outrank `cap`'s RCL2 field by priority; `migrate()` moves older RCL3 entries). `myspot` = container tile; `targetid()` = the source. Link mode `src`. The child flag's secondary colour overrides the container tile: RED takes the second-best neighbour, PURPLE the third-best (ranked by weighted path cost to storage, `Meta_asrc.pickSpot`); any other colour keeps the best. |
| `min` | 0 | Flag beside an ordinary (non-thorium) mineral: extractor(6) on the mineral, container(6) on the flag tile, point `mineral` there. Needs vision to plan; refuses a flag sitting on the mineral. |
| `reactor` | 10 | Season 11: extractor(6) over the thorium mineral on or beside the flag, nothing else (warboys carry thorium straight to the sector core). Outranks `min` because `CONTROLLER_STRUCTURES.extractor` is 1 at every RCL and `makeSite` spends it in priority order. |
| `ctrl` | 0 | Path from flag to storage (parent flag without a storage meta). Flag on the controller: point `ctrl` at step 2, link(6) at step 3. Flag anywhere else: point `ctrl` on the flag tile itself, link(6) at step 1 (warns if the tile is beyond upgrade range 3). Container(2) on the `ctrl` point, retired at the link's level (6; the two RCL5 links belong to asrc/bsrc) and left to decay (`Meta_ctrl.addContainer`; `migrate()` adds it to metas planned before Sept 2026). Link mode `sink`. |
| `tripod` | 0 | Three towers around a point (`parkedLayout`); deployed layout with link and roads exists but is not used. |
| `shield` | 0 | Rampart shell sealing a gap: the flag's row out to terrain wall each way is the gap. Every gap tile is a range-2 goal in one PathFinder search from the parent (genesis) flag, restricted to the room, on a terrain-only matrix; a path ends on entering that band so it never crosses the gap. The tile reached gets a rampart (level 3) and is blocked, repeated until no complete path remains (at most 80 ramparts, CPU-gated). Needs the parent flag in the room. Ramparts repair at the RCL table. |
| `traffic` | 0 | Roads: ring around storage/terminal/spawns, then repeated `PathFinder` runs from storage and terminal to every other meta's `dests()` until CPU says stop. Rings whatever storage/terminal/spawns are saved at plan time and needs at least one saved `dests()`; without a storage meta it runs from the parent flag. Only saved metas count. `mem.sig` (`Meta_traffic.signature`) records those inputs (storage/terminal/spawn sites plus every `dests()`), and `check()` fails when it no longer matches, so saving, moving or deleting any other meta makes the genesis pass re-plan traffic into `newer` by itself: a GREEN that saves other metas stays GREEN one more round and saves the new roads too; after a BROWN delete the new plan is drawn and waits for a GREEN. No meta is required, so a room capped below RCL7 can leave out `lab`. Sites already placed for roads the new plan dropped are not removed. `migrate()` stamps the current signature on metas saved before it existed. |
| `wall` | 0 | Rampart/wall line through the flag, east and west along its row, or north and south along its column when the flag's primary colour is RED; each way runs to terrain wall or the room edge. The flag tile, tiles beside terrain wall and every other tile are ramparts, the rest constructed walls. A parallel road both ways through the first step of the flag-to-storage path more than 2 tiles out, and on-ramps (road + rampart, `mem.onramps`, repaired at `rcl-3`) from each rampart to it. Needs the saved storage site; with the storage within 2 tiles of the flag only the line is planned (no road, no on-ramps). |
| `nuke` | 200 | Auto-created by `checkNukes(room)` (never called): ramparts over blast tiles with hits scaled by expected damage. |

## Flag protocol (`runGenesis`, driven by `FlagService`)

`FlagService` (a `@daemon` in the `low` row) iterates `Game.flags` every tick:
`COLOR_ORANGE` primary -> `runGenesis(flag)`; `COLOR_GREY` primary with no parent
-> `flag.remove()`; `COLOR_PURPLE` primary -> the flag's name, with `_` read as a
space, is a service command (`Swipe_W4N3_W3N4`): `Service.spawn` it if not live
and remember it, and `kill()` any remembered command whose purple flag is gone.
Missions are refused: one that spawns is killed at once (its empty
`Memory.missions` entry removed) and counts as a failure. A failure, or a name that
spawns nothing, turns the flag white with purple secondary; recolour it purple to
retry. The processes
are transient and the set is in-memory, so both rebuild from the flags after a
global reset; a purple flag naming an already-live scheduled service is left alone.

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
secondary to YELLOW to plan and inspect the visuals; set GREEN to commit.
`asrc`/`bsrc`, `ctrl` and `traffic` path to the saved storage site; with no
storage meta saved they path to their parent (genesis) flag instead
(`storageOrParent`), so put the genesis flag where the storage will be or
re-plan them with BLUE once the hub is saved (an unsaved hub in `newer` does
not count). `wall` still needs the saved storage site.

## Mission-planned metas (`src/metaremote.ts`)

The Remote mission ([missions-and-jobs.md](missions-and-jobs.md)) plans metas
without flags through `RemotePlanner(home, remote)`:

| role | what it holds |
|---|---|
| `rsrc` (`rsrc_<source xy>`, priority 1) | container (level 0) on the container tile, point `rsrc` on it, `targetid()` = the source. The tile is chosen the `Meta_asrc` way: the source's neighbours are weighted by openness and the first step of a path to the home storage wins. Sources are planned most-cramped first and a tile touching two sources is never a candidate. |
| `rroad` (`rroad_<remote>_<leg>`, priority 0) | the road tiles of one leg inside one room, level 0. A leg is one multi-room `PathFinder` search to the home storage at range 1. Source legs are paved on every tile through every room they cross (one `rroad` per room); the controller leg is paved only on swamp and only inside the remote room, so it just joins the source corridors. |

Both classes have `static plan = noPlan`, so genesis flags cannot re-plan them
(a BROWN genesis pass can still delete them). The planner paths with the
metastruct costs (road 7, plain 11, swamp 12), restricts rooms to the
`Game.map.findRoute` set plus both ends, marks every existing structure that
is not a road or rampart `0xFF` in every room (so the upkeep never finds a
"blocker" to destroy), stamps a ring of `0xF0` around the remote's sources and
controller, blocks each chosen container tile for later legs, and stamps
earlier legs (roads 7, plains 10) so legs share corridors. Rooms without vision
use Rewalker's remembered matrix. Exit tiles never get roads. All structures
are level 0 because an unowned room's `roomLevel` is 0.

`MetaStructure.draw(v)` works for rooms without vision (it then draws every
planned structure instead of hiding built ones).

## Upkeep (`MetaManager.run()`, every tick for owned rooms; `runUnowned()` every 10 ticks from `ActiveStrat`)

`runUnowned()` keeps the two-site gate and only calls `makeSite` for
containers and roads. In a room we do not own (`roomLevel` 0) `makeSite`
never purges on `ERR_RCL_NOT_ENOUGH`.

Every `kRetirePace` (10) ticks, first clears one retired tile (below). Skips when more than 2 of the room's construction sites exist. Then in order:
tower or spawn if the room has none; extensions while
`energyCapacityAvailable < 600`; then
`terminal, tower, spawn, extension, storage, wall, link, container, extractor
(planned by `min`/`reactor`; there is no mineral scan outside the metas), lab, observer, nuker, power spawn, factory, rampart,
road`. `makeSite` walks metas in priority order, tries required levels
`0..RCL`, then optional level 9. A tile blocked by a wrong structure or a
foreign site is `removeDestroy`ed (storage/terminal/factory are protected while
a replacement site exists). `ERR_RCL_NOT_ENOUGH` triggers `purge` of structures
no meta claims at this RCL.

## Retiring structures

`MetaMem.retire` maps a tile to the RCL from which whatever the meta plans
there is retired. `addMemRetire(mem, xy, rcl)` sets it at plan time. From that
RCL on: `findXys` skips the tile so no site is created, `has` denies it so
`purge` may remove it, `calcStructHits` answers Unknown so nobody repairs it,
`draw` hides it, and `MetaManager.retire()` (top of `run()`, one tile per
pass every 10 ticks) `removeDestroy`s a planned-type site, or a planned-type
structure that would not decay on its own, then clears the maxHits cache.
Roads, containers and ramparts (`kDecays`) are left to decay unrepaired
instead of being destroyed; `purge` keeps its older rules.
`MetaStructure.migrate()` is a per-class hook run when the manager loads (before
its `save()`) for one-shot memory upgrades. First user: the `Meta_ctrl`
container, previously built ad hoc by `role.ctrl.js` `structAtSpot` with no
repair and no removal.

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
