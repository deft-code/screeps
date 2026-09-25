# Traffic redesign: roads as a MetaManager service

Status: implemented locally, 24 Sept 2026; not pushed. Replaces `Meta_traffic` (flag-planned road meta) and
the road tiles stored in `Meta_rroad` (Remote and Startup missions) with one
road planner owned by `MetaManager`. Metas stop owning path roads; they declare
**traffic entries** (two points to connect) and every room's manager plans the
roads for all of them together, coalescing.

## 1. Goals (from the request)

1. Traffic is a first-class part of `MetaManager`, not a meta planned by a
   `traffic_<genesis>` child flag.
2. A meta declares traffic as `src`/`dest` pairs with an optional range to the
   dest. The base metas that `Meta_traffic` served today use the storage (the
   genesis flag while no storage is planned) as `src`.
3. An entry carries `src`, `dest`, `range`, the RCL its roads are built from
   and the RCL its swamp roads are built from.
4. The manager replans the room's traffic after **any** change to its metas:
   an entry's ends moving, but also an extension field moved or rotated, a meta
   added or deleted.
5. Remote and Startup road planning keeps its multi-room search (coalescing
   onto existing roads), but its output becomes entries only: per room one
   entry from the home-side end of the path to the far side, and in the far
   room entries to the sources, plus a controller entry whose roads are built
   on swamp only.
6. When the manager plans a room it coalesces all of these (base and mission
   legs) the way `Meta_traffic` coalesced its paths, so the roads come out
   similar to today's, if not identical.

## 2. What runs today (measured live, tick ~729400)

| room | role | traffic meta | rroad legs (tiles) | built roads |
|---|---|---|---|---|
| W26S8 `Home` | owned RCL6 | 216 tiles, **80 unique** (all level 3) | 4 remote legs, 39 tiles each, identical | 124 |
| W25S7 `Port` | owned RCL6 | 347 tiles, **87 unique** | 3 remote legs + startup leg | 146 |
| W27S5 `Forth` | owned RCL2 | 143 tiles, 57 unique (47 unbuilt: level 3 > RCL2) | startup leg (38) | 50 |
| W26S9 | remote + pass-through | - | 2 source legs, ctrl leg (swamp only, 6), 2 pass-through | 32 |
| W27S9, W26S7, W25S8 | remotes (W26S7 also on the startup road) | - | source legs | 49 / 71 / 21 |
| W27S6, W27S7 | startup road only | - | 48 / 8 | 26 / 14 |

Every planned road in the established rooms is built; only W27S5 and the
startup road rooms have work left. `Meta_traffic` stores each path in full
without de-duplication, hence ~3x repeated tiles. Stored `rroad` tiles are in
path order from the far end to home with no gaps (the swamp-only `_ctrl` leg
has gaps by design); the migration relies on that ordering.

Current mechanics that the redesign must keep or replace:

- `Meta_traffic.plan` (`metastruct.ts`): rings of level-3 roads on the free
  neighbours of every planned storage, terminal and spawn; then nearest-first
  multi-goal `PathFinder` searches from storage to every meta's `dests()`, each
  found path stamped as road (cost 7) so later paths coalesce; then the same
  again from the terminal. `mem.sig` holds the inputs; `check()` fails on
  change and the genesis flag replans into `newer`, saved on the next GREEN.
- `RemotePlanner` (`metaremote.ts`): per source one multi-room search source ->
  home storage on per-room matrices (real structures `0xFF`, roads 7, the
  home's planned metas, `0xF0` ring around the remote's sources and controller,
  Rewalker memory without vision). `path[0]` is the container (`Meta_rsrc`),
  the rest becomes one `Meta_rroad` per room; each leg is stamped into the
  matrices so later legs share it. A controller leg is kept only inside the
  remote room and only on swamp.
- `Startup.planRoad` (`ms.startup.ts`): one search controller -> home spawn
  with Rewalker costs plus `metaCosts` (planned metas block, planned roads cost
  1); every tile becomes road in one `Meta_rroad` per room.
- Upkeep: `makeSite(STRUCTURE_ROAD)` walks metas in priority order;
  `maxHits` answers Full for any tile a meta plans a road on, so a road nobody
  plans decays.

## 3. The new model

### 3.1 Traffic entries

```ts
// metatraffic.ts
export interface TrafficMem {
    src: number        // xy in the meta's room, or kOrigin
    dest: number       // xy in the meta's room
    range?: number     // Chebyshev range to dest, default 0
    rcl: number        // level the road tiles are built from; kNoRoad = never
    swamp?: number     // level the swamp tiles are built from; default rcl
    swampCost?: number // path cost of an unroaded swamp tile for this entry's search; default 12
}
export const kNoRoad = 10;      // above every plan level (0..8, 9 optional)
export const kOrigin = -1;      // src: the room's traffic origin, resolved at plan time
export const kTrafficLevel = 3; // base metas: Meta_traffic's level
export const kRingLevel = 3;
export const kSwampAverse = 55; // kPathPlain * CONSTRUCTION_COST_ROAD_SWAMP_RATIO
```

Levels are plan levels like any other struct (`0..8`, `9` optional). `kNoRoad`
is a level no room reaches, so taking the minimum over entries that share a
tile just works. The controller legs are `{rcl: kNoRoad, swamp: 0}`.
`swampCost` is the one field beyond the request: Startup's search avoids swamp
at five times plain (a swamp road costs five times as much to build and to
keep), and its entries carry that into the in-room planning.

A meta declares entries by overriding `MetaStructure.traffic(): TrafficMem[]`
(replaces `dests()`/`pointDests()`/`MetaManager.getDests()`). The default
returns `mem.traffic` (entries stored at plan time, used by mission metas).
Base metas build theirs from their own memory with `src: kOrigin`, and
`getTraffic()` resolves it to the current origin, so a moved storage moves
every road; mission legs use `kOrigin` for their home-room entry too:

| meta | old `dests()` | new `traffic()` (all `rcl = swamp = kTrafficLevel`) |
|---|---|---|
| hub | storage@1, terminal@1 | origin -> terminal, range 1 (origin *is* the storage) |
| cap | xy@2 | origin -> xy, range 2 |
| lab | xy@1 | origin -> xy, range 1 |
| extna / extnb / extnc | xy@1 / @2 / @3 | same ranges from origin |
| asrc / bsrc | points@1 (the container) | origin -> myspot, range 1 |
| min | xy@1 | origin -> xy, range 1 |
| ctrl | points@1 (ctrl spot) | origin -> ctrl spot, range 1 |
| wall | xy@0 | origin -> xy, range 0 |
| rsrc | points@1 (unused) | none: its road is the rroad leg's |
| rroad | none (held tiles) | `mem.traffic` |
| reactor, tripod, shield, nuke | none | none |

`MetaManager.trafficOrigin()` = the planned storage site, else the genesis
flag (`Game.flags[memory.name]`) when it is in the room, else none (a room
without a base, e.g. a remote, has no base entries). This is `storageOrParent`
resolved at plan time of the traffic instead of plan time of each meta. An
entry from a missing origin is left out; a home room needs a planned storage
(or its genesis flag) for its mission legs' roads. With no storage planned the
flag's tile is kept free of roads, as the storage will keep it.

### 3.2 The manager's plan

The planned roads live in `Memory.rooms[x].meta.traffic` (a `MetaMem` named
`traffic`, its roads by level under `structs.road`, plus `sig`, `at`, `fail`),
outside `meta.metas`. At runtime it is a `TrafficPlan extends MetaStructure`
held by the manager (`man.traffic`), so existing machinery treats its roads
like any meta's:

- `makeSite`, `purge`, `maxHitsInner` and `getMatrix` walk
  `man.planned()` = metas plus the plan, in the same `metaOrder` (priority 0,
  name `traffic`, exactly where `Meta_traffic` sorted).
- `getMatrix()` includes the plan's roads (Startup's `metaCosts` and the
  RemotePlanner's home matrix keep coalescing onto base roads);
  `getMatrix(['traffic'])` leaves them out.
- `man.metas`, `hasMetas()`, GREY child creation, `canPioneerEarly()` and
  `Meta_nuke` never see the plan: it is not a meta.

### 3.3 Planning a room (`metatraffic.ts`)

`trafficMatrix(roomName, planned)` builds the cost matrix, never giving a
terrain wall a walkable cost (a non-zero cost would make it walkable):

1. `planned` = `man.getMatrix(['traffic'])`: points `0xFE`, planned structures
   `0xFF`, planned roads 10.
2. With vision (always, see 3.4): every structure that is not a road or a
   rampart we may cross -> `0xFF` (containers included: a road site on one is a
   "blocker" the upkeep would destroy); every construction site except our own
   road and rampart sites -> `0xFF` (a foreign site blocks a road site too);
   sources, minerals, deposits -> `0xFF`.
3. Roads go on a cost ladder below plain (11) and swamp (12), so a replan
   reuses what is built and breaks ties toward what is planned instead of
   churning between equal routes: a built road some plan holds (another
   meta's, or the traffic plan being replaced, `previous`) 7 like a road just
   laid; a built road no plan holds (a leftover route) 8; a planned road not
   built yet (another meta's or the previous traffic plan's) 10. Built tunnels
   stay walkable on the same ladder.
4. Rooms we do not own: `0xF0` (`kAvoid`) on the free tiles beside every
   source and the controller (the RemotePlanner rule, now per room).
5. Exit tiles -> `0xFE`: only an entry's own end may use one, so no path walks
   along the border where no road can be built.

`planTraffic(roomName, cm, rings, entries, fromDest)`:

1. Rings: level `kRingLevel` roads on the free (`< 0xFE`, non-wall, non-exit)
   neighbours of every planned storage, terminal and spawn, stamped 7.
2. Entries (srcs resolved) are grouped by `(src, rcl, swamp, swampCost)` in
   declaration order (metas by priority then name, each meta's entries in
   order). Per group, as `Meta_traffic.planTraffic` did: repeated multi-goal
   searches from `src` to every open entry's `{dest, range}` (`maxRooms 1`,
   plain 11, swamp the group's `swampCost`, heuristic weight 7, `maxOps 4000`);
   the entries whose dest the path's end is in range of are done; every step
   gets the group's level (swamp tiles the swamp level, the minimum where tiles
   are shared) and is stamped 7, so later paths coalesce; steps of a `kNoRoad`
   plain tile are stamped 10 (`kShared`) instead. Exit tiles never get a road.
   A road covers both of its ends: PathFinder leaves the origin out of its
   path, so the group's `src` tile is laid with its first path when a road can
   stand on it (a storage or spawn src is blocked, a border src is an exit; a
   migrated leg's src is its old end tile).
3. A search that reaches no goal (walled-in dest, fully planned-over ring)
   closes the nearest open entry as failed (`fail`, logged, shown by
   `trafficStatus()`), so the loop always ends; the old loop could spin until
   the CPU gate stopped it. Its partial path is laid only when it got next to
   the goal (range + 1: the dest tile itself was blocked), never a dead end
   short of a walled-off one.
4. The order roads are laid in is the order `makeSite` builds them in. In rooms
   we own each path is laid from its src outward (from the storage, as the old
   traffic was); in rooms we do not own (`fromDest`) from its dest back, so a
   remote room's first sites are beside the containers where the harvesters
   build them (`idleBuild`, range 3), as the old far-end-first rroad lists were.
5. `canRun` is checked before every search; out of CPU the whole plan is
   discarded (nothing is committed) and retried later.

Differences from `Meta_traffic` on purpose: no second tree from the terminal
(the hub entry connects storage and terminal; the rings still wrap both);
built roads, real structures and the previous plan now count; exits are
avoided; tiles are stored once.

### 3.4 When the plan changes

- `trafficSig(entries)` = FNV-1a hash of `[kTrafficVersion, entries,
  metas.map(name, priority, xy, color, structs, points)]`. Entries carry the
  resolved `src`, so moving the storage (or, without one, the genesis flag)
  changes it; `structs` covers a field moved or rotated. Bumping
  `kTrafficVersion` replans every room after a push.
- The manager sets an in-memory `trafficDirty` on construction, `setMeta`,
  `deleteMeta` and `save()`. `run()` (owned rooms, every tick) and
  `runUnowned()` (visible unowned rooms, every 10 ticks) call
  `updateTraffic()` first: if dirty and the signature differs from the stored
  one, it replans and commits, and skips site placement that tick.
- Replans need vision (the matrix reads the room; a site can only be placed
  with vision anyway) and CPU: they start only with the bucket at
  `kTrafficBucket + kTrafficHeadroom` (9000), and `canRun` keeps it at 8000
  while they run; one room per tick; not in the manager's first `begin` (10-60)
  ticks after a global reset; 50 ticks of back-off after a plan that ran out
  of CPU. The bucket is checked before the signature is hashed.
- A room whose metas stop declaring traffic has its plan dropped on the next
  tick (`trafficDrops`, flushed by any room's `updateTraffic`) unless traffic
  came back by then: Startup and Remote replace road metas by removing and
  re-saving them in one tick, and the plan (its sites, and the tiles a replan
  prefers) survives that. No vision needed; that is how Remote/Startup removal
  and the Thormine teardown clear their roads. A room whose kOrigin entries
  cannot resolve (no storage, no genesis flag) drops its plan on its next
  upkeep pass.
- `commitTraffic` replaces `memory.traffic`, clears the maxHits cache, and
  removes our road construction sites on tiles the new plan dropped (unless
  another meta still plans a road there), through `Game.constructionSites`, so
  vision is not needed. Dropped built roads are left to decay, as retired roads
  are. This is the diff `Remote.removeMetas` and `Startup.removeRoadMetas` did
  by hand, where they could see.
- BLUE (`forceTraffic`) clears the stored signature, so the next upkeep pass
  replans even across a global reset.
- Console: `Game.rooms.X.meta.trafficStatus()`, `.replanTraffic()` (now,
  bucket and vision permitting), `.getTraffic()`.

### 3.5 Remote and Startup outputs

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
- `farOnly` keeps only the far room (the controller leg).

`RemotePlanner` keeps its search, container choice, cramped-first order and
matrix stamping (so legs still share border crossings; its kAvoid ring is now
metatraffic's `avoidAround`). Per source leg: `far = [{dest: container, range
1, rcl 0, swamp 0}]`, `home` = the home room, levels 0. Controller leg: `far =
[{dest: controller, range 1, rcl kNoRoad, swamp 0}]`, `farOnly`. Each room's
entries become one `Meta_rroad` (`rroad_<remote>_<leg>`, `mem.traffic`, no
structs), saved as before; `Meta_rsrc` is unchanged.

`Startup.planRoad` keeps its Rewalker + `metaCosts` search from the controller
to the home spawn. Output: `far` = the controller (`rcl kNoRoad, swamp 0`)
and each source of the mission room (`0/0`, dest = the container spot of the
meta whose `targetid()` is that source when there is one, else the source; range
1), the home room's entry from its storage (`kOrigin`), and every entry with
`swampCost: kSwampAverse` so the in-room roads keep the search's swamp
aversion. So the startup road now reaches the sources as well as the
controller; the controller stretch stays fully paved (`rcl 0`), unlike a
remote's swamp-only controller leg, because pioneers upgrade this controller
from the claim until the base `ctrl` road arrives at RCL3. A changed path replaces the road
metas in place (`saveRoadMetas`: rooms still on the road get theirs replaced,
rooms it left lose theirs), so no plan passes through an empty tick.
`road`/`roadMetas` memory, drawing, `replanRoad()` and pavers are unchanged.
`metaCosts` still excludes the mission's own metas, but they hold no tiles now:
its own previous road, in the room's traffic plan, attracts its replans
(cost 1), which keeps border crossings stable rather than free to move.

Both missions stop removing road sites themselves: deleting their metas and
saving is enough (3.4). `Remote.removeMetas` still removes container sites.
`Remote.drawMetas` also draws each tracked room's plan (once per room per tick),
since the rroad metas no longer hold tiles.

### 3.6 Genesis flag protocol

- `traffic` is no longer a meta role. A `traffic_<genesis>` child flag
  becomes a display toggle: while it exists the genesis pass draws the plan
  every tick (as it drew the old traffic meta). The plan is also drawn on every
  non-CYAN pass. YELLOW never plans traffic; GREEN/BROWN save and the plan
  follows automatically on the next upkeep tick.
- BLUE also forces a traffic replan.
- Every pass checks whether `trafficOrigin()` still matches the plan's (the
  genesis flag moved while no storage is planned) and marks the plan dirty.
- Previewing the traffic of parked (`newer`) metas is out of scope: commit
  with GREEN and the new plan is drawn a tick later.

## 4. Migration

Runs in the `MetaManager` constructor, per room, the first time a manager is
built after the push (owned rooms at their first `run()`, remote rooms when a
mission or ActiveStrat touches them). No mission cooperation and no vision are
needed.

1. **`Meta_traffic` -> plan.** If `memory.metas` holds a meta named
   `traffic`, splice it out and, unless `memory.traffic` exists, store its road
   tiles (de-duplicated, level kept) as `memory.traffic` with `sig: ""`.
   The roads stay planned, built and repaired exactly as before; the empty
   signature makes the first upkeep pass replan.
2. **`Meta_rroad` legs -> entries** (`Meta_rroad.migrate()`): a leg with
   `structs.road` and no `mem.traffic` becomes one entry
   `{src: last tile, dest: first tile, range 0, rcl 0, swamp 0}` (`rcl kNoRoad`
   for a name ending `_ctrl`, `swampCost: kSwampAverse` for one ending
   `_startup`), since its tiles run far end -> home; its tiles are adopted into
   the room's plan at level 0 (again sig `""`, each tile once at its lowest
   level, so W27S5's startup tiles stay at 0 where the old traffic had them at
   3), and `structs.road` is deleted. The legs keep their ends; only a mission
   replan (`planMetas(true)`, `replanRoad()`) gives them the new-style ends
   (storage, border, container).
3. **First replan** (per room, 10-60 ticks after the push, one room a tick):
   plans every entry, prefers built roads (cost 7 against 11 for plain), and
   diffs against the adopted plan: our road sites on dropped tiles are removed,
   dropped built roads decay. The roads repaired afterwards are the new plan's.
4. Nothing else changes in memory: mission memory (`metas`, `roadMetas`,
   `legSteps`) keeps its meta names.

Expected churn, from the offline run of the migration on a live snapshot
(6.2; old = the old traffic meta's unique tiles plus every rroad tile):

| room | old roads | new roads | kept | dropped (all built, decay) | added (of them already built) |
|---|---|---|---|---|---|
| W26S8 | 95 | 93 | 93 | 1 | 0 |
| W25S7 | 125 | 116 | 113 | 6 | 3 (2) |
| W27S5 | 86 | 81 | 81 | 2 unbuilt | 0 |
| W27S7 | 8 | 8 | 7 | 1 unbuilt | 1 (1) |
| W26S9, W27S9, W26S7, W25S8, W27S6 | 32 / 49 / 63 / 21 / 48 | same | all | 0 | 0 |

The remaining counted differences in the base rooms are tiles other metas'
templates already plan, the dropped terminal tree, and parallel legs merged
onto one road. No entry failed. The stand-in PathFinder breaks ties
differently from the game's, so the live numbers will differ slightly; the
cost ladder keeps ties on the planned roads either way.

Follow-ups the user may choose after the push (not automatic):

- `getService('Startup W27S5').replanRoad()` redraws the live startup road
  the new way (sources and controller, all level 0). The mission no longer
  plans on its own because W27S5 is claimed.
- `planMetas(true)` on a Remote gives its legs new-style ends, **but** it also
  re-chooses the containers, and a built container blocks its own tile in the
  planner's matrix, so every container would move. Unchanged behaviour; worth a
  separate fix before using it on a working remote.

Rollback: the old code cannot read `memory.traffic` or entry-only rroads. To go
back, revert the commit, then re-plan traffic with a `traffic_<genesis>` flag
(YELLOW, GREEN) and `planMetas(true)`/`replanRoad()` the missions.

## 5. Code changes by file

- `src/metatraffic.ts` (new, no runtime import of `metastruct`):
  `TrafficMem`, levels, `kOrigin`, `kSwampAverse`, path costs
  (`kPathRoad/Plain/Swamp` and `kPlannedRoad` move here; `metastruct` and
  `metaremote` import them),
  `kAvoid`/`kShared`/`avoidAround` (shared with RemotePlanner),
  `trafficMatrix`, `planTraffic`, `roomSpans`, `pathTraffic`,
  `legacyLegTraffic` (migration step 2), `hashString`, `describeTraffic`,
  `validTraffic`.
- `src/metastruct.ts`: remove `Meta_traffic`, `dests`, `pointDests`,
  `getDests`; add `traffic()`/`originTraffic()`, `TrafficPlan`, the manager's
  `traffic`, `planned()`, `trafficOrigin`, `declaresTraffic`, `getTraffic`,
  `trafficSig`, `updateTraffic`, `commitTraffic`, `dropTraffic`,
  `removeRoadSites`, `adoptRoads`, `replanTraffic`, `forceTraffic`,
  `checkTrafficOrigin`, `drawTraffic`, `trafficStatus`, the `trafficDrops`
  queue; migration step 1 in the constructor; hooks in `run()`, `runUnowned()`,
  `setMeta`, `deleteMeta`, `save()`; `runGenesis` changes (3.6);
  `ManagerMem.traffic`, `MetaMem.traffic`.
- `src/metaremote.ts`: `Meta_rroad.make(man, remote, leg, entries)`,
  `Meta_rroad.migrate()`, `Meta_rsrc` loses `dests()`, `RemotePlanner.roads()`
  becomes `stamp()` + `pathTraffic()`, `avoid()` becomes `avoidAround`.
- `src/ms.startup.ts`: `saveRoadMetas` builds entries via `pathTraffic`
  (sources and controller at level 0, `kSwampAverse`) and replaces the road
  metas in place; `removeRoadMetas` stops removing sites.
- `src/ms.remote.ts`: `removeMetas` removes container sites only; `drawMetas`
  draws each tracked room's plan.
- Docs: `metastruct.md`, `missions-and-jobs.md`, `memory-layout.md`,
  `console-operations.md`, `file-inventory.md`, `CLAUDE.md`.

## 6. Validation

1. `npx tsc --noEmit -p tsconfig.json` clean (baseline: 0 errors), and no
   require cycles in a scratch build (the check `gulp compile` runs; not run
   through gulp so the local sourcemaps keep matching the live code).
2. Offline, in the session scratchpad (not committed): a read-only snapshot of
   the nine rooms (terrain, objects and `meta` memory through the HTTP API's
   GET endpoints), and a JS stand-in for `PathFinder` (A* with the game's cost
   matrix rules).
   - `compare.js`: `metatraffic.js` on the snapshot, the migrated entries
     re-derived independently; the table in section 4.
   - `integ.js`: the real compiled `metastruct.js`/`metaremote.js` (a lodash-3
     shim and stubs for the modules that patch game prototypes) on a copy of
     the snapshot memory: migration (no traffic meta left, rroads hold one
     entry and no tiles, the adopted plan is the old tiles once each), first
     replan (same numbers as `compare.js`), no replan when nothing changed,
     replan after deleting a leg and after moving an extension field, plan
     dropped a tick later and its sites removed (through
     `Game.constructionSites`) when a room loses its last entry, a remove and
     re-save in one tick keeping the plan untouched, `kOrigin` resolving to the
     storage site, a remote room's roads listed container end first, one room
     per tick, deferral on a low bucket.
   - `unit.js`, `edge.js`: `roomSpans`/`pathTraffic` on synthetic multi-room
     paths (remote leg, controller leg, incomplete path, startup targets, home
     entry at `kOrigin`), `legacyLegTraffic`, `validTraffic`, swamp-only legs,
     lowest level on shared tiles, an unreachable dest (entry failed, loop
     ends), no roads on exit tiles, rings, the CPU abort.
3. An independent review of this plan (a second agent reading the plan and the
   code) and the code-review skill on the changed files; the findings fixed are
   the delayed drop and in-place Startup replace, Startup's swamp cost,
   `kOrigin`, the dest-first order in rooms we do not own, vision-free site
   removal, near-miss-only partial paths, the bucket headroom, foreign rampart
   sites blocking, and the genesis flag tile kept free.
4. After the user pushes (not done here): `Game.rooms.W26S8.meta.trafficStatus()`
   for each room once the replans have run (a minute or so), a look at
   `Memory.rooms.W26S8.meta.traffic`, the upkeep log lines
   (`#commitTraffic`), and road site counts over the next few hundred ticks.

## 7. Decisions taken without asking (review these)

- **Startup gets the remote shape** (roads to the sources and the controller),
  reading "their meta output ..." as covering both missions; its controller
  leg is paved on plain too (a remote's is swamp-only), since pioneers upgrade
  it from the claim until the level-3 base `ctrl` road is built.
- **The terminal tree is dropped**; rings and the hub's storage -> terminal
  entry cover the hub. Expect a few road tiles fewer around the hub.
- **Levels are kept as today** (3 for base, 0 for mission legs, rings 3);
  entries can now use other levels but none do yet.
- **Replans are deferred to the upkeep** (vision, CPU, one room a tick), not
  run inside `save()`, so a GREEN or a remote plan shows its roads a tick or
  more later.
- **Built roads attract, real structures block** in every room (old base
  traffic looked at the plan only). Safer, and it keeps replans on the
  built network.
- **Migrated rroad legs keep their old ends** until their mission replans.
- **One field beyond the request**, `swampCost`, so Startup's roads keep
  avoiding swamp inside rooms as its search does. Remote legs and base traffic
  keep plain 11 / swamp 12, as before.
- **Mission home-room entries start at `kOrigin`** (the home storage), not at
  a stored tile, so they follow a moved storage; Startup's home entry starts
  at the storage rather than the spawn it searched to.
- **Build order depends on ownership**: from the storage outward in our rooms,
  from the far end back in rooms we do not own.
- **A startup replan keeps to its previous road** (the traffic plan holds it
  and attracts the search), trading "free to move" for stable room crossings.

## 8. Noticed while measuring (not part of this change)

- W26S8 `ClaimedStrat` throws `creep_repair_1.dynMaxHits is not a function`
  (the known `struct.tower.js` overheal branch) on some ticks, which skips
  that tick's upkeep, including site placement.
- Every upkeep pass in all three owned rooms logs `purging extension` /
  `purging link`: more are planned than the RCL allows, and nothing unplanned
  is found to purge.
- GREY makes bogus child flags for mission metas (`rroad_W26S9_1417_Home` has
  parent `W26S9_1417_Home`), which FlagService deletes the next tick.
