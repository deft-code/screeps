# Rooms, Strategy, and Structure Modules

## Room strategy (`src/strat.ts`)

`room.strat` returns a cached `IStrat` per room name (`GetStrat`). `makeStrat`
picks `ClaimedStrat` when `controller.my`, `ActiveStrat` when the room is
unclaimed but `hasMetas(name)` (metas in `Memory.rooms[name].meta`), else
`NullStrat`. All extend `Process` and enqueue themselves with
`exec(this, "low")` on construction, so they run inside `process.runAll()`
([runtime-tick.md](runtime-tick.md)).

`evolve()` is called on every `room.strat` access and the result replaces the
cached strat. `NullStrat` -> `ClaimedStrat` when the controller becomes ours,
-> `ActiveStrat` when metas appear; `ActiveStrat` -> `ClaimedStrat` on claim,
-> `NullStrat` when its metas are removed (a Remote mission's `windDown`).
The outgoing strat `kill()`s itself in `replace()` so only one process per
room survives. `ClaimedStrat.evolve()` returns `null`.

| | `NullStrat` | `ActiveStrat` | `ClaimedStrat` |
|---|---|---|---|
| `init()` (from `main`) | `legacyInit` (hostile lists + ratchets), `updateIntel` | same | same, plus `theRadar.register(observer)` at RCL8 and `theMarket.registerRoom` |
| `run()` (process row) | no-op, `"low"` | every 10 ticks (random offset) `room.meta.runUnowned()`: container and road sites only; skipped without vision or in a room someone else owns; `"low"` | `runTowers`, `popSafeMode`, `runLabs`, `runLinks`, `room.meta.run()`, `drawMinerals`, `runFactory`; `"normal"` |
| `spawnEnergy()` | `undefined` | `undefined` | `room.meta.spawnEnergy()` |
| `maxHits(stype, xy)` | roads and containers `0` (left to decay); walls/ramparts fixed table by RCL | roads and containers from `room.meta.maxHits(..., 0)`: full when a meta claims the tile, else `0`; rest as `NullStrat` | `room.meta.maxHits(...)` with CPU accounting |

The `0` for unplanned roads and containers is what stops passing creeps' idle
repairs from spending energy on remote roads nobody planned.

`popSafeMode`: if `room.assaulters` exist and any tower or spawn is damaged,
`activateSafeMode()` and `Game.notify`.

`legacyInit` classifications (from `CreepExtra`): `hostile` = active ATTACK or
RANGED_ATTACK; `assault` = hostile or >1 WORK or >1 HEAL; `melee` = ATTACK.
`kAllies = ['no one']`.

## Room extras (`src/room.ts`, `src/path.ts`)

- `room.energyFreeAvailable`, `room.maxHits(struct)`, `room.role`
  (`memory.role` or `claimed`/`remote`), `toString()` as a room link.
- `room.findStructs(...types)` groups `FIND_STRUCTURES` by type once per room
  object (`room.structsByType`) and is the standard way to find structures.
- `room.lookForAtRange(look, pos, range, asArray)`.
- `room.addSpot/getSpot/drawSpots` with `Memory.rooms[x].spots` (falls back to
  metastruct points).
- `room.packPos(pos)` / `room.unpackPos(xy)` and `pos.xy` (`x*100+y`), `pos.exit`.

## Towers (`src/struct.tower.js`, `runTowers`)

Priority order each tick, one tower per action where noted: emergency repair of
structures about to decay (all towers) -> heal a creep hurt more than
`TOWER_POWER_HEAL` -> if exactly one assaulter, all towers fire; if several,
each tower picks a random-ish nearest enemy -> top-off heals -> upkeep repairs
of roads/ramparts/containers near decay -> snipe weak enemies -> "overheal" wall
repair when storage > 800k (this branch calls a missing `dynMaxHits` import and
would throw; see [known-issues.md](known-issues.md)).

## Links (`src/struct.link.ts`)

`Mode` (const enum, stored as one-character strings in `Memory.rooms[x].links[xy].mode`):
`dump ^`, `src +`, `sink -`, `hub =`, `pause x`. `link.mode` getter: memory
override -> per-room cache computed by `makeCache` (metastruct `getLinkMode`,
then proximity: source -> `src`, storage/terminal -> `hub`, controller -> `sink`,
edge -> `dump`, else `sink`). `runLinks`: dump links empty into any sink/hub;
`hub`/`src` links send to a non-same-mode sink in multiples of 33 (loss
compensation); full `src` links send anywhere. `storageBalance(storage,
terminal)` and `hubNeed(room)` drive the hub creep. `balanceSplit` (called
from nowhere live) flips hub links to move energy between storage and
terminal. Visuals: mode glyph and a cooldown arc on each link.

## Labs (`src/struct.lab.js`)

`runLabs(room)` (owned rooms): ensures `Memory.rooms[x].labs`, calls
`terminal.autoReactAll()` every 500 ticks (picks the first boost below quota in
`mineralPlan()`, resolves missing intermediates with `autoReact`, and
`setLabs(resource)`: `orderedLabs()[0..1]` get the two inputs, the rest the
product), draws plan/mineral glyphs, and runs up to two reactions per tick.
`lab.planType`, `lab.boost` (15-tick claim), `mineralFill()`/`mineralDrain()`
tell haulers/chemists what to move. `room.requestBoost(boost)` picks a lab
via `findBoostLab`. Boost requests come from `CreepRole.doBoosts` for creeps
with `memory.boosts`.

## Terminal (`src/struct.terminal.js`)

Prototype helpers: `energyFill()` (< 50k), `energyDrain()` (> 60k), `sell`,
`buy`, `safeBuy`, `deal`, `buyOrder`, `sellOrder`, `order`, `autoBuy` (needs
`Game.market.credits >= 4,000,000`), `requestMineral(mineral)` (pulls from
another terminal via `Game.terminals`, which is never defined). `exports.run`
= cleanup -> mineralBalance -> energyBalance -> energySell -> sellAlloy ->
sellMetal -> sellOff, but nothing calls it on the live build. Constants:
`kEnergyLow 50k`, `kEnergyHi 60k`, `kMaxMineral 35k`, `kMaxEnergy 100k`.

## Factory (`src/struct.factory.ts`)

`runFactory(room)`: produce `RESOURCE_ALLOY` when terminal and factory hold
under 1000; on missing components, recursively `produce` sub-commodities and
ask the terminal to `requestMineral`/`autoBuy`. `needs(orig)` walks
`COMMODITIES`. `unloads` = `[RESOURCE_ALLOY]` (used by the shovel role).

## Containers, controller, sources, tombstones

- `container.mode` (`struct.container.js`): `src` if within 2 of a source or
  mineral, `sink` if within 4 of the controller, else `hub`; memoised in
  `Memory.rooms[x].containers[id]` with a version `v` that forces a recompute
  when `calcMode` changes. Haulers drain only `src`, fill `sink` and `hub`,
  and recharge from `sink` only when nothing else in the room has energy.
- `controller.resTicks`, `controller.reservable` (hardcoded username
  `deft-code`).
- `source.spots` / `source.bestSpot` (`source.js`): walkable neighbours scored
  by open tiles; used by `taskHarvestSpots`. Also gives `Source`/`Mineral` a
  `note` and `regenTTL` (PWR_REGEN_SOURCE effect).
- `struct.ts`: `note` (`stype6` + xy), `toString()` link, `obstacle`, `hurts`,
  `repairs`. `constructionsite.ts`, `tombs.js`: `note`/`toString`.

## Intel and radar (`src/intel.ts`, `src/radar.ts`)

`updateIntel(room)` runs for every visible room from `strat.init()` and writes
`Memory.rooms[x].intel = { last, owner: [userIdx, rcl], core?, power?, deposit? }`
plus the shared `Memory.intel = { users, recs, recExpire }` (highway rooms with
deposits/power banks). `roomKind(name)` classifies Hwy / Portal / SourceKeeper /
Regular from coordinates. `RoomIntel.get(name)` is the read API (`owner`,
`rcl`, `staleness`, `coreLvl`, `powerTTL`, `depositPos/Cooldown/TTL`).
`theRadar` collects observers per tick and would scan a 21x21 neighbourhood,
but `theRadar.run()` is only called after the dead `return` in `main.js`.

## Market (`src/market.ts`)

`theMarket.registerRoom` sums terminal/storage/factory stores per RCL6+ room
into a per-tick cache. `run()` on the class is empty; the module-level `run()`
(record buy/sell EMAs into `Memory.market`) is dead. `Memory.market` is read by
the terminal `safeBuy`/`buyOrder`/`sellOrder` helpers.

## Pace (`src/pace.ts`)

`humanize(ticks)` renders mineral regen timers. The tick-rate sampler is not
wired (`module.__initGlobals` commented out), so it assumes 3000 ms per tick.
