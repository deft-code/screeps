# Terminal balancing and the lab idle ladder

Status: implemented 27 Oct 2026 (`ms.balance.ts`, `labplan.ts`); this doc is
the plan it was built from and the decisions taken. Monitoring notes at the
end.

## Goals

1. One service (`Balance`) moves both energy and minerals between every
   terminal we own, with no console-chosen "mineral room".
2. The RCL8 rooms (W25S7, W26S8, W27S4 in Oct 2026) each hold at least
   `kBaseFloor` (10k) of every base mineral (H, O, U, L, K, Z, X), fed by
   whichever RCL8 room holds the most of it.
3. Rooms below RCL8 (no labs) keep sending what they mine or loot to the
   nearest RCL8 room.
4. Thorium from every terminal goes to one room (W25S7, the reactor depot),
   whatever else the rules say.
5. Every RCL8 room runs a `LabPlan` building XLHO2 and XGHO2 to 20k, and
   when its plan has nothing to make, an idle ladder keeps the labs busy on
   whatever is in stock.

## Balance: the rules, in order, per terminal off cooldown

Each tick every listed terminal that is off cooldown (and did not send this
tick) tries the first rule that applies; one send per terminal per cooldown.

1. **Thorium override.** Not the thorium room, holding 100+ thorium: send
   all of it to the thorium room (`Memory.balance.thorium` when set by
   `setThoriumRoom(room)`, else the home of the scheduled `ReactorDepot`,
   else `kThoriumRoom` W25S7). The Thormines ship their own thorium there
   too; a collision is one send, not two. The hub creep's terminal drain
   leaves thorium alone (`role.hub.ts`), since the depot reads it from the
   terminal only.
2. **Feeder rooms (RCL < 8).** Send one non-energy, non-thorium resource to
   the nearest RCL8 terminal in the list (`Game.map.getRoomLinearDistance`,
   first listed on a tie): the first resource the feeder holds 100+ of in its
   terminal and more of (terminal + storage, `Balance.stock`) than the
   destination room does, at most the gap. The gap keeps a Thorhub's own
   mineral (W29S7's U, 95k) from being pumped out forever while its hubminer
   keeps digging: the two rooms level instead.
3. **RCL8 sharing.** For each base mineral in turn: the RCL8 room holding
   the most of it (stock) is the donor; if it has more than `kBaseFloor` to
   spare (stock minus the floor, 100+) and 100+ in its terminal, it sends
   the RCL8 room holding the least, if that is under the floor,
   `min(terminal stock, spare, floor - receiver stock)`. Only the top holder
   donates, so two rooms never top up the same receiver in one tick.

Shared by every rule (`ship`): the amount is capped by the destination's
free capacity and by what the sender's energy pays the fee on; under 100 it
is not sent; a partial send that would leave under 100 behind (a remainder
that could never ship by itself) becomes the whole lot when that fits and
the fee covers it, else the terminal holds until it can.

Then the **energy levelling** runs once: the fullest terminal off cooldown
that did not send this tick sends half the gap to the emptiest listed
terminal (on cooldown or not) when the gap is 5k+, as before. Until 27 Oct
2026 it waited for every terminal to be off cooldown, which the mineral
traffic would now starve.

## LabPlan: every RCL8 room, plus the idle ladder

`LabPlan W26S8` and `LabPlan W27S4` join `LabPlan W25S7`, all on the default
plan (XLHO2 20k, XGHO2 20k). The chooser is unchanged for the plan: the first
entry under quota whose chain has a makeable step.

When no entry has one (plan done, or blocked on stock), `idle()` climbs:

1. **Catalyze.** X and any tier-2 compound (UH2O, UHO2, KH2O, KHO2, LH2O,
   LHO2, ZH2O, ZHO2, GH2O, GHO2) both at 300+: make the catalyzed product of
   the tier-2 with the largest stock.
2. **Hydrate.** OH and any tier-1 compound (UH, UO, KH, KO, LH, LO, ZH, ZO,
   GH, GO) both at 300+: make the tier-2 of the tier-1 with the largest
   stock.
3. **OH.** O and H both at 300+ and OH under 2000: make OH.
4. **G.** ZK and UL both at 300+: make G.
5. Nothing: the labs are cleared and the Chemist drains them.

An idle choice has no quota and no hold: it is replaced the moment the
ladder answers differently, except that a running idle product whose
inputs are still at 300+ is kept while its rung is still the top one that
applies (so the labs do not hop between two tier-2s every 100 ticks).
Steps 2 and 3 alternate by design: 2 eats OH, 3 refills it to 2000.
`Memory.labplan[room].idle` marks an idle choice; `status()` shows the rung
in the reason, e.g. `labs:XZHO2 (idle: catalyzing ZHO2)`.

## Decisions taken

- The single "mineral room" (`setMineralRoom`, `Memory.balance.minerals`)
  is gone; the key is deleted on sight. The RCL8 floor and the feeder rule
  cover what it did.
- Only base minerals are shared among RCL8 rooms. Compounds stay where they
  were made; each room makes its own from the shared bases.
- The donor keeps the floor itself, so a scarce mineral (L: 13k in all, Oct
  2026) is shared only down to 10k in the donor. Sharing it evenly instead
  would leave every room under the 300 a reaction needs.
- Feeder sends keep the gap rule from 14 Oct 2026 rather than sending
  everything, for the hubminer reason above.
- The idle ladder runs whenever the plan has nothing makeable, not only
  when every quota is met: a plan blocked on a missing base mineral should
  not idle the labs.
- Catalysis picks the tier-2 with the largest stock, not plan order: the
  plan's own products are already at quota by then, and the largest stock
  keeps the labs on one product longest.
- Tier lists are explicit constants rather than derived from `Reactions`,
  so a reading of the ladder needs no table walk.

## Validation

- `getService('Balance').status()` lists every terminal with its RCL and
  the thorium room; `getService('Balance').stocks()` prints the base
  mineral stock per RCL8 room (the floor check at a glance).
- `getService('LabPlan X').status()` per RCL8 room: `labs:<product>` and the
  reason; `idle:` reasons name the rung.
- Watch the sends in the console log (`Balance sent ...`) and that W25S7's
  terminal drops back under the hub's 180k overfull mark as it donates.

## Open points

- Step 4 uses only ZK and UL already in stock; it does not make them from
  Z, K, U, L. The explicit plan does (for XGHO2's G).
- A feeder room's nearest RCL8 room is by linear distance only; the fee is
  the same for the tie cases we have (W29S7 to W26S8 or W27S4).
- The RCL8 floor never pulls a base mineral out of a feeder room directly;
  it reaches the RCL8 rooms through the feeder's nearest hub first.
