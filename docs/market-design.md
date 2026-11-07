# Market refactor: tracker, stock rules, trader (draft plan)

Status: **phases 1-3 implemented on 6 Nov 2026 and running on shard2 in
dry run** (`market.ts`, `marketcfg.ts`, `stockrules.ts`, `marketwatch.ts`,
`ms.trader.ts`; branch `new-market`). The trader books paper fills for four
scenarios side by side: `fairA` (option A below), `fourState` (the trend
table, no gap test), and, added after the first hours showed fairA silent
on one-sided books and fourState churning purifier at a loss, `fairB`
(option B with the surcharge test) and `fourGap` (the trend table behind the
same test). Nothing deals. Phases 4-6
(live trading, the probing half of the detector, own orders) are not
written. Written 6 Nov 2026 from the 2020 code (`market.ts` at 28cc2a7 and the dead market
half of `struct.terminal.ts`), the Sept 2026 rewrite of `market.ts`, and the
shard2 books of that week (`~/screeps/market`). Sections marked **Decide**
need an answer before implementation.

Decided so far (6 Nov 2026): the trader replaces `Selloff`; the intershard
resources (CPU unlocks, access keys, pixels) stay out of this refactor
altogether and get their own triage later; prices are judged on `now`,
`mid` and `slow` only, so no week or month averages yet; `slow` is a
round-robin history fed hourly from the moving average, timed in ticks from
the pacer (`pace.ts`), not wall-clock averages; good buys and good sells
keep a gap that covers the market's costs; a manipulation detector probes
suspect orders with one-unit deals and blacklists the player per resource
for 8 days, and the tracker ignores blacklisted orders; refreshes are due
100 +- 20 ticks after the last one; the trader computes a fair buy price
and a fair sell price separately and allows optional trades only while the
two are at least the market surcharge apart; energy costs nothing while the
room's storage is over half full of energy; `want` may sit above `surplus`
to open a band the trader works for profit; optional trades are ordered by
absolute price delta; tier-3 boosts get a `need` of a few units.

## What exists today

| piece | state |
|---|---|
| `market.ts` pricing | live: best-10k-unit price per side through `markethack`, energy by effective price; `buy`/`sell` plus 1/20 and 1/100 averages in `Memory.market` (with `x100` integer copies) |
| `MarketSweep` daemon | live: every 100 ticks prices all ~87 traded resources in one tick (~5.4 CPU burst) |
| on-demand sampling | live: every ask folds a sample, so energy (asked every tick by Furiosa's swipe) averages over 20 and 100 ticks while everything else averages over 2,000 and 10,000 |
| `Selloff <room>` | reachable, not scheduled: sells non-energy terminal stock into bids in random order, keeps an energy bid |
| `struct.terminal.ts` `run()` | dead since 2020: `mineralBalance` (request, then `autoBuy`), `sellOff` above 35k per mineral, `energySell`, order cleanup |
| CPU unlocks, access keys | not tracked: their books are a handful of units, far under the 10k depth |

What the 2020 code actually did with the three values, for reference:

- **Good-deal buy** (`safeBuy`): deal on sell orders priced under `1.1 x sell99`.
- **Own buy order** (`buyOrder`): price `min(max(buy + 1, buy95), 1.1 x buy99)`: outbid the book by one, never under the mid average, never over 110% of the slow one.
- **Own sell order** (`sellOrder`): price `max(min(sell - 1, sell95), 0.9 x sell99)`: the mirror image.
- **When**: buy when a lab's planned mineral was under 100 in the terminal and no other terminal had it; sell when a terminal held over 35k of a mineral (100k energy).

So the three values clamped order prices; the timing was pure stock
thresholds. The trend-timed selling below is new logic built on the same
three values.

## 1. Tracker (`market.ts`)

### One moving average and a round-robin history

Each side of each resource keeps three things:

| name | what | replaces |
|---|---|---|
| `now` | the last computed price | `buy` / `sell` |
| `mid` | one moving average, folded at every refresh | `buy95` |
| `hist` | a round-robin history of `mid`, the slow horizon | `buy99` |

**`mid`.** Folded once per refresh (next section), so about every 100
ticks. For `mid` to stand for "the last hour", which is what the history
takes from it, its ratio has to match the refreshes in an hour:
`alpha = 2 / (n + 1)` with `n = ticks per hour / 100`. Measured on shard2
(6 Nov 2026) a tick is 4.25 s, so 846 ticks and 8.5 refreshes an hour:

| ms per tick | refreshes per hour | matching ratio | weight of the last hour at 1:20 |
|---|---|---|---|
| 3,000 | 12.0 | 1:6.5 | 46% |
| 4,250 (now) | 8.5 | 1:4.7 | 35% |
| 11,500 (runner outage) | 3.1 | 1:2.1 | 15% |

1:20 is four times too slow: an hourly reading of it would be two-thirds
older hours, and neighbouring history slots would mostly repeat each other.
The ratio is computed at each fold from `pace.msPerTick()`, about 1:5 today.

**`hist`.** Four buckets of 1, 2, 4 and 8 hours, two slots each:

```
mid --hourly--> [1h 1h] --pair--> [2h 2h] --pair--> [4h 4h] --pair--> [8h 8h] --pair--> dropped
```

- Each resource has an hourly deadline in ticks:
  `3,600,000 / pace.msPerTick()`, fuzzed +-10% so the pushes of 87
  resources do not land on one tick. `histDue` lives in `Memory`.
- On the deadline `mid` is pushed into the 1h bucket. A bucket that would
  hold a third value first averages its two oldest and pushes the result
  into the next bucket; out of the 8h bucket the pair is dropped.
- The history therefore spans 15 to 30 hours: 1-2 h, 2-4 h, 4-8 h and
  8-16 h in the four buckets.
- `slow`, the value the signals use, is the duration-weighted mean of the
  filled slots. The slots themselves stay readable (`market('H')` prints
  them), so "where was the price 8-16 hours ago" is a lookup.
- **Pre-population:** a new record fills all eight slots from the moving
  average, so `slow` is usable from the first tick. At the one-time
  migration the old `buy99` (a ~10-hour average) is the better seed for the
  4h and 8h slots and `buy95` for `mid` and the 1h and 2h slots.

Values are plain numbers in milli-credits; the `x100` integer copies go.
Per resource that is two sides of `now`, `mid` and eight slots plus two
deadlines, about 200 bytes, ~17 KB for 87 resources against 8 KB today.

### Refresh deadlines instead of a sweep

`Memory.market[res].due` is the tick the next fold is allowed: 100 +- 20
ticks after the last one.

- **On demand.** `getBuyOrderPrice`/`getSellOrderPrice` compute `now` as
  today (once per tick and side, cached). If `Game.time >= due`, both sides
  are priced, the averages are folded, and `due = Game.time + 100 + rand(-20..20)`.
  Before `due`, an ask only returns the price; the averages do not move.
  That fixes today's mixed cadence (energy no longer averages over 20 ticks).
- **Overdue pass.** A daemon in the `late` row looks each tick for records
  with `Game.time >= due + 20`, oldest first, and refreshes at most two.
  After a global reset or an outage, when everything is overdue, the backlog
  drains at two a tick instead of in one burst.
- **Discovery.** Every 500 ticks the traded set is reconciled against the
  order book; a new resource gets a record with a staggered `due`.

`due` lives in `Memory`, not the heap: every push is a global reset, and
heap deadlines would turn each push into a full sweep.

### Depth per resource

The 10k-unit depth becomes a per-resource value from the stock rules:
10,000 by default, smaller for the high-tier commodities. A side with less
than its depth on offer still has no price and adds no sample.

### Intershard resources: deferred

`cpuUnlock`, `accessKey` and `pixel` are out of scope. The tracker keeps
pricing pixels as it does today (their book is deep enough for the default
depth) and nothing trades any of the three. What their triage will need is
in the notes at the end of this file.

### Sample hygiene

A fold clamps the sample to within +-25% of `slow` before it goes into the
averages (`now` stays raw). One pumped order then moves the averages by a
bounded step per refresh. While a resource is suspected of being pumped
(next section) `mid` is frozen and nothing is pushed into the history.

### Pump detection from the daily history

Measured on shard2, 23 Oct - 6 Nov 2026, with Taki (E2S25) pumping XKH2O:

| day | avg | stddev / avg | transactions | units per transaction |
|---|---|---|---|---|
| 23-30 Oct (baseline) | 2,674-2,767 | 0.00-0.01 | 7-48 | 1,500-2,400 |
| 31 Oct | 5,024 | 0.58 | 559 | 359 |
| 2 Nov | 21,808 | 0.71 | 452 | 252 |
| 4 Nov | 217,307 | 0.66 | 1,235 | 114 |
| 5 Nov | 240,061 | 1.00 | 919 | 214 |
| 6 Nov | 52,034 | 0.27 | 80 | 300 |

The standard deviation does jump, from 1% of the average to 28-100%, but
it is not a detector by itself, for two reasons found in the same data:

- **Honest resources have high stddev every day.** Median stddev / avg over
  the window: L 1.57, energy 0.99, H 0.55, U 0.52, O 0.33. Only 37 of 70
  resources sit under 0.05. An absolute threshold flags half the market.
- **A clean wash has no stddev.** When all of a day's volume is traded at
  the pump price the deviation collapses: XZH2O on 5 Nov shows 0.00 with 26
  times its usual transaction count, XGHO2 0.20-0.25 while its average went
  from 5k to 24k. The deviation only marks the days real and fake trades mix.

What separated the pumps from everything else in the window:

| rule | flags | false positives |
|---|---|---|
| avg over 1.5x the window median | 15 resources | most: junk-priced ones (GH, GO, ZH, cell) swing by x2-x30000 on a near-zero base |
| stddev/avg over 0.25 and over 5x the resource's own median | 15 resources | the same junk-priced ones, and it misses XGHO2 |
| avg over 1.5x median **and** transactions over 5x median | XKH2O, XGHO2, XLH2O (31 Oct), XZH2O | none |

The last one is the detector: the wash needs many small self-deals, so the
transaction count rises 8-85 times while units per transaction fall to a
tenth. It caught XGHO2 (E2S25 now bids 18,224 and asks 28,615 against real
bids of 4.2-6.2k) and XZH2O two days into their pumps.

Plan: once a day per tracked resource (`getHistory`, ~0.05 CPU each, spread
like the refreshes) compute the two ratios over the 14 days. A resource is a
*suspect* when either of the last two days passes the rule. The flag
latches with the pre-pump median stored beside it, because a long pump
drags the window median up with it (XKH2O: 7 of 15 days); it clears after
three days back within 1.5x of the stored median, or by hand. A stddev jump
of 5x the resource's own median is logged as an early warning only.

That rule is stage one of the manipulation detector below: it makes a
resource a *suspect*. While suspect: the averages are frozen, the trader
never buys the resource, and selling stays allowed (a pumped bid that fills
is real credits). The book gives two more guards that need no history at all: never
buy when the ask is over twice the best bid of anyone else (XKH2O: asks
44k, bids 2.75k), and never pay more than the make cost of a compound plus
a margin (XKH2O makes for ~2.2k from X + KH2O).

### Manipulation detector and blacklist (`marketwatch.ts`)

Three stages, each needing the one before:

1. **Suspect** (passive, per resource). Any of: the history rule above;
   an order far outside the clean book (a bid over twice the next
   non-suspect bid, or an ask under half the next ask); an ask side over
   twice the bid side. A suspect resource's book is read every tick instead
   of every ~100 (one resource through the API is ~0.13 CPU), because wash
   orders live for a few ticks: XKH2O saw up to 1,235 deals a day in lots
   of ~100 units.
2. **Probe** (active). Against a suspect's too-good orders only: sell one
   unit into an elevated bid, or buy one unit from a depressed ask. The
   next tick the transaction log says whether it happened. A probe counts
   as failed only when our side was clean: terminal off cooldown, the unit
   and the transfer energy (or the credits) in hand, `deal()` returned OK,
   and no transaction with that order id appeared.
   - A probe that **succeeds** clears the order: it is real money, and the
     trader may sell more into it.
   - Three failures in a row against orders from one room, followed by a
     new order (new id) from that room within 10% of the old price,
     **confirms** manipulation for (room, resource).
3. **Blacklist.** The radar observes the room (`observeMax` reaches any
   room on the map) and intel gives the owner. `Memory.marketcfg.blacklist`
   holds `[player][resource] = expiry`, 8 days from the detection; every
   new detection sets it back to 8 days. Until the owner is known the room
   alone is blacklisted. The pricer drops every order of that resource
   whose room belongs to a blacklisted player, and the trader will not deal
   with those orders. With the orders gone from the book the averages thaw.

Attribution needs owners for the rooms in a blacklisted resource's book:
the detector queues background radar looks at every such room whose owner
intel does not know (20-40 rooms per resource, one observer, so under a
minute of ticks), and re-checks owners every few days. Console:
`blacklist()` lists entries with their evidence, `blacklist('Taki', 'XKH2O')`
adds one by hand, `blacklist('Taki', null)` clears.

## 2. Stock rules (`stockrules.ts`)

One rule per resource, four stock thresholds with built-in hysteresis:

```
        need          want          surplus         glut
---------|-------------|--------------|---------------|--------->  stock
 buy at  | buy on a    |    hold      | sell on a     | sell at
 market  | good deal   |              | good signal   | market
```

```ts
interface StockRule {
  need?: number      // below: buy whatever the trend (price cap below)
  want?: number      // below: buy only on a buy signal
  surplus?: number   // above: sell on a sell signal
  glut?: number      // above: sell whatever the trend (price floor below)
  floor?: number     // never sell under this many credits
  ceil?: number      // never buy over this many credits
  depth?: number     // units behind a price (default 10k)
  chunk?: number     // most units per deal
}
```

The four thresholds are two independent pairs, not one ordered line.
`need <= want` and `surplus <= glut` always hold, and `need < glut`. But
`want` may be above `surplus`:

```
 want <= surplus (the usual case)            want > surplus (a working band)

 need    want        surplus    glut          need   surplus      want     glut
--|-------|-----------|----------|-->        --|-------|-----------|--------|-->
  | buy if|   hold    | sell if  |             | buy if| buy if cheap,      |
  | cheap |           | dear     |             | cheap | sell if dear       |
```

In the band between `surplus` and `want` both optional sides are open: the
trader buys under the fair buy price and sells over the fair sell price,
and the stock swings inside the band. That is the triage-for-profit mode,
and the surcharge test below is what keeps a buy from being undone by a
sell at a loss. A rule with `need > surplus` or `need >= glut` is rejected
when the table loads (logged, the resource is not traded).

- **Hardcoded table** `kRules: Partial<Record<ResourceConstant, StockRule>>`
  plus class defaults (base minerals, tier-1/2/3 compounds, bars and
  level-0 commodities, energy). The tier-3 class carries a `need` of a few
  units, so the room always holds one to probe an elevated bid with. A resource with no rule and no class, and
  every intershard resource, is never bought and never sold.
- **Override table** `Memory.marketcfg.rules[res]`: a partial rule merged
  over the hardcoded one. Console: `stockRule('H', {surplus: 60000})`,
  `stockRule('H', null)` clears, `stockRules()` prints the merged table with
  overridden fields marked. `stockRules('ts')` prints the overrides as
  TypeScript lines to paste into `kRules`, so exceptions migrate into the
  hardcoded list instead of piling up in memory.
- **Stock** is storage + terminal + factory per owned room (labs excluded:
  they are `LabPlan`'s working stock).

## 3. Fair prices and the surcharge test

The trader computes two prices per resource, each from its own side and
only from `mid` and `slow`:

- **fair buy price**: at or under it, an ask is worth taking.
- **fair sell price**: at or over it, a bid is worth taking.

**Decide:** the exact formulas. The first draft's four-state trend table
(rising, topping, falling, bottoming) is superseded by these two prices;
whether any of it survives as a hold-off ("do not buy while falling") is
part of the same question. Candidates:

| | fair buy | fair sell | optional trades happen when |
|---|---|---|---|
| A. across the spread | the bid side's `slow` | the ask side's `slow` | someone posts an ask at the usual bid level or a bid at the usual ask level (NPC respawns at +-30%, dumps, real elevated bids) |
| B. same side | `min(mid, slow)` of the ask side | `max(mid, slow)` of the bid side | the price swings by more than the spread within the history's 15-30 hours |

Under A the two prices are normally a spread apart with fair sell on top,
so the surcharge test passes whenever the spread covers the costs. Under B
fair sell sits below fair buy in a quiet market, so the test fails and
nothing optional trades until the market moves.

### The surcharge test

Optional trades, `want` buys and `surplus` sells, are allowed for a
resource only while

```
fair sell - fair buy >= surcharge
```

`need` buys and `glut` sells ignore the test and keep their price guards
(`ceil`, `floor`, the suspect flag, the ask-to-bid guard).

The surcharge is what a round trip through the market costs us:

- **Dealing:** the transfer energy on both legs. From W3N4 that is 0.6-0.9
  energy per unit per leg, priced at energy's value.
- **Energy's value is zero while the room's storage is over half full of
  energy** (500k of its 1M). The energy is already there and has nowhere
  better to go, so shipping is free and the surcharge for dealing is zero.
  Under half, energy is priced at its bid-side `slow`, 35-50 credits a
  unit per leg. That is what makes cheap bulk tradeable: at energy's market
  price one leg costs more than a unit of U, O or L, at zero it costs
  nothing.
- **Own orders** (the last phase): the 5% fee on each order instead.

The terminal still has to hold the transfer energy for each deal whatever
it is priced at; the hub creep's terminal fill covers that.

A suspect resource is never bought, whatever its prices.

## 4. Trader (`ms.trader.ts`, creepless service like `Balance`)

`scheduleService('Trader')`. Each tick, per owned terminal off cooldown, the
trader lists the candidate trades and makes the first one. One deal per
terminal per 10 ticks is the engine's limit anyway.

- **Order of work.** Mandatory trades first: `need` buys, then `glut`
  sells. Then the optional ones, `want` buys and `surplus` sells together,
  sorted by absolute price delta: credits per unit between the order's
  effective price and the fair price it beats (fair buy minus the ask, or
  the bid minus fair sell). A 400-credit edge on a tier-3 boost goes before
  a 10-credit edge on a base mineral whatever the percentages say.

- **Effective prices.** Orders are compared after our transfer energy at
  energy's current value: zero while the storage is over half full of
  energy, energy's bid-side `slow` otherwise.
- **Verification.** `deal()` returning OK proves nothing (the engine fills
  the nearest dealer first and skips the rest silently). The trader reads
  `outgoingTransactions`/`incomingTransactions` the next tick and only then
  books the deal against its budget and logs it.
- **Dry run first.** `Memory.marketcfg.live` is false by default: the trader
  logs what it would do and why. `status()` shows per resource: stock, the
  four thresholds, state, the action or the reason for none.
- **Budgets.** A credits floor it never buys below, a per-day spending cap,
  and per-resource `chunk`.
- **Energy.** `Selloff`'s energy logic moves in as energy's rule: no buying
  while the storage holds 100k+, otherwise the standing bid kept at its full
  size (sellers pay the transfer on a bid, so it fills while the terminal is
  empty).
- **Staging.** The hub creep already moves non-energy stock into the
  terminal up to a per-resource ceiling; the trader sells what the terminal
  holds and lets the hub refill it.

Phase two, after the dealing trader is trusted: own orders priced by the
2020 clamps (`min(max(buy + 1, mid), 1.1 x slow)` and its mirror). From a
central room the counterparty paying the transfer is worth 35-50 credits a
unit, more than the 5% fee on everything priced over ~1,000.

## 5. What goes away

- `MarketSweep` (replaced by the overdue pass).
- `Selloff` (`ms.selloff.ts`), once the trader covers selling and the bid.
- The market half of `struct.terminal.ts` (`sell`, `buy`, `safeBuy`,
  `doBuy`, `deal`, `buyOrder`, `sellOrder`, `order`, `autoBuy`,
  `requestMineral`, `run` and its helpers); `energyFill`/`energyDrain` stay.
- `history.ts` (orphan), the `buy95`/`buy99`/`x100` memory fields after a
  one-time migration (`buy95 -> mid`, `buy99 -> slow`).
- `swipeworth.ts` keeps its API; `buyOrderPriceEma` reads `mid`.

## 6. Phases

1. **Tracker.** `mid` on the pacer's ratio, the round-robin history with
   pre-population and the one-time migration, refresh deadlines and the
   overdue pass, per-resource depth, a `market()` console table. No trading.
2. **Detector, passive half.** Suspects from the history and book rules,
   the every-tick watch on suspects, radar owner lookups, the blacklist
   table honoured by the pricer, `blacklist()` by hand. No probing yet.
3. **Rules, fair prices with the surcharge test, trader in dry run.** Review a day of its log.
4. **Trader live** with budgets; fold `Selloff` in; delete the dead code; docs.
5. **Detector, active half.** Probes ride on the trader's deal-and-verify
   machinery, so they come after it; confirmed manipulation then
   blacklists by itself.
6. **Own orders.**

## 7. Problems and things that change

- **Smooth costs more in total.** The burst is 5.4 CPU per 100 ticks,
  0.054 a tick. Spread out, almost every tick prices one resource and pays
  the per-tick cost of getting at the book (0.12-0.3 CPU for the raw-table
  capture, or 0.13-0.6 for one resource through the API), so the steady
  cost is about 0.2-0.3 CPU a tick, four to five times the total. Furiosa's
  swipe already captures the book on most ticks, which hides part of it.
  Trivial against a 300 limit, but it is the price of smoothness.
- **Pumpers post real orders, not just stats.** Taki's wash lifts the daily
  stats, but the pumped quotes also sit in the book: XKH2O's whole ask side
  is 44-48k against a 2.75k bid. A book-based average of the ask side walks
  up with it within a day, and a "flat, buy at or under slow" rule would
  then buy at 16 times the value. The pump flag, the ask-to-bid guard, the
  make-cost guard and `ceil` are four independent stops for that.
- **The pump moves between resources.** XLH2O for two days at the end of
  October, XKH2O from 31 Oct, XGHO2 and XZH2O from 4 Nov: always tier-3
  boosts with a quiet baseline. The XGHO2 "large buyer" seen on 3 Nov was
  the start of its pump, so the XGHO2 margins in `~/screeps/market` from
  that week are not demand.
- **Junk bids.** GH and XZH2O have 10k+ units of bids at 0.001. Averages
  seeded from those are junk; `floor` in the rule and the history seed keep
  the trader from selling into them.
- **Terminal contention.** `Balance`, the trader and the hub all use the
  terminal; a `Balance` send puts it on the same cooldown. The trader yields
  to `Balance` when both want the tick.
- **NPC orders last under a day** and respawn elsewhere at +-30%. The
  averages already smooth that; the trader should not chase a single NPC
  order across refreshes.
- **Season shard.** Everything stays a no-op there through `marketDisabled()`.
- **A probe needs a unit to sell.** Settled: tier-3 boosts carry a `need`
  of a few units. The catch is the pumped ones: a suspect is never bought,
  and for XKH2O every ask in the book is a pumped one, so its probe unit
  has to come from the labs or from loot.
- **Free energy is a real subsidy.** With energy at zero the trader will
  ship anything anywhere for a one-credit edge. Each unit shipped still
  burns 0.6-0.9 energy from a room that holds about a million, so a per-day
  energy budget for optional trades belongs beside the credit budget.
- **A working band churns the terminal.** With `want` above `surplus` the
  trader buys and sells the same resource, each deal a 10-tick cooldown.
  Ordering by price delta keeps the big edges first, but a deep cheap book
  can still occupy the terminal for hours.
- **The race is rigged, which is the point and the risk.** The engine fills
  the nearest dealer first, and a washer deals from next door, so our probe
  from 30 rooms away loses every time. That is exactly the signature being
  tested, but an honest popular bid in a far sector that nearer sellers
  keep filling looks the same. Only suspects are probed, and a wrong
  blacklist costs 8 days of ignoring one player's orders on one resource.
- **Wash orders are brief.** At 100-tick sampling the detector would rarely
  see one. The every-tick watch on suspects is what makes probing possible,
  and it is also the one place the tracker stops being smooth: each suspect
  costs ~0.13 CPU a tick while it lasts.
- **Blacklisting a player means knowing their rooms.** An order carries a
  room, never an owner, and a failed probe leaves no transaction to read a
  name from. Ownership comes from vision only, so the detector leans on the
  radar, and a room never observed stays unattributed until it is.
- **Accomplices and copycats.** Five W3xN3x rooms ask 45-48k for XKH2O
  beside Taki's 44k. Elevated asks are not probed (buying from them would
  simply succeed), so those rooms are not blacklisted by this design. The
  ask-to-bid guard and the suspect freeze still keep them out of our buying.
- **Probe state must survive a push.** Failure counts and the order ids
  seen per suspect room live in `Memory`, not the heap, or every deploy
  resets a detection in progress.
- **The pacer is heap state.** `pace.ts` restarts from a five-tick median
  after each global reset. The hourly deadline is stored as a tick, so a
  reset only affects deadlines computed in its first few ticks.

## Notes for the intershard triage (deferred)

Kept from the first draft so the later work starts from facts (6 Nov 2026):

- The account held 125 CPU unlocks (~27B credits at the bid), 78k pixels
  (~3.9B) and no access keys, against 1.33B credits. A bug on that path is
  twenty times more expensive than one on the terminal path.
- The books are one order deep. CPU unlocks: bids 222M x3, 207M, 206M, then
  190M x50; asks 313M x105. Access keys: bids 1.0B, asks 1.75B, three sell
  orders in all. Depths of 3-5 units, floors, caps, a reserve count and a
  dry run are the minimum.
- They have no room, pay no transfer energy, live in `Game.resources`, and
  are dealt with `Game.market.deal(id, n)`. The engine shuffles same-tick
  deals on those orders randomly, and a losing deal fails silently.
- The intent was week and month averages (one line each in the horizon
  table), seeded from the median of the 14-day history, with the same
  topping/bottoming table run on `now`/`week`/`month`: sell CPU unlocks
  into a topping bid, buy access keys from a bottoming ask.
- Pixels were pumped for one day (30 Oct: average 8.4M against 50k, stddev
  58 times the average), so the pump flag applies there too.
