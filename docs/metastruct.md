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
  It also owns the room's **traffic** (roads; see Traffic below).
  Never construct a second manager for a room: each `save()` overwrites the
  room's meta list with that instance's view. `hasMetas(roomName)` answers
  from raw memory without allocating anything.
- **MetaStructure**: one planned cluster. Persistent form is `MetaMem`:

  ```
  { name: "hub", color: COLOR_x (template rotation), priority?: number, xy: anchor,
    points: { hub: xy, shovel: xy },            // named standing spots
    structs: { extension: { 2: [xy...], 3: [xy...], 9: [xy...] }, ... }, // by RCL
    onramps?: xy[],                             // Meta_wall only
    retire?: { [xy]: rcl },                     // tile retired from this RCL on (see Retiring structures)
    traffic?: TrafficMem[] }                    // stored traffic entries (Meta_rroad); see Traffic
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
| `asrc` / `bsrc` | 103 | Source cluster: container(2, but held back below RCL3 until a spawn stands in the room; `migrate()` moves older RCL3 entries) on the path step nearest storage (the parent flag stands in for storage while no storage meta is saved), road, link(5) at the adjacent tile nearest storage, extensions(2) on the other free neighbours (RCL2 so they outrank `cap`'s RCL2 field by priority; `migrate()` moves older RCL3 entries). `myspot` = container tile; `targetid()` = the source. Link mode `src`. The child flag's secondary colour overrides the container tile: RED takes the second-best neighbour, PURPLE the third-best (ranked by weighted path cost to storage, `Meta_asrc.pickSpot`); any other colour keeps the best. |
| `min` | 0 | Flag beside an ordinary (non-thorium) mineral: extractor(6) on the mineral, container(6) on the flag tile, point `mineral` there. Needs vision to plan; refuses a flag sitting on the mineral. |
| `reactor` | 10 | Season 11: extractor(6) over the thorium mineral on or beside the flag, nothing else (warboys carry thorium straight to the sector core). Outranks `min` because `CONTROLLER_STRUCTURES.extractor` is 1 at every RCL and `makeSite` spends it in priority order. |
| `ctrl` | 0 | Path from flag to storage (parent flag without a storage meta). Flag on the controller: point `ctrl` at step 2, link(6) at step 3. Flag anywhere else: point `ctrl` on the flag tile itself, link(6) at step 1 (warns if the tile is beyond upgrade range 3). Container(2) on the `ctrl` point, retired at the link's level (6; the two RCL5 links belong to asrc/bsrc) and left to decay (`Meta_ctrl.addContainer`; `migrate()` adds it to metas planned before Sept 2026). Link mode `sink`. |
| `tripod` | 0 | Three towers around a point (`parkedLayout`); deployed layout with link and roads exists but is not used. |
| `shield` | 0 | Rampart shell sealing a gap: the flag's row out to terrain wall each way is the gap. Every gap tile is a range-2 goal in one PathFinder search from the parent (genesis) flag, restricted to the room, on a terrain-only matrix; a path ends on entering that band so it never crosses the gap. The tile reached gets a rampart (level 3) and is blocked, repeated until no complete path remains (at most 80 ramparts, CPU-gated). Needs the parent flag in the room. Ramparts repair at the RCL table. |
| `wall` | 0 | Rampart/wall line through the flag, east and west along its row, or north and south along its column when the flag's primary colour is RED; each way runs to terrain wall or the room edge. The flag tile, tiles beside terrain wall and every other tile are ramparts, the rest constructed walls. A parallel road both ways through the first step of the flag-to-storage path more than 2 tiles out, and on-ramps (road + rampart, `mem.onramps`, repaired at `rcl-3`) from each rampart to it. Needs the saved storage site; with the storage within 2 tiles of the flag only the line is planned (no road, no on-ramps). |
| `nuke` | 200 | Auto-created by `checkNukes(room)` (never called): ramparts over blast tiles with hits scaled by expected damage. |

`traffic` is no longer a meta role (Sept 2026): the manager plans the roads
(next section). A `traffic` meta saved by older code is moved into the manager
when it loads.

## Traffic (`MetaManager` + `src/metatraffic.ts`)

Design and migration notes: [traffic-design.md](traffic-design.md).

A meta declares the roads it wants as **traffic entries** by overriding
`traffic(): TrafficMem[]` (default: `mem.traffic`, entries stored at plan
time, used by the mission metas):

```
{ src: xy | kOrigin, dest: xy, range?: n (default 0), rcl: level, swamp?: level (default rcl), swampCost?: n }
```

Both tiles are in the meta's room. Plain tiles of the road are built from plan
level `rcl`, swamp tiles from `swamp`; `kNoRoad` (10, above every level) means
never, so `{rcl: kNoRoad, swamp: 0}` is a road built on swamp only. Where
entries share a tile the lowest level wins. `src: kOrigin` (-1) starts at the
room's traffic origin, resolved when the traffic is planned. `swampCost` is what
an unroaded swamp tile costs that entry's search (default 12; Startup uses
`kSwampAverse`, 55, five times plain, as its own search does).

| meta | entry (`rcl = swamp = 3`, `kTrafficLevel`) |
|---|---|
| hub | origin -> terminal, range 1 |
| cap / lab | origin -> anchor, range 2 / 1 |
| extna / extnb / extnc | origin -> anchor, range 1 / 2 / 3 |
| asrc / bsrc / ctrl | origin -> the meta's spot (container / ctrl spot), range 1 |
| min | origin -> anchor (container), range 1 |
| wall | origin -> the flag's rampart, range 0 |
| rroad (missions) | stored entries, levels 0 (see Mission-planned metas) |

All base entries start at `kOrigin`. The **origin** (`trafficOrigin()`) is the
planned storage site, else the genesis flag (`memory.name`) while it is in the
room: the rule `storageOrParent` applies at plan time, applied at traffic time,
so a moved storage moves every road (a mission leg's home-room entry too).
Entries whose origin is missing are left out; with only the flag, its tile is
kept free of roads for the storage.

The **plan** is `Memory.rooms[x].meta.traffic`, a `MetaMem` named `traffic`
holding only roads by level plus `sig` (input hash), `at` (tick planned) and
`fail`. It is not in `meta.metas`: at runtime it is a `TrafficPlan` held by the
manager (`man.traffic`), and `makeSite`, `purge`, `maxHitsInner` and
`getMatrix` walk `man.planned()` (metas plus the plan, in `metaOrder`; the plan
sorts at priority 0 under the name `traffic`, where the old meta sorted).
`getMatrix()` includes the plan's roads; the planner itself uses
`getMatrix(['traffic'])`.

**Planning** (`trafficMatrix` + `planTraffic`):

1. The matrix: the metas' own (standing spots `0xFE`, structures `0xFF`,
   roads 10), then with vision every structure a road cannot share a tile with
   (containers too) and every source, mineral and deposit `0xFF`, and every
   site but our own road and rampart sites `0xFF`. Roads go on a ladder below
   plain: a built road some plan holds (another meta's, or the traffic plan
   being replaced) 7, a built road no plan holds 8, a planned road not yet
   built 10; plain 11, swamp 12. Rooms we do not own get `0xF0` beside every
   source and the controller. Exit tiles cost `0xFE` (only an entry's own end
   uses one). Terrain walls never get a walkable cost, except built tunnels.
2. Rings: level 3 roads on the free neighbours of every planned storage,
   terminal and spawn.
3. Entries grouped by `(src, rcl, swamp, swampCost)` in order (metas by
   priority then name). Per group, as the old `Meta_traffic` did: multi-goal
   searches from `src` to every open entry's dest (single room, heuristic
   weight 7), closing the entries the path ends in range of; each path is laid
   at the group's levels and stamped 7, so later paths coalesce onto it. The
   `src` tile is laid with the first path when a road can stand there (a
   storage or spawn src is blocked, a border src is an exit). A search that
   reaches no goal closes the nearest open entry as failed (`fail`); its partial
   path is laid only if it ends within range + 1 of the dest.
4. Lay order is build order: in our rooms each path from its src outward, in
   rooms we do not own from its dest back (a remote's first sites sit by the
   containers, where the harvesters build them).
5. Out of CPU (`canRun`, bucket 8000) the whole plan is discarded and retried
   50 ticks later; a plan starts only with the bucket at 9000.

**When** (`updateTraffic()`, first thing in `run()` and `runUnowned()`):
`setMeta`, `deleteMeta` and `save()` mark the traffic dirty; the next upkeep
pass with vision compares `trafficSig` (hash of the resolved entries and of
every meta's name, priority, anchor, colour, structs and points) with the
plan's and replans if they differ, so any saved change (a field moved or
rotated, a meta added or deleted, the storage moved) replans. One room per tick,
not in a manager's first 10-60 ticks after a global reset, and that pass places
no site. A room whose metas stop declaring traffic has its plan dropped a tick
later unless traffic is back by then (Startup and Remote remove and re-save
their road metas in one tick). Committing or dropping a plan removes our road
sites on the tiles it no longer holds (unless another meta plans a road there),
through `Game.constructionSites`, so without vision too; dropped built roads
decay, as retired ones do. BLUE clears the plan's stored signature. Bump
`kTrafficVersion` to replan every room after changing the planner.

Console: `Game.rooms.X.meta.trafficStatus()`, `.replanTraffic()` (now, bucket
and vision permitting), `.getTraffic()`, `Memory.rooms.X.meta.traffic`.

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

Every `runGenesis` pass first stamps the flag's name into the room's meta
memory (`Memory.rooms[x].meta.name`). `makeSite` names spawn sites from it:
`<name>`, then `<name>er`, then `<name>est` (a genesis `Port` gives `Port`,
`Porter`, `Portest`); a name already used by any of our spawns or spawn sites
is skipped, and with all three taken the game picks its own name
(`MetaManager.spawnNames` / `createSite`). Rooms whose genesis flag has not
run since this was added have no name and get game-picked spawn names.

A **genesis flag** is any flag with primary `COLOR_ORANGE`. Its secondary colour
is a command; after acting it usually resets itself to `COLOR_CYAN` (idle):

| secondary | action |
|---|---|
| GREY | Create a `COLOR_GREY` child flag for every meta already in memory (so you can see/move them). |
| WHITE | Remove all child flags. |
| BROWN | Delete metas whose child flag is also BROWN, then save. |
| YELLOW | Plan (`Meta_<role>.plan`) for children that have no meta yet; draw the result. |
| GREEN | Save all newly planned/changed metas into room memory (`setMeta` + `save`). |
| BLUE | Force re-planning of every child even if its meta still matches, and of the traffic. |
| CYAN | Idle. |

Traffic is not a child: GREEN and BROWN save, and the manager replans the
roads on its next upkeep pass. A `traffic_<genesis>` child flag is only a
display toggle (the plan is drawn every tick while it exists, and on every
non-CYAN pass anyway); BROWN on a BROWN traffic child just removes the flag.
Every pass also checks the traffic origin, so moving the genesis flag while
no storage is planned replans the roads.

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
`wall_genesis`, `min_genesis` on the mineral, and `traffic_genesis` anywhere
to keep the roads drawn); set genesis secondary to YELLOW to plan and inspect
the visuals; set GREEN to commit, and the roads follow a tick or so later.
`asrc`/`bsrc` and `ctrl` path to the saved storage site; with no storage meta
saved they path to their parent (genesis) flag instead (`storageOrParent`),
so put the genesis flag where the storage will be or re-plan them with BLUE
once the hub is saved (an unsaved hub in `newer` does not count). The traffic
follows the saved storage by itself. `wall` still needs the saved storage site.

## Mission-planned metas (`src/metaremote.ts`)

The Remote mission ([missions-and-jobs.md](missions-and-jobs.md)) plans metas
without flags through `RemotePlanner(home, remote)`:

| role | what it holds |
|---|---|
| `rsrc` (`rsrc_<source xy>`, priority 1) | container (level 0) on the container tile, point `rsrc` on it, `targetid()` = the source. The tile is chosen the `Meta_asrc` way: the source's neighbours are weighted by openness and the first step of a path to the home storage wins. Sources are planned most-cramped first and a tile touching two sources is never a candidate. |
| `rroad` (`rroad_<remote>_<leg>`, priority 0) | the traffic entries of one leg inside one room (`mem.traffic`, no structs); each room's manager plans the roads with its other traffic. A leg is one multi-room `PathFinder` search to the home storage at range 1, cut into its stay in each room (`pathTraffic`): in the home room its storage (`kOrigin`, so the leg follows a moved storage) -> the border tile it enters by, in rooms between border -> border, in the remote room the border it leaves by -> beside the container (range 1), all level 0. The controller leg keeps only its remote-room entry, border -> controller (range 1) with `rcl kNoRoad, swamp 0`: roads on swamp only. Legs planned before Sept 2026 held their road tiles; `migrate()` turns them into one entry between the leg's two ends and adopts the tiles into the room's plan until it replans. |

Both classes have `static plan = noPlan`, so genesis flags cannot re-plan them
(a BROWN genesis pass can still delete them). The planner paths with the
metastruct costs (road 7, plain 11, swamp 12), restricts rooms to the
`Game.map.findRoute` set plus both ends, marks every existing structure that
is not a road or rampart `0xFF` in every room (so the upkeep never finds a
"blocker" to destroy), stamps a ring of `0xF0` around the remote's sources and
controller, blocks each chosen container tile for later legs, and stamps
earlier legs (roads 7, plains 10) so legs share corridors and room crossings.
Rooms without vision use Rewalker's remembered matrix. Everything is level 0
because an unowned room's `roomLevel` is 0. The `Startup` mission makes
`rroad_<room>_startup` legs the same way (see missions-and-jobs.md).

`MetaStructure.draw(v)` works for rooms without vision (it then draws every
planned structure instead of hiding built ones).

## Upkeep (`MetaManager.run()`, every tick for owned rooms; `runUnowned()` every 10 ticks from `ActiveStrat`)

`runUnowned()` keeps the two-site gate and only calls `makeSite` for
containers and roads. In a room we do not own (`roomLevel` 0) `makeSite`
never purges on `ERR_RCL_NOT_ENOUGH`. Both start with `updateTraffic()`
(see Traffic); a pass that replans the traffic places no site.

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
- `getTraffic()` -> every declared traffic entry; `trafficStatus()`,
  `replanTraffic()`, `drawTraffic(v)` for the plan.

## Path costs used while planning

`kPathRoad = 7`, `kPathPlain = 11`, `kPathSwamp = 12` (defined in
`metatraffic.ts`) with `heuristicWeight` 7; existing metas
fill the matrix with `0xFF` (roads `10`, ramparts ignored) so new plans avoid
them. `calcWeight` (asrc) prefers tiles with fewer wall neighbours. The
traffic planner's own matrix is described under Traffic.
