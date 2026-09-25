# Movement and Pathing

Three generations of movement code exist. Only **Rewalker** is live.

| Module | Status | Used by |
|---|---|---|
| `src/Rewalker.ts` (2019) | **live** | `creep.move.ts` (`moveTarget`), `job.creep.ts`, `job.scout.ts`, `job.swiper.ts`, `powercreep.ts`, `metastruct.ts` (xy helpers), `intel.ts` |
| `src/matrix.js` (2017) | loaded, dead | cost-matrix helpers for team pathways; `getMat` cache, stall tracking in `Memory.rooms[x].stalls` |
| `src/routes.ts` | **live** (`dist` only) | `spawnold.findSpawns`, `role.depositfarmer.ts`, `deposit.ts` |
| `src/path.ts` | **live** (xy packing) | `pos.xy`, `room.packPos/unpackPos`; its `Path` class (multi-room road paths) is dead with `team.ts` |
| `src/FindRoute.ts`, `src/PriorityQueue.js` (2022) | orphan | a custom `Game.map.findRoute` replacement, never imported |
| `src/spots.ts` | loaded | `getSpots(pos)` / `getBestSpot(pos)` scored neighbour tiles; used by `team.ts` only |

## Rewalker API

`defaultRewalker()` returns the module singleton. Main calls:

- `walkTo(creep, destPos, range=1): WalkReturnCode` -> a `DirectionConstant`
  (1-8) when a move was issued, `OK` when already in range (and `_walk` memory
  is cleared), or an `ERR_*`. `creep.move.ts` wraps this: `moveTarget` returns
  a `"move N@pos"` string while walking and `false` on arrival.
- `planWalk(creep, goals)`, `getRoute`, `getRouteSet`, `getRouteDist`,
  `getMatrix(roomName)`, `getStuckTicks(creep)`. `planWalk` issues no move
  but overwrites `creep.memory._walk`, which the next `walkTo` builds on.
- Creep-free plans: `planRoad(from, goals, {maxCost}?)`, `planOffRoad`,
  `planSwamp` for a body that keeps full speed on roads only (plains 2, swamps
  10), on plains (1/5), or everywhere (1/1). They return a `PlanResult`
  (`path` without the origin, so `path.length` is steps; `goal` index or
  `ERR_NO_PATH`; `incomplete`, `cost`, `ops`), store nothing, and copy the
  goals before `cleanGoal` edits them. `moveTerrain(creep)` says which tier a
  creep is in. `ms.hub.ts` `srcDist` uses `planRoad`.

Helpers exported for everyone: `coordsToXY/coordsFromXY/toXY/fromXY` (the
`x*100+y` packing shared with `path.ts`), `getDirectionTo` (cross-room aware),
`positionAtDirection` (wraps to the next room), `atExit`, `cleanGoal` (shrinks
goals that spill over room edges), `matrixSerialize/Deserialize` (sparse when
small), `matrixAvoid(mat, pos, range, base = 10, step = 10)` (adds `base +
(range - d) * step` to each walkable tile at Chebyshev distance `d`),
`calcWeight(creep)` -> `[weight, moves]`,
`hasActivePart`, `whoami()`.

## How a walk proceeds (`class Step`)

Per-creep state lives in `creep.memory._walk = [destXY, destRoom, [firstXY, firstRoom, dirString], incomplete?]`.
The path is stored as a start position plus a string of direction digits
(`Path`), so it is cheap to serialise and to `step()`.

Each tick `walkTo`:
1. If the destination changed: re-plan when it moved more than 3 tiles or the
   path is short, otherwise `trim` the tail. If the tip is still out of range,
   re-plan from the creep when the straight-line distance (less goal range)
   plus `kDetourMargin` (2) is shorter than the remaining path, since the old
   path is then a detour around a target that looped back; otherwise append a
   short extension from the tip. Across rooms the range is infinite, so the
   extension is always used.
2. If the creep is on `path.first` or adjacent to `path.second`, advance the
   path (twice if it was bumped forward) and take a `waryStep`.
3. If it was bumped off the path, `rewalkTo`.
4. If stuck 3+ ticks (`RoomInfo.creeps` tracks same-position ticks per creep,
   ignoring fatigue), `rewalkTo`; otherwise retry the step.

`step()` also `bump`s a friendly, unfatigued creep standing on the next tile
into a random free neighbour. `waryStep` -> `needJuke` replans if the next tile
is more dangerous (hostile ATTACK within 2 / RANGED within 4) than the current
one. `rewalkTo` plans to fibonacci-spaced waypoints along the old path so it
rejoins instead of recomputing everything.

## Costs

`planSteps` and the `plan*` helpers share one search, `Rewalker._search`,
with the costs of the creep's `moveTerrain`: `plainCost 2 / swampCost 10`, or
`1 / 5` when MOVE parts >= other parts, `swamp 1` at 5x MOVE; `maxCost` =
ticks to live for `planSteps`, unbounded for `plan*`; `maxOps` = `4000 * route rooms`, capped at 20000 (PathFinder's
heuristic ignores `plainCost`, so slow creeps need several times the default
2000). Rooms are limited to the `findRoute` set via `restrictedRoomCallback`
for walks over 4 rooms; shorter walks search unrestricted. An incomplete
search is logged (`Rewalker incomplete path ...`), `Step.incomplete` is set
(stored as `_walk[3]`), and only the first half of the partial path is walked
so the replan happens early. A walk whose start and goal share a room but
whose path leaves it is logged (`Rewalker intra-room walk leaves ...`) with
the rooms, cost and ops, since that only happens when the room's own tiles
were made expensive. Room matrices (`calcMatrix`) mark: foreign ramparts and all
non-walkable structures `0xFF`, roads `1`, keeper lairs avoided at range 3,
stuck creeps `10+ticks` capped at `kMyStuckCap` 50 (own, since `bump()` can
move them) or `100+ticks` uncapped (others), hostile melee/ranged
avoided at range 2/4 (own and system creeps are skipped; until Sept 2026 our
guards repelled our own paths), and any recent own tombstone marks the whole room
expensive for a while. Matrices for rooms without vision are kept serialised in
`RoomInfo.mat` and rebuilt when vision returns.

Route costs for `Game.map.findRoute` (`routeCallback`): own claimed 1, own
reserved 2, highway 3, ally reserved 4, normal 5, ally claimed 6, SK 7,
hostile reserved 8, hostile claimed 10; a room where we were recently killed
costs +20 for 2000 ticks. `isAllied` only treats `SYSTEM_USERNAME` as allied.
Routes are cached 500 ticks per unordered room pair.

## `routes.dist(from, to)`

Room distance via `Game.map.findRoute` length, memoised in a module map and in
`Memory.dists` when >4. `isHostile(roomName)` reads `RoomIntel` (owner not
`deft-code` with RCL>2, or an invader core).

## Job-level movement (`src/job.creep.ts`)

`JobCreep.moveRoom(roomName, xy=2525, range=20)`, `moveTargetRoom(target)` (steps
off the exit tile once inside), `moveDir`, `moveTarget`, `movePos` return
`Task2Ret` (`"start"` on arrival, `"wait"` while moving). `walkRange(target)`
is range 3.
