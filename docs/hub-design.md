# Hub: the shuttle as two rung chains

Status: plan, written 2026-10-21. Not started. The only code from it so far
is the pair of terminal rungs added the same morning (`kTerminalOverfull`,
`kTerminalDrain`, `withdrawTerminalMineral` in `role.hub.ts`) and the header
note there that points here. The day-to-day reference for the role is the
`hub` row of [creep-roles.md](creep-roles.md).

## 1. Goals

1. Keep the hub a **stateless per-tick ladder**: no task memory, every tick
   re-decided from what the creep can see. The ladder is the easiest shape to
   debug and to read, for a person and for a reviewer alike, as long as each
   rung is independent of the others.
2. Make every decision **one named rung** whose only input is a snapshot of
   the state taken once at the top of the tick: storage, terminal, hub link,
   the room's other links, the spawn or tower beside the creep, and the hand.
3. Keep the engine's allowance of **one transfer and one withdraw per tick**,
   with the limits the engine actually applies (section 3).
4. No rung may skip the rungs below it. A rung that cannot act **declines**;
   it never returns from the ladder. The two early returns the current code
   has below `storageBalance` go away.
5. Behaviour otherwise unchanged: the same thresholds, the same priorities,
   the same `fillTerminal` override, the same renewal in `afterHub`.

## 2. The ladder as it stands (Oct 2026)

`roleHub` in `role.hub.ts` runs top to bottom each tick:

1. `moveSpot()` to the `hub` spot.
2. A mineral in hand goes to the terminal, or to the storage while the
   terminal holds over `kTerminalOverfull` (180k). **Returns.**
3. Energy to an adjacent spawn (any room) or tower (200+ short), else note
   `needE`. The adjacent structures are shuffled, so between two towers the
   pick is random; a spawn always beats a tower.
4. Energy to the hub link when it is a `src` link with room, or a `hub` link
   off cooldown whose sink links (`hubNeed`) want over 200; else `needE`.
5. `storageBalance(store, term)` names a battery and a sink by energy ratio
   and says whether the balance is active; `fillTerminal` overrides it.
   **Returns** when the sink has no free capacity or either is missing.
6. Energy in hand to the sink.
7. Withdraw from the link when it is a `sink` link holding energy, on a long
   cooldown, when the sinks want under 200, or when it holds more than they
   need.
8. Withdraw energy from the battery when `needE` was set or the balance is
   active with an empty hand.
9. With over `kTerminalDrain` (185k) in the terminal, withdraw a hand of the
   mineral it holds the most of (`withdrawTerminalMineral`).
10. With no intent so far and an empty hand, carry one load of a mineral from
    storage to the terminal while the terminal holds under 150k of minerals,
    under 5k of that resource and under 180k in all (`withdrawMineral`).

Steps 3-8 are coupled through four flags: `xfer` (a transfer landed), `wd`
(a withdraw landed), `needE` (something upstream wanted energy the hand did
not have) and `this.intents`. Step 2 returns before any withdraw can run, so
a hub holding a mineral never withdraws that tick. The returns in step 5 skip
the link work and the terminal drain, so a terminal at its 300k capacity while
it is the energy sink freezes the hub entirely.

`role.shovel.ts` is the same skeleton with factory and power spawn rungs on
top. No job lays a shovel; it is out of scope here, but the chain helpers
below are written so it could share them.

## 3. Engine rules the design rests on

Read in the engine clone at `C:\Users\jnick\code\screeps-src\engine`
(HEAD a90d26f, 2026-09-23):

- `src/game/creeps.js`: `Creep.prototype.withdraw` computes the creep's free
  space from the tick-start snapshot and returns `ERR_FULL` when it is zero or
  the amount exceeds it. `Creep.prototype.transfer` checks the hand against
  the same snapshot. Neither mutates the snapshot, so a transfer queued earlier
  in the tick frees nothing for a later `withdraw` call.
- `src/processor/intents/creeps/intents.js`: per creep the server applies
  `drop, transfer, withdraw, pickup, ...` in that order, and `transfer.js`
  subtracts from the in-memory store that `withdraw.js` then reads. Neither is
  in the priority table that lets some intents cancel others.

So: both intents may fire in one tick, the server applies the transfer first,
and the withdraw is capped at the free space the creep **started** the tick
with. A full hand transfers this tick and withdraws the next; the
pipelining only exists for a partially filled hand. The current code already
behaves this way (measured 2026-10-21 on W25S7: hub0, 450 carry, moved 450
of hydrogen from the terminal to the storage every two ticks).

## 4. The model

### 4.1 Snapshot

One plain object built at the top of the tick, read by every rung, never
written by one:

```
interface HubState {
    store: StructureStorage | null       // adjacent
    term: StructureTerminal | null       // adjacent
    link: Link | null                    // adjacent hub link
    hubNeed: number                      // hubNeed(room): sink links' free energy
    fill: EnergyStruct | null            // spawn with room, else the tower most short by 200+
    batt: HubStore | null                // from storageBalance, or fillTerminal
    sink: HubStore | null
    activeBalance: boolean
    mineral: ResourceConstant | null     // the non-energy resource in hand
    energy: number                       // in hand
    free: number                         // store.getFreeCapacity() at tick start
    termTotal: number                    // term.store.getUsedCapacity(), 0 without a terminal
    wantsEnergy: boolean                 // fill or link would take energy and the hand has none
}
```

`wantsEnergy` replaces `needE`: it is a fact about the room and the hand,
computed once, not a side effect of a transfer rung declining. `fill` is
chosen deterministically (spawn first, then the tower with the most free
energy) instead of by shuffle.

### 4.2 Rungs

A rung is a method `(s: HubState) => TaskRet` that either fires exactly one
intent and returns a truthy string naming what it did, or returns `false`.
It reads the snapshot and nothing else, so each one can be understood, and
unit-reasoned, alone. The string is the log line: with `debug` on, the chain
prints the first truthy rung's name once per chain per tick, and nothing else.

Transfer chain, first truthy wins:

| rung | fires when | target |
|---|---|---|
| `putMineral` | `s.mineral` | storage if `s.termTotal > kTerminalOverfull` and the storage has room, else terminal, else decline |
| `fillStruct` | `s.energy && s.fill` | spawn or tower |
| `fillLink` | `s.energy && s.link` is `src` with room, or `hub` off cooldown with `s.hubNeed > 200` | link |
| `fillSink` | `s.energy && s.sink` with free capacity, `s.batt` present | sink |

Withdraw chain, first truthy wins, every rung requires `s.free > 0`:

| rung | fires when | source |
|---|---|---|
| `drainLink` | `s.link` not `src`, and: `sink` mode with energy, or cooldown over 10, or `s.hubNeed < 200`, or link energy minus `s.free` over `s.hubNeed` | link |
| `drawBattery` | `s.batt` and (`s.wantsEnergy`, or `s.activeBalance` with an empty hand) | battery, energy |
| `drainTerminal` | `s.term && s.termTotal > kTerminalDrain` | terminal, its largest mineral, a hand's worth |
| `stockTerminal` | hand empty, `s.store && s.term`, terminal under the three marks | storage, one mineral toward 5k |

The two chains run in that order; the transfer chain's result never feeds the
withdraw chain. `stockTerminal` keeps its empty-hand rule because its load is
for the terminal next tick, and `drainTerminal` keeps its "nothing else
withdrawn" meaning by being lower in the chain. `putMineral` no longer returns
from the ladder: a hub holding a mineral with spare room runs the withdraw
chain the same tick, which the engine allows (section 3).

What the early returns become:

- Sink full: `fillSink` declines. `drainLink`, `drainTerminal` and the rest
  still run, so a 300k terminal no longer freezes the link.
- No sink or battery (a room with storage but no terminal, or the hub off its
  spot): the rungs that need them decline; link work goes on.

### 4.3 Guards the chains share

- A rung fires only if that intent kind is still free this tick
  (`this.intents.transfer`, `this.intents.withdraw`), so `afterHub`'s
  `idleNom` and the chain cannot double up.
- A rung never calls `moveNear`: the hub is on its spot or `moveSpot` moved
  it, and a target out of range is a planning error worth a `warn`, not a
  walk.
- Amounts: `transfer` with no amount is `ERR_FULL` unless the whole load fits
  (CLAUDE.md, Season 11 rules), so `putMineral` and `fillSink` pass
  `min(hand, target free)`; `withdraw` rungs pass `min(source, s.free)`.

## 5. Where the code goes

- `role.hub.ts` keeps the role (`roleHub`, `afterHub`, the `@injecter`), the
  constants and `fillTerminal`. `roleHub` becomes: `moveSpot`, build the
  snapshot, run the two chains, return the transfer chain's result or the
  withdraw chain's.
- The snapshot builder and the rung methods are members of `CreepHub` so the
  TCreep conversion ([tcreep-design.md](tcreep-design.md) section 5.2, which
  copies `roleHub` verbatim as `shuttle()`) carries them over unchanged. Do
  this refactor **before** that conversion so the cleaner ladder is what gets
  copied.
- `storageBalance` and `hubNeed` stay in `struct.link.ts`: `balanceSplit`
  uses them too. The snapshot calls each once.
- `role.shovel.ts` is left alone. If it is ever laid again it should build the
  same snapshot plus factory and power spawn fields and reuse the energy
  rungs.

## 6. Steps

1. **Snapshot only.** Add `HubState` and `hubState()`; have the existing
   ladder read from it where it reads the same thing today (`store`, `term`,
   `link`, `hubTarget`, `batt`/`sink`/`activeBalance`). No behaviour change.
   Push, watch the W25S7 and W26S8 hubs for 100 ticks with `debug` on.
2. **Transfer chain.** Lift steps 2, 3, 4 and 6 of section 2 into
   `putMineral`, `fillStruct`, `fillLink`, `fillSink`; replace the `xfer`
   flag with the chain. `putMineral` stops returning from the ladder. Push and
   compare intents (step 7 below).
3. **Withdraw chain.** Lift steps 7-10 into `drainLink`, `drawBattery`,
   `drainTerminal`, `stockTerminal`; replace `wd` and `needE` with the chain
   and `s.wantsEnergy`; delete the two early returns. Push and compare.
4. **Deterministic fill pick.** Drop the shuffle; spawn, then the tower most
   short. Push.
5. **Docs.** Update the `hub` row in [creep-roles.md](creep-roles.md),
   replace the header note in `role.hub.ts` with a pointer here, and change
   this file's status line to "live since".
6. **Amounts.** Once the chains are in, pass explicit amounts (section 4.3)
   and remove the `ERR_FULL` noise from the debug log.
7. **Validation, each push.** With `Game.creeps.hub0.debug = 300` the chains
   log `hub transfer:<rung>` and `hub withdraw:<rung>` per tick. Compare a
   300-tick window before and after on W25S7 (busiest hub: terminal shipments
   in, link traffic, drain running) and on W26S8 (quiet): the count of each
   rung, link energy moved, and the storage/terminal energy ratios at the end
   of the window. Expect identical counts for steps 1 and 4, and for steps 2
   and 3 only the additional withdraws on ticks where a mineral was in hand.

## 7. Decisions taken

- The thresholds stay: 150k terminal minerals, 5k per resource, 180k overfull,
  185k drain. The 5k gap between the last two is the hysteresis so a drained
  hand still goes to the storage once the terminal has dipped under 185k.
- One hand per tick per intent kind. No rung tries to split a hand across
  two targets.
- The hub body stays 9 CARRY 1 MOVE (`spawnold.buildBody`, 450 carry). A
  faster drain is a body or second-creep question, not a ladder question.
- `fillTerminal` stays a memory override read into the snapshot's
  `batt`/`sink`.
- No task memory. The hub never remembers a target across ticks; a rung that
  fired last tick is simply re-evaluated.

## 8. Open points

- A mineral in hand that neither the terminal nor the storage will take (both
  full) now declines and stays in hand for good, blocking `stockTerminal`'s
  empty-hand rule while energy work goes on. Log it with `warn` once per 100
  ticks; dropping it is not worth the loss.
- `drainTerminal` takes the largest stock by amount. If thorium is the largest
  (it usually is in W25S7, where the Thormines ship it) and `ReactorDepot` is
  loading warrunners from that terminal, the drain and the depot compete. The
  depot's `active` switch turns off under 500, far below anything the drain
  leaves, so this is cosmetic, but a per-resource floor for the drain is a
  one-line addition if it ever matters.
- Whether `afterHub`'s `idleNom` should move into the withdraw chain as its
  bottom rung (pick up what lies on the spot). It is harmless where it is.
