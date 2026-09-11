# Movement and Pathing

Three generations of movement code exist. Only **Rewalker** is live.

| Module | Status | Used by |
|---|---|---|
| `src/Rewalker.ts` (2019) | **live** | `creep.move.ts` (`moveTarget`), `job.creep.ts`, `job.scout.ts`, `job.swiper.ts`, `powercreep.ts`, `metastruct.ts` (xy helpers), `intel.ts` |
| `src/Traveler.js` (vendored bonzaiferroni Traveler, 2017) | loaded, dead | defines `Creep.prototype.travelTo`; nothing calls it (the old `moveTarget` that used it is commented out) |
| `src/matrix.js` (2017) | loaded, dead | cost-matrix helpers for Traveler/team pathways; `getMat` cache, stall tracking in `Memory.rooms[x].stalls` |
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
  `getMatrix(roomName)`, `getStuckTicks(creep)`.

Helpers exported for everyone: `coordsToXY/coordsFromXY/toXY/fromXY` (the
`x*100+y` packing shared with `path.ts`), `getDirectionTo` (cross-room aware),
`positionAtDirection` (wraps to the next room), `atExit`, `cleanGoal` (shrinks
goals that spill over room edges), `matrixSerialize/Deserialize` (sparse when
small), `matrixAvoid`, `calcWeight(creep)` -> `[weight, moves]`,
`hasActivePart`, `whoami()`.

## How a walk proceeds (`class Step`)

Per-creep state lives in `creep.memory._walk = [destXY, destRoom, [firstXY, firstRoom, dirString], incomplete?]`.
The path is stored as a start position plus a string of direction digits
(`Path`), so it is cheap to serialise and to `step()`.

Each tick `walkTo`:
1. If the destination changed: re-plan when it moved more than 3 tiles or the
   path is short, otherwise `trim` the tail and append a short extension.
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

`planSteps` uses `PathFinder.search` with `plainCost 2 / swampCost 10`, or
`1 / 5` when MOVE parts >= other parts, `swamp 1` at 5x MOVE; `maxCost` =
ticks to live. Room matrices (`calcMatrix`) mark: foreign ramparts and all
non-walkable structures `0xFF`, roads `1`, keeper lairs avoided at range 3,
stuck creeps `10+ticks` (own) or `100+ticks` (others), hostile melee/ranged
avoided at range 2/4, and any recent own tombstone marks the whole room
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
