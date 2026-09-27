# Traffic: roads as a MetaManager service

Live since 24 Sept 2026 (both worlds). Metas do not own path roads; they
declare **traffic entries** (two points to connect) and every room's manager
plans the roads for all of them together, coalescing. This is the design
record; the reference for day-to-day use is the Traffic section of
[metastruct.md](metastruct.md).

## 1. Goals

1. Traffic is a first-class part of `MetaManager`, not a meta planned by a
   child flag.
2. A meta declares traffic as `src`/`dest` pairs with an optional range to the
   dest. The base metas use the storage (the genesis flag while no storage is
   planned) as `src`.
3. An entry carries `src`, `dest`, `range`, the RCL its roads are built from
   and the RCL its swamp roads are built from.
4. The manager replans the room's traffic after **any** change to its metas:
   an entry's ends moving, but also an extension field moved or rotated, a meta
   added or deleted.
5. Remote and Startup road planning keeps its multi-room search (coalescing
   onto existing roads), but its output is entries only: per room one entry
   from the home-side end of the path to the far side, and in the far room
   entries to the sources and the controller.
6. When the manager plans a room it coalesces all of these (base and mission
   legs) so the roads come out as one network.

## 2. The model

### 2.1 Traffic entries

```ts
// metatraffic.ts
export interface TrafficMem {
    src: number        // xy in the meta's room, or kOrigin
    dest: number       // xy in the meta's room
    range?: number     // Chebyshev range to dest, default 0
    rcl: number        // level the road tiles are built from; kNoRoad = never
    swamp?: number     // level the swamp tiles are built from; default rcl
}
export const kNoRoad = 10;      // above every plan level (0..8, 9 optional)
export const kOrigin = -1;      // src: the room's traffic origin, resolved at plan time
export const kTrafficLevel = 3; // base metas' roads and the rings
export const kRingLevel = 3;
```

Levels are plan levels like any other struct (`0..8`, `9` optional). `kNoRoad`
is a level no room reaches, so taking the minimum over entries that share a
tile just works. A remote's controller leg is `{rcl: kNoRoad, swamp: 0}`.
Every entry searches at the same weights (2.3); the `swampCost` field that
let Startup's entries search swamp-averse was dropped in Sept 2026 with the
weight consolidation and is ignored where it survives in memory.

A meta declares entries by overriding `MetaStructure.traffic(): TrafficMem[]`.
The default returns `mem.traffic` (entries stored at plan time, used by the
mission metas). Base metas build theirs from their own memory with
`src: kOrigin`, and `getTraffic()` resolves it to the current origin, so a
moved storage moves every road; mission legs use `kOrigin` for their home-room
entry too:

| meta | `traffic()` (all `rcl = swamp = kTrafficLevel`) |
|---|---|
| hub | origin -> terminal, range 1 (origin *is* the storage) |
| cap | origin -> xy, range 2 |
| lab | origin -> xy, range 1 |
| extna / extnb / extnc | origin -> xy, range 1 / 2 / 3 |
| asrc / bsrc | origin -> myspot (the container), range 1 |
| min | origin -> xy, range 1 |
| ctrl | origin -> ctrl spot, range 1 |
| wall | origin -> xy, range 0 |
| rroad | `mem.traffic` (the mission legs, 2.5) |
| rsrc, reactor, tripod, shield, nuke | none |

`MetaManager.trafficOrigin()` = the planned storage site, else the genesis
flag (`Game.flags[memory.name]`) when it is in the room, else none (a room
without a base, e.g. a remote, has no base entries). This is the
`storageOrParent` rule resolved at plan time of the traffic instead of plan
time of each meta. An entry from a missing origin is left out; a home room
needs a planned storage (or its genesis flag) for its mission legs' roads.
With no storage planned the flag's tile is kept free of roads, as the storage
will keep it.

### 2.2 The manager's plan

The planned roads live in `Memory.rooms[x].meta.traffic` (a `MetaMem` named
`traffic`, its roads by level under `structs.road`, plus `sig`, `at`, `fail`),
outside `meta.metas`. At runtime it is a `TrafficPlan extends MetaStructure`
held by the manager (`man.traffic`), so existing machinery treats its roads
like any meta's:

- `makeSite`, `purge`, `maxHitsInner` and `getMatrix` walk
  `man.planned()` = metas plus the plan, in the same `metaOrder` (priority 0,
  name `traffic`).
- `getMatrix()` includes the plan's roads (`roadplan.ts`'s `roadMatrix`, and
  so Startup's road and the RemotePlanner's legs, coalesce onto them);
  `getMatrix(['traffic'])` leaves them out.
- `man.metas`, `hasMetas()`, GREY child creation, `canPioneerEarly()` and
  `Meta_nuke` never see the plan: it is not a meta.

### 2.3 Planning a room (`metatraffic.ts`)

`trafficMatrix(roomName, planned, previous)` builds the cost matrix, never
giving a terrain wall a walkable cost (a non-zero cost would make it walkable):

1. `planned` = `man.getMatrix(['traffic'])`: points `0xFE`, planned structures
   `0xFF`, planned roads `kPlannedRoad` (10).
2. With vision (always, see 2.4): every structure that is not a road or a
   rampart we may cross -> `0xFF` (containers included: a road site on one is a
   "blocker" the upkeep would destroy); every construction site except our own
   road and rampart sites -> `0xFF` (a foreign site blocks a road site too);
   sources, minerals, deposits -> `0xFF`.
3. Planned roads go on a cost ladder below plain (12) and swamp (24), so a
   replan breaks ties toward what is planned instead of churning between
   equal routes: a road laid by the plan in progress 8; a road another meta
   plans, or the traffic plan being replaced (`previous`) holds, 10. A road
   that is merely built, in no plan, is its terrain (since Sept 2026; before,
   a built road cost 8 or 9 and a route left to decay could hold a replan to
   itself, which is how W29S5's controller leg kept an avoidable swamp belt).
   A planned tunnel stays walkable at 10. The weights themselves (road 8, plain
   12, swamp 24: 2:3:6, scaled by four so the ladder fits) were settled with
   the `Experiment` service in Sept 2026, see 4.
4. `kNearCost` (48, two swamps) on the free tiles beside every source,
   mineral and the controller (`avoidAround`), in every room: a road crosses
   a harvest or upgrade spot only when the way around costs more.
5. Exit tiles -> `0xFE`: only an entry's own end may use one, so no path walks
   along the border where no road can be built.

`planTraffic(roomName, cm, rings, entries, fromDest)`:

1. Rings: level `kRingLevel` roads on the free (`< 0xFE`, non-wall, non-exit)
   neighbours of every planned storage, terminal and spawn, stamped 8.
2. Entries (srcs resolved) are grouped by `(src, rcl, swamp)` in
   declaration order (metas by priority then name, each meta's entries in
   order). Per group: repeated multi-goal searches from `src` to every open
   entry's `{dest, range}` (`maxRooms 1`, plain 12, swamp 24, heuristic
   weight 8, `maxOps 4000`); the entries whose dest the
   path's end is in range of are done; every step gets the group's level
   (swamp tiles the swamp level, the minimum where tiles are shared) and is
   stamped 7, so later paths coalesce; steps of a `kNoRoad` plain tile are
   stamped 10 (`kShared`) instead. Exit tiles never get a road. A road covers
   both of its ends: PathFinder leaves the origin out of its path, so the
   group's `src` tile is laid with its first path when a road can stand on it
   (a storage or spawn src is blocked, a border src is an exit).
3. A search that reaches no goal (walled-in dest, fully planned-over ring)
   closes the nearest open entry as failed (`fail`, logged, shown by
   `trafficStatus()`), so the loop always ends. Its partial path is laid only
   when it got next to the goal (range + 1: the dest tile itself was blocked),
   never a dead end short of a walled-off one.
4. The order roads are laid in is the order `makeSite` builds them in. In rooms
   we own each path is laid from its src outward (from the storage); in rooms
   we do not own (`fromDest`) from its dest back, so a remote room's first
   sites are beside the containers where the harvesters build them
   (`idleBuild`, range 3).
5. `canRun` is checked before every search; out of CPU the whole plan is
   discarded (nothing is committed) and retried later.

There is no second road tree from the terminal: the hub entry connects storage
and terminal, and the rings wrap both.

### 2.4 When the plan changes

- `trafficSig(entries)` = FNV-1a hash of `[kTrafficVersion, trafficOrigin(),
  entries, metas.map(name, priority, xy, color, structs, points)]`. Entries
  carry the resolved `src`, so moving the storage (or, without one, the genesis
  flag) changes it; `structs` covers a field moved or rotated; the origin is an
  input of its own because the matrix keeps roads off its tile. Bumping
  `kTrafficVersion` replans every room after a push.
- The manager sets an in-memory `trafficDirty` on construction, `setMeta`,
  `deleteMeta`, `save()` and a moved origin (`checkTrafficOrigin`, every
  genesis pass). `run()` (owned rooms, every tick) and `runUnowned()` (visible
  unowned rooms, every 10 ticks) call `updateTraffic()` first: a dirty room is
  hashed once, ahead of the pacing and bucket gates, and a mismatch marks the
  plan `trafficStale`; a stale room replans and commits when the gates allow,
  skipping site placement that tick, and places no road sites while stale (so
  a deleted leg's tiles stop being built the tick after the delete).
- Replans need vision (the matrix reads the room; a site can only be placed
  with vision anyway) and CPU: they start only with the bucket at
  `kTrafficBucket + kTrafficHeadroom` (9000) and `canRun` gates each search at
  8000; one room per tick; not in the manager's first `begin` (10-60) ticks
  after a global reset; 50 ticks of back-off after a plan that ran out of CPU.
- A room whose metas stop declaring traffic has its plan dropped on the next
  tick (`trafficDrops`, flushed by any room's `updateTraffic`) unless traffic
  came back by then: `Remote.planMetas(true)` removes and re-saves its road
  metas in one tick, and the plan (its sites, and the tiles a replan prefers)
  survives that. No vision needed; that is how Remote/Startup removal and the
  Thormine teardown clear their roads. A room whose kOrigin entries cannot
  resolve (no storage, no genesis flag) drops its plan on its next upkeep pass.
- `commitTraffic` replaces `memory.traffic`, clears the maxHits cache, and
  removes our road construction sites on tiles the new plan dropped (unless
  another meta still plans a road there), through `Game.constructionSites`, so
  vision is not needed. Dropped built roads are left to decay, as retired roads
  are.
- BLUE (`forceTraffic`) clears the stored signature (in the live Memory object
  as well as the runtime copy), so the next upkeep pass replans even across a
  global reset.
- Console: `Game.rooms.X.meta.trafficStatus()`, `.replanTraffic()` (now,
  bucket and vision permitting), `.getTraffic()`.

### 2.5 Remote and Startup outputs

Shared helper `pathTraffic(path, far, home, rcl, swamp, farOnly)` in
`metatraffic.ts`: split a multi-room PathFinder path (far end -> home) into its
per-room spans, and make entries that point home-side -> far-side:

- far room (first span): one entry per `far` target, from the span's last tile
  (the border it leaves by) to the target, with the target's own levels;
- rooms in between: border tile where the path enters from home -> border tile
  where it leaves toward the far room, range 0;
- home room (last span, named by `home`): `kOrigin` (the room's storage) ->
  the border tile it enters by, range 0; for an incomplete path the last span
  is treated as an in-between room;
- `farOnly` keeps only the far room (a remote's controller leg).

`RemotePlanner` keeps its container choice and cramped-first order; its
search, matrices and stamping (so legs share border crossings) are a
`RoadPlanner` (`roadplan.ts`, 2.8). Per source leg: `far =
[{dest: container, range 1, rcl 0, swamp 0}]`, `home` = the home room, levels
0. Controller leg: `far = [{dest: controller, range 1, rcl kNoRoad, swamp
0}]`, `farOnly`. Each room's entries become one `Meta_rroad`
(`rroad_<remote>_<leg>`, `mem.traffic`, no structs); `Meta_rsrc` holds the
container as before.

`Startup.planRoad` searches from the controller to the home spawn on a
`RoadPlanner` (`roadplan.ts`, 2.8). Output: `far` = the controller and each
source of the mission room (dest = the container spot of the meta whose
`targetid()` is that source when there is one, else the source; range 1),
all `rcl 0, swamp 0`, and the home room's entry from its storage
(`kOrigin`). The controller stretch is fully paved, unlike a remote's swamp-only
controller leg, because pioneers upgrade this controller from the claim until
the base `ctrl` road arrives at RCL3. A changed path replaces the road metas
in place (`saveRoadMetas`: rooms still on the road get theirs replaced, rooms
it left lose theirs). Its own previous road, in the room's traffic plan,
attracts its replans (cost 1), which keeps border crossings stable rather than
free to move.

Neither mission removes road sites itself: deleting its metas and saving is
enough (2.4). `Remote.removeMetas` still removes container sites.
`Remote.drawMetas` draws each tracked room's plan (once per room per tick),
since the rroad metas hold no tiles.

### 2.6 Genesis flag protocol

- The genesis pass draws the plan every tick, CYAN included, with the
  metas, while the genesis flag has at least one child flag (the `traffic_<genesis>` display-toggle flag was dropped 26 Sept
  2026). YELLOW never plans traffic; GREEN/BROWN save and the plan follows
  automatically on the next upkeep tick.
- BLUE also forces a traffic replan.
- Every pass checks whether the origin moved (the genesis flag moved while no
  storage is planned) and marks the room dirty.
- Previewing the traffic of parked (`newer`) metas is out of scope: commit
  with GREEN and the new plan is drawn a tick later.

## 3. Where the code is

- `src/metatraffic.ts` (imports only `Rewalker` and `shed`, so `metastruct`
  can import it): `TrafficMem`, levels, `kOrigin`, path costs
  (`kPathRoad/Plain/Swamp`, `kPlannedRoad`, `kShared`, `kNearCost`,
  `kLairCost`/`kLairRange`), `costAround`, `avoidAround`, `trafficMatrix`
  (`MetaManager.replanTrafficFresh()` plans with the old plan left out),
  `planTraffic`, `roomSpans`, `pathTraffic`, `hashString`, `describeTraffic`,
  `validTraffic`.
- `src/roadplan.ts` (imports `metastruct`, so it sits above it): the
  room-to-room planner every multi-room road shares. `RoadWeights` /
  `kRoadWeights` (metatraffic's costs), `ownedByOther`, `roadRoute` (the map
  route: rooms other players own impassable, keeper rooms cost 3), `roadMatrix`
  (a room under those weights: meta-planned roads at road cost, built roads
  and containers no plan holds ignored, planned structures and spots blocked,
  other structures blocked, our road and container sites not, `kNearCost` beside sources, minerals and the
  controller, `kLairCost` within 3 of a keeper lair; without vision the
  Rewalker's remembered blocks and roads plus intel's source and controller
  tiles), and `RoadPlanner` (`route`/`allow`, cached `matrix`, `search` with
  heuristic weight = road cost and an optional per-room override, `stamp`).
- `src/ms.experiment.ts`: the `Experiment` purple-flag service that compares
  weight sets on a `RoadPlanner` each (flag `Experiment` -> child
  `dest_Experiment`, drawn yellow/cyan/magenta/red, `status()` counts tiles by
  terrain).
- `src/metastruct.ts`: `MetaStructure.traffic()`/`originTraffic()` and the
  per-meta overrides; `TrafficPlan`; on the manager `traffic`, `planned()`,
  `trafficOrigin`, `declaresTraffic`, `getTraffic`, `trafficSig`,
  `updateTraffic`, `commitTraffic`, `dropTraffic`, `removeRoadSites`,
  `replanTraffic`, `forceTraffic`, `checkTrafficOrigin`, `drawTraffic`,
  `trafficStatus`, the `trafficDrops` queue; hooks in `run()`,
  `runUnowned()`, `setMeta`, `deleteMeta`, `save()`; `runGenesis` (2.6);
  `ManagerMem.traffic`, `MetaMem.traffic`.
- `src/metaremote.ts`: `Meta_rroad.make(man, remote, leg, entries)`,
  `RemotePlanner` on a `RoadPlanner` + `pathTraffic()`.
- `src/ms.startup.ts`: `saveRoadMetas` builds entries via `pathTraffic`.
- `src/ms.remote.ts`: `removeMetas` removes container sites only; `drawMetas`
  draws each tracked room's plan.

## 4. Validation (at the time of the change)

1. `npx tsc --noEmit -p tsconfig.json` clean, and no require cycles in a
   scratch build (the check `gulp compile` runs).
2. Offline, in a session scratchpad (not committed): a read-only snapshot of
   the nine rooms (terrain, objects and `meta` memory through the HTTP API's
   GET endpoints), a JS stand-in for `PathFinder` (A* with the game's cost
   matrix rules), the real compiled `metastruct.js`/`metaremote.js` on a copy
   of the snapshot memory (replan, no replan when nothing changed, replan
   after deleting a leg and after moving an extension field, plan dropped a
   tick later and its sites removed when a room loses its last entry, a remove
   and re-save in one tick keeping the plan untouched, `kOrigin` resolving to
   the storage site, a remote room's roads listed container end first, one
   room per tick, deferral on a low bucket), and unit checks of
   `roomSpans`/`pathTraffic`, `validTraffic`, swamp-only legs, lowest level on
   shared tiles, an unreachable dest, no roads on exit tiles, rings and the
   CPU abort.
3. An independent review of the plan and the code-review skill on the changed
   files, with the findings fixed.
4. Live, after the push: every room replanned within a minute at under 2.5
   CPU each, no failed entries, no sites removed, and the plans matched the
   offline prediction within a tile or two.

## 5. Decisions taken (review these if the roads look wrong)

- **Startup gets the remote shape** (roads to the sources and the controller);
  its controller leg is paved on plain too (a remote's is swamp-only), since
  pioneers upgrade it from the claim until the level-3 base `ctrl` road is
  built.
- **No terminal tree**; rings and the hub's storage -> terminal entry cover the
  hub. Dests east of a hub whose terminal opens east are reached from the
  storage's side.
- **Levels**: 3 for base roads and rings, 0 for mission legs; entries can use
  other levels but none do yet.
- **Replans are deferred to the upkeep** (vision, CPU, one room a tick), not
  run inside `save()`, so a GREEN or a remote plan shows its roads a tick or
  more later.
- **Planned roads attract, real structures block** in every room. Built
  roads no plan holds do not (Sept 2026): they pulled replans back onto
  routes the weights had abandoned, so the metas' roads are the only pull.
- **One weight set for every planner** (Sept 2026): road 8, plain 12, swamp
  24, i.e. 2:3:6, in the in-room planner, the RemotePlanner and Startup's
  road alike; the `swampCost` entry override and Startup's five-times-plain
  swamp cost went with it. Measured with the `Experiment` service on
  W25S7 -> W29S4 and W27S7 -> W29S4: at road:plain 3:4 the plans cut corners
  across country and missed built and planned roads (the W27S7 corner leg
  left the remote road for 6 tiles); at 1:2 they detoured 14-18 tiles to ride
  roads. Swamp under twice plain walked the W29S5 belt the controller road
  had been planned through; three and four times plain chose the same path
  as twice on that leg and stretch others.
- **Aversions instead of near-walls**: the free tiles beside sources,
  minerals and the controller cost two swamps (`kNearCost`), in owned rooms
  too, and keeper lairs five swamps within 3; the old `0xF0` ring only in
  unowned rooms made those tiles a last resort rather than a cost.
- **Mission home-room entries start at `kOrigin`** (the home storage), not at
  a stored tile, so they follow a moved storage; Startup's home entry starts
  at the storage rather than the spawn it searched to.
- **Build order depends on ownership**: from the storage outward in our rooms,
  from the far end back in rooms we do not own.
- **A startup replan keeps to its previous road** (the traffic plan holds it
  and attracts the search), trading "free to move" for stable room crossings.

## 6. Noticed while measuring (not part of this change)

- W26S8 `ClaimedStrat` throws `creep_repair_1.dynMaxHits is not a function`
  (the known `struct.tower.js` overheal branch) on some ticks, which skips
  that tick's upkeep, including site placement. Fixed Sept 2026: the branch
  now calls `room.maxHits`.
- Every upkeep pass in all three owned rooms logs `purging extension` /
  `purging link`: more are planned than the RCL allows, and nothing unplanned
  is found to purge.
- GREY makes bogus child flags for mission metas (`rroad_W26S9_1417_Home` has
  parent `W26S9_1417_Home`), which FlagService deletes the next tick.
