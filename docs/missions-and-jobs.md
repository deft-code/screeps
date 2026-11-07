# Missions, Jobs, and MyCreep (the 2022 architecture)

Files: `src/process.ts`, `src/mission.ts`, `src/mycreep.ts`, `src/job.creep.ts`,
`src/job.role.ts`, `src/job.*.ts`, `src/ms.*.ts`, `src/spawn.ts`.

This is the active design and the target for any new behaviour. It replaced the
flag-driven "team" system ([legacy-systems.md](legacy-systems.md)).

## Class map

```
Process                      run(): Priority; kill()           (process.ts)
 └─ Service                  named by a command string, e.g. "Swipe W5N8 W6N8"
     ├─ Balance      @register  (ms.balance.ts)   "Balance"; no creeps (docs/balance-design.md, 27 Oct 2026). Rooms come from addRoom(room)/removeRoom(room) (Memory.balance.rooms). Each tick every listed terminal off cooldown makes at most one send, the first rule that applies: all its thorium to the thorium room (Memory.balance.thorium, default W25S7, setThoriumRoom); a room under RCL8: one non-energy resource to the nearest RCL8 terminal in the list, only what it holds more of than that room (terminal + storage, Balance.stock), at most the gap; an RCL8 room: a base mineral (H O U L K Z X) it holds the most of among the RCL8 rooms and more than 10k of (kBaseFloor), to the RCL8 room holding the least while that is under 10k, keeping 10k itself. Every send (ship) is capped by the destination's room and the fee the sender's energy pays, never under TERMINAL_MIN_SEND, and never a partial send that would strand under TERMINAL_MIN_SEND (the lot goes when it fits and the fee covers it, else the terminal holds until it can). The old single mineral room (setMineralRoom, Memory.balance.minerals) is gone; the thorium room defaults to the scheduled ReactorDepot's home.
     │                                            Then the fullest terminal off cooldown that did not send this tick sends half the
     │                                            energy gap to the emptiest when the gap is at least 5k, shrunk to what it can pay with the transfer fee. stocks() prints the base minerals per RCL8 room.
     ├─ Trader       @register  (ms.trader.ts)    "Trader"; no creeps; the market trader in dry-run form (docs/market-design.md, Nov 2026): evaluates the ruled
     │                                            resources (stockrules.ts) five a tick and books, per scenario (fairA, fourState, fairB, fourGap) and room with a terminal, the
     │                                            trade that scenario would make into a paper ledger (Memory.trader.sim), one fill per paper terminal per 10 ticks,
     │                                            each order's taken quantity remembered so it is not filled twice. Never calls Game.market.deal. traderReport().
     ├─ Selloff      @register  (ms.selloff.ts)   "Selloff <room>"; no creeps, so a purple flag "Selloff_<room>" may run it. To be replaced by Trader.
     ├─ Experiment   @register  (ms.experiment.ts) "Experiment"; road weight comparison from a purple flag "Experiment" to its child "dest_Experiment" (roadplan.ts).
     │                                            Kills itself when the room is not ours or has no terminal (room invisible counts).
     │                                            Each tick the room's terminal is off cooldown: non-energy stock in random order,
     │                                            per resource walk the buy orders (Game.market.getAllOrders cached 50 ticks,
     │                                            best price first) and Game.market.deal the first that fits; the transfer
     │                                            energy comes from this terminal, so the amount is halved until affordable; when
     │                                            not even one unit is, the tick's deal buys energy from the cheapest sell order
     │                                            instead (up to 100k in the terminal, capped by credits and transfer energy).
     │                                            One deal per tick (deal() starts the 10-tick terminal cooldown).
     ├─ Furiosa      @register  (ms.furiosa.ts)   "Furiosa"; manages the power creep of that name (Memory.furiosa.home).
     │                                            Keeps a home: a flag named Furiosa pins it to the flag's room (waits there if it
     │                                            has no power spawn); else the stored room if ours with a power spawn, else a
     │                                            random own power spawn's room, else none. Spawns Game.powerCreeps.Furiosa (via
     │                                            MyPowerCreep.spawn, which records memory.birth on the creep) at the home power
     │                                            spawn when she exists but is unspawned and the spawn cooldown has passed.
     │                                            Spawned: the Furiosa flag's child flags ("<prefix><n>_Furiosa", sorted by name)
     │                                            pick the behaviour; first known prefix wins, unknown ones are logged and skipped.
     │                                            swipe -> MyPowerCreep.questSwipe(child flag room, Furiosa flag room): the shared swipe quest (swipe.ts, also the Swiper job's) with targets by value, going for the structure that holds the most valuable resource (buy-order price per unit) and taking its resources most valuable first, only what swipeworth.ts prices as worth it for the flag room; the child flag is removed once
     │                                            questSwipe returns false (creep empty and the room has nothing left, judged at home after the last
     │                                            partial unload too), so the next child takes over without a trip back.
     │                                            No usable child flag: walk to within 5 of the Furiosa flag and wait. TTL < 300: runRenew
     │                                            at the home power spawn instead of any child behaviour.
     └─ Mission (abstract)   owns eggs/hatch/creeps lists in Memory.missions[name]
         ├─ GlobalRespawn    @register  (ms.globalrespawn.ts)  ACTIVE
         ├─ Bulldoze         @register  (ms.bulldoze.ts)       "Bulldoze <target> [home]"; args[2] is home and spawn room (every dozer hatches there; none: the target room and distance-picked spawns);
         │                                                     owns a flag "Bulldoze"/"BulldozeN" (memory.flag) on the anchor (memory.anchor, aim(x, y) from the console; the room centre until then) and a child
         │                                                     "doze<xy>_Bulldoze" per listed tile (syncChildren; a hand-placed child adds its tile); tile list in memory.doze fed by those, by legacy `bulldoze*` flags
         │                                                     (this tile next, flag removed) and by the breach plan (anchor, else the home spawn -> first tile, cost round(log10(hits)*20) per blocked tile, replanned
         │                                                     every 100 ticks, only with the target room in view: a blind plan ran through the walls; while a plan is pending (planPending: nothing listed, a new first target or a plan 100+ ticks old) and the room is out of sight, theRadar.observeNow(target) each tick; with nothing listed and vision, seed(): a breach to the nearest hostile spawn, else the controller, lists what blocks it);
         │                                                     paceNJobs(Bulldozer, dozers) (the `dozers` setter, persisted, default 1; one egg per 1500/(dozers+1) ticks while under the count) while the list is not empty; windDown() removes the anchor flag and its children; asks the home labs for XZH2O while a dozer is an egg/hatch
         ├─ Hub              @register  (ms.hub.ts)            "Hub <room>"; GlobalRespawn for any owned room, without the startup creeps:
                                                              Reboot while the mission has no creeps, bsrc (only with a Meta_bsrc)/asrc (ecap >= 550; nCreeps 1 + (cached spawn->spot walk + 30)/1500 each) or haulers (1 + one per 2k dropped energy over 1k, max 3), Worker, Ctrl, Hub once storage exists, Upgrader.want(room) upgraders (below RCL8: storage energy / 100k, from 100k, fractional),
                                                              one Hubminer while the Meta_min extractor stands on a non-thorium mineral with minerals left and under 100k of it in storage + terminal (Hubminer.want); Hubminecarts, 1 while its container holds anything, 2 past half full (Hubminecart.want); (a Meta_min planned before it had an extractor entry, W3N4's from 2022, is read as the mineral beside its 'mineral' spot instead, Nov 2026)
                                                              all spawned "local"; idles (paced log) while the room is not ours or has no spawn of its own (status `no-spawn`). Distinct from the `Hub` job class (separate registries).
         ├─ Swipe            @register  (ms.swipe.ts)          "Swipe <target> <home>"; Scout while the target is invisible, else Swipers: 2 to 8 (kMinSwipers..kMaxSwipers), enough to carry the
         │                                                     loot worth taking out within 20k ticks or half the ruins' remaining decay, whichever is less, at 1,250 units a trip and a round trip of
         │                                                     2 x 50 x findRoute rooms + 60 ticks (wantSwipers; status shows loot/trips/trip/decay/swipers); `swipers = n` fixes the count (persisted, null = estimate);
         │                                                     that many heads at a time through paceNJobs (nJobs kept ~2n-1 and ran the home spawns at 97%, 7 Nov 2026);
         │                                                     watchRoute: the Rewalker route home -> target (home excluded; status `route:`) is observeBackground'ed every tick and each room in sight checked for an
         │                                                     armed creep (ATTACK/RANGED_ATTACK) of another player (not keepers, invaders or allies); one found is kept in Memory.missions[m].guard[room] =
         │                                                     [player, tick] (cleared when the room is seen clear, lapses after 1500 ticks unseen) and holds the mission (guardedBy, status `GUARDED:<room> by <player>`):
         │                                                     swiper eggs purged, none laid, empty swipers at home wait by the exit (Swiper.waitByExit); psy372's W5N3 ranger stripped four swipers' CARRY, 7 Nov 2026;
         │                                                     while guarded one Toxic is kept per guarded room (toxic(): one egg at a time as soon as one is short, the egg's memory.troom = its room, re-aimed
         │                                                     when a guard moves); once a toxic stands in every guarded room (`baited`) the hold lifts (Swipe.hold, what Swiper reads) and the swipers run
         │                                                     past the distracted guard (a HEAL guard outlasts a bait, so it is a decoy); windDown() lifts the hold too, so the swipers left run until they
         │                                                     die; Mission.resume() cancels a windDown (deletes Memory.missions[m].windDown and tombs)
         │                                                     winds down once the target room has no swipe targets left (swipe.ts swipeTargets)
         │                                                     worth(res) (swipeworth.ts, shared with Furiosa's questSwipe): energy always, unless `ignoreEnergy = true` (persisted Memory.missions[m].noenergy:
         │                                                     energy containers and energy-only ruins are not targets, swipers do not pick energy up, and the mission winds down once the other loot is gone
         │                                                     rather than contest the energy with the room's harvesters; Nov 2026); else market.getBuyOrderPrice(res) >= 2 x market.energyValue(home room)
         │                                                     (the trader's energy price: bid-side slow scaled down as the home storage fills past half; until 7 Nov 2026 the ask delivered to home, ~4x too high);
         │                                                     unpriceable resources (under 10k units bid) are skipped; no market (season) or no energy price = take everything.
         │                                                     Swiper and the wind-down test both use it, so "clean" means nothing worth taking is left
         │                                                     sparkJoy(): every 1000 + random(100) ticks (Memory.missions[m].sparkjoy = next look) lists the home storage/terminal
         │                                                     resources that are swipeworth.worthless (no buy-order price AND zero units bid; never energy; never without a market)
         │                                                     and lays one Konmari when there are any and none is out
         ├─ Reactor          @register  (ms.reactor.ts)        "Reactor <room>"; mission room = sector core of <room>
         │                                                     (both coords rounded to x5); paceJobs(Scout, 1400) from <room> keeps the core
         │                                                     visible at all times; while visible logs
         │                                                     the reactor (FIND_REACTORS) every 500 ticks (probe);
         │                                                     a creep dying in a room whose intel shows an invader core (level > 0) pauses all laying
         │                                                     for 1500 ticks (Mission.creepDied hook; queued eggs purged) so the survivors die off and the
         │                                                     next scout re-probes the core, dying to it again renewing the pause;
         │                                                     nJobs(Guard, 1) while any enemy creep (room.enemies) is in the core and homeHasThorium (a runner could be sent; else an idle guard wastes energy and spawn time);
         │                                                     paceNJobs(Toxic, 1) while an armed enemy (room.hostiles) with no active HEAL part is in the core;
         │                                                     nJobs(Immortan, 1) while homeHasThorium and the reactor is visible and either not `my` or `my` with over 100 thorium aboard (CLAIM creeps are costly);
         │                                                     nJobs(Warboy, min(args[2], 700 / tripLoad)) once the home room has an
         │                                                     extractor on a thorium mineral with thorium left, the core is visible with a reactor in it and no armed hostile (room.hostiles),
         │                                                     and a full load will still fit when it lands: store - 600 (lead ticks) + thorium inbound from every Reactor mission's warboys and eggs + 450 <= 1000
         │                                                     paceNJobs(Prospector, 1, 1450) from home while job.prospector's wantProspector holds for the core (no armed non-keeper enemy, mineral left, home under 50k of it; the core has no lairs so no tombstone rule)
         │   └─ ReactorDepot @register  (ms.reactordepot.ts)  "ReactorDepot <room> [cap]"; knows the core's `Capture <core>` (memory.capture, found among Memory.scheduler.services once): until 1 Nov 2026 watch() -> syncCapture() paused it the tick the depot was cold (the depot switch off and no warrunner alive, hatching or queued: `cold`) and resumed it once warm; with the season over that held the capture for good, so syncCapture now only lifts a pause it set (memory.coldPaused) and never sets one; Reactor with the runner hooks overridden: runnerClass Warrunner
         │                                                     (loads from the home terminal instead of mining), runnerCycle 300, leadTicks 300, runnerCount 1.2 (always one runner, replaced with 300 TTL left; Oct 2026), and homeHasThorium =
         │                                                     the depot is active: a persisted switch on at 25k thorium in the home terminal, off under 500 (`active`, status `depot:<n> on|off holding`; 1000 both ways until 14 Oct 2026, on at 10k until 15 Oct 2026, 25k until 20 Oct 2026, 10k until 27 Oct 2026). While the depot is off the mission is held as pause() holds it (`paused` is overridden): nothing laid, scouts included, eggs purged the tick it flips off, the living shepherded (27 Oct 2026; before that scouts, guard and immortan went on while off). Scout, probe, guard, immortan and the
         │                                                     invader-core pause are inherited; inboundThorium counts both missions' runners against the reactor.
         │                                                     Keeps Rewalker.getRoute(home, core) in memory.route (refreshed every 500 ticks) with its SK rooms in
         │                                                     memory.skRooms (status `route:.. sk:..`); watch() checks every visible SK room on the route each tick for an
         │                                                     invader core with a level, and one found (or a creep dying in such a room whose intel shows a core) sets
         │                                                     pauseUntil = now + 2500 and purges every egg but scouts (Mission.purgeEggs keep-list); while paused
         │                                                     paceJobs(Scout, 1400) still runs (Reactor.whilePaused hook), so passing scouts renew the pause until the core is gone
         ├─ Thorhub          @register  (ms.thorhub.ts)        "Thorhub <room>"; Hub subclass for a temporary Thormine room: nUpgraders() = 0 and nCtrlHaulers() = 0 from RCL6 (Hub's rules up to RCL5), and ctrlCap() = full capacity up to RCL5, RCL2Energy from RCL6 (Ctrl.spawn honours a mission's ctrlCap), everything else Hub; setRoomStrat(room, "thorclaimed") while running, cleared on windDown.
         ├─ Thormine         @register  (ms.thormine.ts)       "Thormine <room> [dest]"; mines <room>'s thorium into its terminal and ships it to [dest] (default W25S7).
         │                                                     With the room visible: nJobs(Thoreater, max(1, spots - 1)), spots = walkable tiles beside the thorium mineral
         │                                                     (spots.ts terrain minus obstacle structures), only while the mineral has thorium left, an extractor
         │                                                     stands on it and the room has a terminal of ours (status shows `closed:<reason>` otherwise, log every 500 ticks);
         │                                                     ship(): terminal off cooldown with >= TERMINAL_MIN_SEND (100) thorium -> terminal.send to [dest] (must be another
         │                                                     room with a visible terminal of ours), the amount halved until this terminal's energy covers calcTransactionCost.
         │                                                     Teardown (memory.teardown.phase, status `TEARDOWN:<phase>(<ticks>)`), begun when the mineral reads 0, the terminal
         │                                                     holds no thorium and no thoreater is left; abortTeardown() from the console undoes phases 1-2 only:
         │                                                     missions: windDown() every other Mission whose "home" alias is this room, or whose roomName is with no home (Hub, Startup);
         │                                                     clear the room's metas (MetaManager.save), remove every flag in the room, cancel construction sites (repeated each tick);
         │                                                     cleanup: nJobs(Cleanup, energy outside the terminal / 2000, 1..4) while the room's spawn energy is at least 300 (a full spawn); done under 50 loose, no sweeper, terminal < 100 or unable to afford a send;
         │                                                     ends under 50 energy outside the terminal, no cleanup alive/queued, terminal < 100 energy;
         │                                                     destroy: up to 10 structures a tick, everything but spawn/terminal first, then spawn and terminal (roads and ramparts are kept since 14 Oct 2026),
         │                                                     then controller.unclaim(); done: kill + drop memory. Throughout: shipAll() sends every terminal resource to [dest], energy last
         ├─ Farm             @register  (ms.farm.ts)           "Farm <farm> <home> [spawn]"; idles (no eggs, paced log, status `home-not-ready`) until <home> is ours and has a spawn or a
                                                              spawn construction site (`homeReady`; Remote overrides it to true); with [spawn] every creep comes from that room only
                                                              (`getRoomName("spawn")`, read by `JobRole.stratSpawn` and `Scout.spawn`; idles `spawn-not-ready` while it has no spawn; Remote nulls it); paceNJobs(Farmer, n), n = source capacity / (2*avg farmer store), max 2 per spot;
                                                              Scout while the farm room is invisible;
                                                              paceJobs(Mini, 1500) while memory.tenemies (any enemy creep seen; team.ts suppressMini);
                                                              paceJobs(Guard, max(1500 - thostiles, 350)) once memory.thostiles >= 100 (team.ts suppressGuard used 3);
                                                              paceJobs(Wolf, max(1500 - thostiles, 350)) once memory.thostiles >= 300
                                                              (armed hostiles seen 300 consecutive ticks; team.ts suppressWolf);
                                                              paceJobs(Wolf, 1500) while an invader core stands;
                                                              paceJobs(Reserver, 550/ctrl spots) while someone else holds the reservation, no hostiles,
                                                              and living reservers' ttl*CLAIM < ticks left;
                                                              no farmers while that reservation has > 100 ticks left
         │   ├─ GrowFarm     @register  (ms.growfarm.ts)       "GrowFarm <farm> <home> [spawn]"; a Farm that evolve()s into "Remote <farm> <home> [spawn]"
                                                              once <home> is ours with energyCapacityAvailable >= 800 (full RCL3; 1300, full RCL4, if the
                                                              farm controller has one free tile; waits while the farm is invisible) and a storage built
                                                              or planned (RemotePlanner needs one); status shows `ecap:<n>/<need>`
         │   └─ Remote       @register  (ms.remote.ts)         "Remote <remote> <home> [spawn]"; port of team.ts teamRemote, phase 1. Extends Farm for
                                                              the suppress* rules but replaces run() and reserve():
                                                              [spawn] as Farm: the only room its creeps spawn from (Harvester/Trucker.spawn honour it too); idles `spawn-not-ready` without a spawn there;
                                                              Scout while invisible; Mini/Guard/Wolf against enemies, hostiles, an invader core; reserve() is team.ts reserve():
                                                              paceJobs(Reserver, 225), 450 once our reservation > 450 ticks, none above 1000, never faster than 500 / free tiles around the controller,
                                                              none while hostiles are present or the controller is owned (the Reserver job attacks
                                                              a foreign reservation itself), and none until a live harvester of the mission stands in the
                                                              room (harvesterHere, 27 Oct 2026); no farmers.
                                                              Phase 2: planMetas() once the remote is visible (or planMetas(true) from the console):
                                                              RemotePlanner (metaremote.ts) saves rsrc/rroad metas into each room's meta memory and
                                                              memory.metas tracks room -> names; the rroads hold only traffic entries (per room the leg's
                                                              ends: storage -> border, border -> border, border -> beside the container; the controller
                                                              leg border -> controller on swamp only) and each room's MetaManager plans the roads;
                                                              drawMetas() while the remote room has > 1 of our construction sites (the metas and each room's traffic plan); windDown() removes them,
                                                              and each room's traffic replan removes our road sites left on dropped tiles.
                                                              schedulePavers(): PaveAll.request -> "PaveAll <room>" for any tracked unclaimed room with our
                                                              sites in view, unless one is already running.
                                                              harvest(): paceJobs(Harvester, (1500 - 50*route dist) / rsrc metas) while visible, no hostiles,
                                                              not foreign-reserved (civilians in remotes are paced, never replaced).
                                                              truck(): paceJobs(Trucker, min(1500, 1500 / (5*min(live harvesters, sources)*avg src cap / (avg carry * 1500 / (2*legSteps+10))))) only while a container in the room (any container) holds more than 500 energy (kTruckMinEnergy; 50 until 27 Oct 2026), so a dry room leaves the spawn queue to its harvesters;
                                                              same gates; 1500 while no trucker or no harvester is alive; legSteps = longest source leg from planning
         ├─ SkFarm           @register  (ms.skfarm.ts)         "SkFarm <room> <home>"; Source Keeper farm (Oct 2026): nJobs(Scout, 1) while the keeper room is out of sight (as Farm); paceNJobs(Skhunter, 1, 1450) `invaderless` (console, persisted): theRadar.observeBackground of the sector's 8 keeper rooms each tick and no Skharvester eggs while coreThreat (an invader core in one of them deployed or deploying within 3000 ticks, by sight else intel coreLvl) names a room; status() shows it. Core hold (any `invaderless`): coreHold = coreWithin([farm room], 1500) naming the farm room lays nothing but scouts (no hunter, vulture, harvester, trucker, prospector, wolf or guard), purges every other unhatched egg, and turns the out-of-sight scout into paceJobs(Scout, 3000); status() shows held:<room> (19 Oct 2026).
         │                                                     paceNJobs(Skvulture, 1, 1450), and while `harvesting` (console toggle, memory.noharvest; status shows `harvesting:off`) paceNJobs(Skharvester, 3, 1450) (not while an armed non-keeper enemy is in the room: `threatened`) and paceNJobs(Sktrucker, n, 1450) with n = source containers holding >= 500 energy (containers()),, and paceNJobs(Prospector, 1, 1450) while the room is visible with no armed non-keeper enemy, a Source Keeper tombstone lies within 5 of the mineral (if the room has lairs) and home holds under 50k of the mineral (prospect()), plus nJobs(Wolf, 2) while an Invader NPC creep with an active HEAL part is in the room (wolves(), healerInvaders()) and nJobs(Guard, 1) while `threatened` (guard()), from the home room: the hunter kills the keeper room's Source
         │                                                     Keepers one at a time (job.skhunter.ts), the vulture hauls the piles and tombstones home (job.skvulture.ts). With vision it picks
         │                                                     a spot per source and mineral (spots, heap only: the walkable tile beside it furthest by Manhattan distance from the nearest lair),
         │                                                     and keeps an rsrc meta (Meta_rsrc) per source spot in the room's MetaManager (ensureMetas; windDown removes them and
         │                                                     their sites) for Skharvesters (sourceMetas, HarvestMission). status(): keepers alive, the top one's hits, the spots
         ├─ Raze             @register  (ms.raze.ts)           "Raze <room> [home]"; nJobs(Razer, 1) until the razer decommissions (memory.decomm) or the room is
         │                                                     visible with no dozeableStruct another player owns (FIND_HOSTILE_STRUCTURES), then windDown() (purges an unhatched egg)
         ├─ StealReactor     @register  (ms.stealreactor.ts)   "StealReactor <core>" (Oct 2026, `StealReactor W15S5`): theRadar.observe(core) every tick; memory.home = the owned
         │                                                     room with spawns whose route to the core crosses the fewest rooms (pickHome, repicked every 100 ticks), the Rewalker
         │                                                     route home -> core is radar-observed each tick, and nJobs(Usurper, 1) no matter what while a home is picked (since
         │                                                     1 Nov 2026). Until then the egg waited on judge() with vision (reactor with thorium that is not ours, no creep with a
         │                                                     CLAIM part; armed enemies stopped counting 28 Oct 2026) setting memory.spawning, on the reactor not reading my at the
         │                                                     last look (memory.ours) and on every route room's intel staleness under 50 (routeStale); judge() is still made for
         │                                                     status(): the judgement, judged ripe/unripe, home, route length, stalest, usurper positions
         ├─ ThorSurvey       @register  (ms.thorsurvey.ts)     "ThorSurvey <room> [quadrant]" TEMPORARY (1 Nov 2026): theRadar.observe every non-highway room of the room's
         │                                                     sector (sectorRooms; a quadrant NW/NE/SW/SE halves it at the core row and column, both halves keeping those), and
         │                                                     for each in sight writes Memory.thorsurvey[room] (tick, thorium by structure type/pile/tomb/ruin/creep, total,
         │                                                     owner or reserver, rcl, thorium mineral amount). No creeps; status()/table()/lines() list rooms most thorium first
         ├─ CoreMiner        @register  (ms.coreminer.ts)      "CoreMiner <room> <home>"; a Scout per 1400 ticks for vision, one Prospector per 1450 from home
         │                                                     while wantProspector holds and the centre room has no hostile creep or invader core (Nov 2026).
         ├─ Loot             @register  (ms.loot.ts)           "Loot <room> [home]"; loots a beaten invader stronghold (Oct 2026): nJobs(Scout, 1) without vision;
         │                                                     with it nJobs(Canopener, n) with n = containers under a rampart that is not ours (coveredRamparts: dozeableStruct on the
         │                                                     container's tile) and nJobs(Looter, 1) while an uncovered container (openContainers) holds anything, leftover invader
         │                                                     creeps ignored, neither while an invader core still stands (cored); windDown() once every container is empty (`empty`; no containers
         │                                                     counts). status(): each container covered/open @x,y:held
         ├─ Nidoran          @register  (ms.nidoran.ts)        "Nidoran <room> [player]"; harasses a player's remotes (the player reserving/owning the center, args[1], in intel, or args[2];
         │                                                     memory.player). Every 50 ticks scans every room's intel into memory.reserved/claimed for that player; the mission room
         │                                                     (roomName = memory.active, default the center; paceJobs(Scout, 1500 - 50*dist to the center) keeps it in view) is a reserved room within 2 hops of the center by Game.map.findRoute
         │                                                     with the claimed rooms forbidden (no such route -> memory.bad, never tried again), stalest intel first; re-picked when
         │                                                     seen with 2+ armed defenders, seen without any road or container, or no longer reserved. paceJobs(Chaos,
         │                                                     (1500 - 50*dist)/2), dist = route distance from the nearest owned room (nearestHome) to the active room: ~2 at work
         ├─ Once             @register  (ms.once.ts)           "Once <Job> <room> [count]"; lays an egg of the job whenever none is alive until count
                                                              (args[3], default 1) have been laid (memory.laid), winds down once the last has spawned,
                                                              kills and deschedules itself when the creep and its tombstone are gone
         ├─ Always           @register  (ms.always.ts)         "Always <Job> <room> [perLife]"; Once that never winds down: paceNJobs(job, perLife
                                                              (args[3], default 1)), one egg per lifetime, never while one is unhatched; windDown() to stop
         ├─ InvaderCore      @register  (ms.invadercore.ts)    "InvaderCore <room> [home]" (5 Nov 2026); vision of the stronghold (theRadar.observeNow, else nJobs(Scout, 1)), then evolve()s into the
         │                                                     sibling for the core's level (3: "InvaderCoreThree <room> <home>"; any other level, or no core, is logged every 100 ticks and the
         │                                                     mission waits). Without a home the owned room with a spawn nearest by Rewalker.getRouteDist is taken.
         ├─ InvaderCoreThree @register  (ms.invadercorethree.ts) "InvaderCoreThree <room> <home>" (5 Nov 2026); kills a level 3 invader core and carries the stronghold's loot home.
         │                                                     watchCore(): the core as a TStruct (heap), memory.corexy/level/collapse while it stands, memory.deadAt the tick the room is
         │                                                     seen without it (a mission scheduled late adopts the core's ruin). Spot (memory.spotxy, findSpot): a PathFinder flee from the
         │                                                     core's tile to range 3 (the bunker's own tiles cost 1), ending on a standable tile at least 4 from every keeper lair and 3 from
         │                                                     every keeper tile the Rewalker tracks; +50 for a tile beside a rampart (the melee defenders hold the ramparts). Flag InvaderCore /
         │                                                     InvaderCoreN (memory.flag) on the spot, secondary red while the core stands and yellow after; moved by hand within 3 of the
         │                                                     core it moves the spot, anywhere else it is put back. coreDist (memory.coreDist): Rewalker.planBetween(home centre, spot)
         │                                                     .cost, offroad, once per spot. Siege: one drill (drillClass = Coredrillthree) while boostsShort() is empty (home terminal +
         │                                                     storage + labs hold every boost for one); askBoosts() only while a drill is an egg, a hatch or bare at home; a deploying or
         │                                                     invulnerable core is waited out; nJobs(Corecleaner, 1) once coreEta() (core hits + its rampart over the shot damage of the
         │                                                     drills within 3) <= coreDist + 100. Salvage (core gone): nJobs(Scout, 1); holders() = containers, ruins, tombstones and piles
         │                                                     within 3 of the core's tile holding anything, openLoot() those with no foreign rampart over them and an open tile beside them;
         │                                                     planTargets() every 20 ticks and the tick a listed one falls: accessMatrix (a blocked tile costs 1 + cleaner ticks / 8, an
         │                                                     enemy creep its ticks to live, the ramparts over loot containers free) -> ruinTargets = blockers on the cheapest path from the
         │                                                     spot to beside the core's tile, coverTargets = the container ramparts and the blockers of the other loot, all TStructs;
         │                                                     targets() = the live ones, the ruin's first. nJobs(Corecleaner, 1) while targets() is not empty; nJobs(Coresweeper, 1) once
         │                                                     accessEta() (0 with loot other than energy open, takeable(); else the ruin
         │                                                     targets' hits over the cleaners' dismantle power) <= coreDist + 150; a drill still an egg is purged; an armed
         │                                                     creep that is neither the Invader's nor a keeper schedules "Capture <room>" once (memory.capture); nothing but energy in sight (lootLeft(); energy piles under 200 are not loot at all) -> windDown.
         │                                                     tooFar (2 x coreDist + 100 >= a lifetime: no sweeper round trip) lays nothing at all. kill() removes the flag.
                                                                     First run (5-6 Nov 2026, shard2, W4N6 from W3N4, coreDist 205): the first drill died 8 ticks after reaching
                                                                     the spot: its walk rounded the bunker's corner beside a rampart, a defender crossed the bunker and hit it once
                                                                     (750 on top of the towers' 1800 is more than the TOUGH parts absorb), and without TOUGH the towers out-damage
                                                                     the heals; hence Rewalker.applyRampartReach. The second drill held the spot at full hits for 700 ticks (towers
                                                                     540 through the TOUGH against 624 healed; they refill from the core when empty) and took the 500k rampart and
                                                                     the 100k core at 840 a tick. The towers fired only at the drill: the cleaner waited one tile inside the room
                                                                     untouched. The core's ruin lasts until the stronghold collapses, not 500 ticks; defenders and towers do nothing
                                                                     once the core is gone, and the defenders keep their tiles. Three 500k ramparts took two cleaners; two sweepers
                                                                     and four trips carried home muscle 2, tissue 2, phlegm 171, cell 2 and ~3100 units of bars, composite, battery,
                                                                     crystal, ghodium_melt, liquid and oxidant. Cost: two drills and 1.17M credits of XLHO2/XKHO2 for the second.
         ├─ Assault          @register  (ms.assault.ts)        "Assault <room> <home>"; vision of the room (theRadar.observeNow, else nJobs(Scout, 1) from home), then with it in sight
         │                                                     counts the hostile towers and evolve()s into the sibling for that count (2: "AssaultTwo <room> <home>", 3: "AssaultThree <room> <home>"; a count with no
         │                                                     sibling is logged every 100 ticks and the mission waits). The scout goes along with the evolve.
         ├─ AssaultThree     @register  (ms.assaultthree.ts)   "AssaultThree <room> <home>" (1 Nov 2026): AssaultTwo with wickClass = Wickthree (job.wickthree.ts), for three-tower rooms;
         │                                                     every rule below is shared.
         ├─ AssaultTwo       @register  (ms.assaulttwo.ts)     "AssaultTwo <room> <home>" (31 Oct 2026); one boosted wick (wickClass: Wicktwo, job.wicktwo.ts) at a time against a two-tower room, from the home
         │                                                     Shields (1 Nov 2026): findStaging finding no path -> planBreach(): the locator again with opts.matrix = staging.ts hitsMatrix
         │                                                     (a blocked tile costs log10(hits) * 20, as the Bulldoze breach) and maxOps 50000; the staging position and entry come from
         │                                                     that path and its blocked target-room tiles are memory.breach (packed xys, walking order; memory.breachAt). targets() =
         │                                                     blockers(tile) of each breach tile (rampart first) then the towers and spawns, each once. watchBreach() every tick with
         │                                                     vision drops cleared tiles and, once the list is empty or 200 ticks old, replans: a plain path open again deletes the
         │                                                     breach, else a new one is listed; the staging position is kept. Unshielded it rechecks the plain path every 25 ticks (a shield can close again) and
         │                                                     cleared tiles stay in memory.cleared for 1500 ticks: a blocker back on one is relisted the next tick (watchCleared; W28N1 rebuilt its
         │                                                     breach rampart the tick it fell). `wicks` (persisted setter, default 1) = wicks kept alive. status shows `shielded breach:<n> planned:<age> cleared:<n> wicks:<n>`.
         │                                                     room's spawns and labs ("home" and "spawn" aliases = args[2]). Staging room (memory.staging): the target's neighbour
         │                                                     (describeExits) that is not unsafeStaging (rewalker.unsafeRoom: a hostile base with towers or a deployed core, by sight,
         │                                                     Rewalker memory or name; or foreignOwned by intel (owner and rcl > 0) and not seen within CREEP_LIFE_TIME; any neighbour
         │                                                     when all are) with the shortest Rewalker.getRouteDist from home; a hand-set one is kept (set memory.staging, delete
         │                                                     memory.route; memory.stageRoom != staging drops stagexy so the flag follows); memory.route = target + getRoute(staging, home). Staging position (memory.stagexy) and entry tile (memory.entryxy, the path's first tile in the target room) from
         │                                                     staging.ts findStaging over the listed targets, once, with the target in sight. Flags Assault/AssaultN (memory.flag) at
         │                                                     roomCenterPos(target) and the child staging_<flag> at the staging position, re-created when gone, moved back only when found
         │                                                     outside their room; secondary colour = mode (plan yellow, stage/retreat orange, attack red, pause purple); blue set by hand =
         │                                                     manual: no mode change, nothing laid, the wick stages. targets(): hostile towers nearest the entry first, then spawns (empty blind;
         │                                                     cached per tick). switchMode() every tick: plan while no stagexy; pause while the target's safe mode (memory.safeUntil, last seen)
         │                                                     has over 400 ticks left: handOff() donateAll to the nearest other AssaultTwo not paused (routes.dist), else memory.recycle so the
         │                                                     wicks recycle at their origin spawn; retreat while a nuke lands within 75 ticks (memory.nukeAt); else stage from any of those, and
         │                                                     stage -> attack once the staging room has been in sight with no militant creep (creep.enemy.ts isMilitant, keepers excepted) for 5
         │                                                     ticks (memory.quietSince) and a fighter waits within 5 of the staging flag, with no safe mode. recruit() (not plan/pause/manual):
         │                                                     tower-free and no safe mode -> nJobs(Ballerina, 1) once no wick is left, plus nJobs(Scout, 1) to draw fire and stomp sites; else
         │                                                     nJobs(Wicktwo, 1) only while boostsInStock() (home terminal + storage + labs hold each wanted boost for a full wick; status shows
         │                                                     `boosts:short ...`). askBoosts(): home.requestBoost for each wanted boost while a wick is an egg or hatch. Winds down once
         │                                                     finished(): no hostile structure left but ramparts, controller, keeper lair, portal, power bank, invader core, after donateAll
         │                                                     to the nearest sibling (nearestSibling) so the fighters go on. Vision: observeNow
         │                                                     target + observeBackground staging while the radar has an observer, else nJobs(Scout, 1) while the target is out of sight.
         │                                                     boostRanged (persisted setter) adds XKHO2 to the wick's boosts. kill() removes both flags.
                                                                     Season 11 results (31 Oct 2026, from W27S4): against two-tower RCL6 rooms one wick killed both towers in ~50 ticks at full
                                                                     hits; two rooms popped safe mode the tick their spawn was hit (hence spawns spared while a tower stands, and the wick
                                                                     leaving a safe-moded room by its nearest exit: the first wick died walking the home route under fire); two more lost
                                                                     towers and spawn with no safe mode, one cleared to its ramparts in ~900 ticks.
         ├─ Capture          @register  (ms.capture.ts)        "Capture <room>"; pause()/resume() (memory.held; status shows `held`): no crow or scout eggs, eggs purged, flags and living crows kept, observer and radar left alone; ReactorDepot no longer pauses it (it did while cold, until 1 Nov 2026); takes a room with Crows (job.crow.ts). First run picks the owned RCL7+ room with a spawn nearest the target by
         │                                                     route (routes.dist) and keeps it (memory.home; "home" and "spawn" aliases, so every egg spawns there); the staging room (memory.staging)
         │                                                     is route[1] of memory.route = routeHome(): Rewalker.getRoute(target, home), or with memory.core set findRoute on Rewalker's routeCallback prices with the core room at Infinity; watchCore() keeps memory.core = the first target neighbour with an invader core deployed or deploying within 1500 ticks (sight, else intel coreLvl; the remembered room sticks while out of sight) and on a change drops route and staging so they are picked again (19 Oct 2026); a hand-set staging is kept. Flags: Capture (CaptureN when taken; a free one already in the target room is adopted;
         │                                                     memory.flag) at roomCenterPos(target), red, and its child staging_<flag> (grey/red) 5 tiles into the staging room along a PathFinder path
         │                                                     from the target centre to the home centre over the Rewalker route and matrices (the staging centre when the path misses the room);
         │                                                     each is re-created when gone and moved back only when found outside its room, so hand-placed spots stand; kill() removes both.
         │                                                     Power = active RANGED_ATTACK x RANGED_ATTACK_POWER (no boosts, no towers); the enemy's is measured from the target room's
         │                                                     non-keeper enemies while visible and kept in memory.power for blind ticks. recruit(): one crow egg at a time while
         │                                                     ourPower (living crows' active parts + a full crow per hatch and egg) <= enemyPower, so an empty room draws one crow.
         │                                                     Mode (memory.mode, Crow.init drops the task on a change): staging -> attack when the crows within 5 of the staging flag outgun the
         │                                                     enemy (stagedPower > enemyPower); attack -> staging when the crows in the target or staging room (availablePower) fall under half the
         │                                                     enemy's. Vision: while theRadar has an observer, theRadar.observeNow(target) and observeBackground(staging) every tick (20 Oct 2026; the home observer pointed directly was re-pointed by theRadar.run the same tick),
         │                                                     no radar observer: nJobs(Scout, 1) while the target is unseen; the target's neighbours (describeExits) go to the radar every tick, theRadar.observe while memory.tenemies > 0 there, theRadar.observeBackground otherwise. status(): mode, rooms, flags, powers
         ├─ Xfer             @register  (ms.xfer.ts)           "Xfer <to> <from> [n]"; paceNJobs(Fedex, n (args[3], default 2)) from the <from> ("home", args[2]) room's spawns, carrying
                                                              energy from its storage to <to>; windDown() once the home storage is under 50k energy (0 with
                                                              memory.takeitall, set by `takeitall = true`) or <to>'s storage is over 75% full
         ├─ PaveAll          @register  (ms.paveall.ts)        "PaveAll <room>"; paceNJobs(Paver, n, 1400) while Game.constructionSites has any of ours in the
                                                              room (works without vision), n = 2 while the room's traffic plan has 20+ road tiles unbuilt (unbuiltRoads, needs vision; status `unbuilt:<n> pavers:<n>`; 27 Oct 2026), else 1, and none while armed hostiles are in the room; guard(): paceJobs(Guard, max(1500 - thostiles, 350)) once armed hostiles have been in the room 100 ticks (Farm.suppressGuard's rule; status `hostiles:<n>/<t>t`; 27 Oct 2026); windDown() once none are left for 60 ticks (1500 while the plan still has unbuilt road tiles in view: sites come and go between the 10-tick placement passes once two pavers outbuild them, and windDown purges eggs; status `nosites:<t>`; 27 Oct 2026); requested by Remote and Startup;
                                                              50 ticks (kDonateIdle) after the sites ran out (memory.idleSince, status `idle:`), every paver with
                                                              more than 100 TTL (kDonateTTL) is donated (Mission.donateCreep) to the adjacent room's PaveAll
                                                              (describeExits) that is active (not winding down, with sites) with the most sites, if any;
                                                              sites back while winding down -> revive(): windDown, tombs and idleSince cleared, pace timer kept
         └─ Startup          @register  (ms.startup.ts)        "Startup <room>"; claims and boots a room: nJobs(Scout, 1) while the room is invisible;
                                                              nJobs(Claimer, 1, 600) while the controller is not ours and owned rooms < GCL, and meanwhile
                                                              paceNJobs(Pioneer, 2) and feedRoom() if nobody owns or reserves the room and it has saved metas (`canPioneerEarly`;
                                                              ActiveStrat places the road/container sites, status shows `early`), and nJobs(Guard, 1) while an
                                                              enemy creep (room.enemies, armed or not) is in the unowned room;
                                                              while ours and below RCL4, paceNJobs(Pioneer, 2) (hardcoded kPioneers per lifetime); while ours, feedRoom(): with a storage of ours in the room, paceNJobs(Fedex, 2) (Xfer's kDefaultCount) while the home storage holds more energy than it (XferStartup's rule); without one, paceNJobs(Fedex, n) while the home storage holds 50k+ energy (Xfer's kHomeFloor); both only while no armed hostile is in the room: n = the non-source containers (`fillConts()`, container mode != "src") holding under 500 energy (kHungryCont, `hungryConts()`) once the room has such a container, else the pioneers standing in the room (`pioneersHere()`); the fedexes fill the containers (JobCreep.unloadStore, which skips source containers since 20 Oct 2026), and hand their loads to the pioneers while the room has no store with room, Fedex.donate; status shows `pioneers:<n> hungry:<n>/<conts> [storage:<dest>/<home>] fedexes:<n>`) and nJobs(Guard, 1) while the room has no tower,
                                                              spawned outside the room; while ours and below RCL3 (kHarvesterRCL), nJobs(Harvester, one per
                                                              asrc/bsrc meta of the room: `sourceMetas()`, none until genesis has planned) from the home room,
                                                              drop-mining on the planned container tiles; at RCL3 no more are laid and the living ones work on; at RCL4 no more pioneers, but the fedexes go on until the room has a terminal of ours (20 Oct 2026), then windDown(): the living creeps live
                                                              out their lives, then the mission kills and deschedules itself. Distinct from
                                                              the `Startup` job class (separate registries).
                                                              "Startup <room> [home]": while not ours and GCL is full (owned rooms >= gcl.level) no
                                                              claimer; instead `planRoad`: PathFinder controller -> home spawn (home = args[2], else the
                                                              nearest outside spawn's room) on a `RoadPlanner` (roadplan.ts: the shared road weights
                                                              8/12/24, harvest spots and keeper lairs dear, rooms other players own impassable), kept in
                                                              memory.road as a Rewalker `Path`, replanned every 500 ticks and drawn (yellow dashed) while
                                                              the mission room has >= 2 of our construction sites; `replanRoad()` drops it; status adds `gcl:` and `road:<tiles> via:<rooms>`.
                                                              While GCL is full and the room is free (no owner, no reservation) it sets the room's prebuild level
                                                              (MetaManager.setPrebuild(kTrafficLevel), ManagerMem.prebuild, status `prebuild:3`): ActiveStrat then
                                                              places and the pavers keep every planned road up to that level, not just the level-0 stub, so the
                                                              genesis roads go in ahead of the claim; cleared when GCL has room, someone else holds the controller,
                                                              the room is ours, or at windDown. While prebuilding, paceJobs(Reserver, reserveHoldPace(room)) holds the
                                                              reservation exactly as Remote does (job.reserver.ts: 225 ticks, 450 above 450 ticks held, none above
                                                              1000, at least 500/controller spots; none with armed hostiles). Our own reservation no longer blocks
                                                              `canPioneerEarly` or the prebuild (a foreign one still does).
                                                              Only the head of the path, the tiles within 3 (kRoadRange) of the controller, becomes road
                                                              (since 26 Sept 2026; sources and the way home are the genesis metas' business): one traffic
                                                              entry in a `Meta_rroad` named `rroad_<room>_startup` in the mission room (tracked in
                                                              memory.roadMetas, status `metas:<rooms>`), from the stub's far end to the controller (level 0,
                                                              unlike a remote's swamp-only leg: pioneers upgrade it); the room's MetaManager plans the road and ActiveStrat/ClaimedStrat
                                                              place the sites; a changed replan replaces it in place, windDown() and `removeRoad()` delete it
                                                              and the room's traffic replan removes our road sites left on dropped tiles. The mission room
                                                              gets "PaveAll <room>" while unowned with our sites in view
                                                              (`schedulePavers`, as Remote). The plan lays every room's other metas over the
                                                              Rewalker matrix (`metaCosts`: planned structures and spots impassable, planned roads,
                                                              the traffic plan's included, cost 1) so it never crosses the base plan; `replanRoad()`
                                                              redoes it at once, owned room or not. Our road metas do not make `canPioneerEarly` true. An invader
                                                              core in the mission room draws paceJobs(Wolf, 1500) (`suppressInvaderCore`, status `core!`).
                                                              With GCL full and a foreign reservation on the controller (status `reserved:<user>/<ticks>`),
                                                              `reserve()` paces Reservers as Farm does (one per controller spot per CLAIM lifetime, none
                                                              while the live reservers' CLAIM x ttl covers it or armed hostiles are in the room).
MyCreep                      wrapper object per creep *name* (mycreep.ts); not a prototype extension
 └─ JobCreep                 knows its Mission; Rewalker movement helpers (job.creep.ts)
     ├─ Startup  @register   body table keyed by energyCapacity      (job.startup.ts)
     │   └─ Pioneer @register (job.pioneer.ts) startup for another room, laid by the Startup mission: same body table capped at 6
     │                       WORK/CARRY pairs, spawned via the "remote" strategy (nearest spawns outside the mission room), and
     │                       init() sets memory.home to the mission room so roleBootstrap works there (rolePioneer in role.bootstrap.ts)
     ├─ Reboot   @register   priority 10, body from energyAvailable   (job.reboot.ts)
     ├─ Scout    @register   [MOVE] from the "home" room if any, walks to the mission room (job.scout.ts); there, shadows the
     │                       armed hostiles (not keepers): 5 from any with RANGED_ATTACK, 3 from melee-only; idleFlee when
     │                       inside, else closes on the one with least slack (distance - range) and holds at 0; with no
     │                       hostiles, walks onto the nearest foreign construction site to stomp it (not under ramparts or
     │                       obstacles, not while the owner's controller is in safe mode)
     ├─ Paver    @register   (job.paver.ts) port of role.paver.ts; body 'farmer' via the "close" spawn strategy, only once that room holds >= 550 energy; shield(): while its legacy build task (memory.task) is on a road/container site and an enemy creep (not a keeper) is within 4 of it, stands on that site (reached with moveChase) so the enemy cannot remove it, unless one of our creeps is on it already (after armed hostiles are fled, before the task resumes); an empty paver drops its build task first; three modes in memory.pmode:
     │                       work (walk to the mission room, taskBuildAny, then taskRepairOrdered on roads/containers; empty -> gather or forage),
     │                       gather (mission room is not SK and has a source: taskRechargeHarvest there until full), forage (SK room or no source:
     │                       walk the Rewalker route toward memory.home taking the nearest piles >= 50, tombstones, ruins, our stores or a
     │                       non-SK source in each room, nothing within 5 of a lair; taskRechargeHarvest at home as last resort; full -> work);
     │                       after(): idleNom + idleBuild|idleRepairAny; spawned by PaveAll
     ├─ Harvester @register  (job.harvester.ts) per-tick logic in init() via decide()/perTick, start() "wait" (14 Oct 2026); port of role.harvester.ts for Remote (and Startup below RCL3); donatable() 0 (takes nothing off a passing trucker); 6W/1C/3M from "home" (falls back to the nearest spawns) (floor 3W/1C/2M); claims a source meta
     │                       from the mission's `sourceMetas()` (HarvestMission: Remote's rsrc metas, Startup's asrc/bsrc metas; targetid() = the source, myspot = the container tile)
     │                       (memory.rsrc; if all are claimed it shadows the harvester with the fewest ticks to live), stands on the
     │                       container tile drop-mining; lays the container site itself when the spot has neither container nor site (the genesis asrc/bsrc meta holds its container back until the room has a spawn, Meta_asrc.findSite, and a full harvester on a bare spot stood idle: W28S8, 15 Oct 2026), builds it and repairs the container, withdrawing from it for that;
     │                       after() idles (nom/build/repair) only while inside the mission room
     ├─ Trucker  @register   (job.trucker.ts) port of role.trucker.ts for Remote; 2 CARRY per MOVE from the nearest spawns (closeSpawns, offroad
     │                       when empty); loads from a container in the remote room picked by pickCont(): the ones holding a full load (our free capacity), else those over 50, else any, and within that tier the cheapest walk (Rewalker.planWalk over all), cached in memory.contid while it stays in the best tier, and walked to from any room once the remote is in view, so a route that crosses another room is not undone by a walk to the room centre (sweeps dropped energy), once more than half full unloads
     │                       at home until empty (JobCreep.unloadHome); after() idleNom picks up adjacent energy
     ├─ Fedex    @register   (job.fedex.ts) extends Trucker for Xfer, XferStartup and Startup (one per pioneer in the room); CARRY, CARRY, MOVE x 17 (33 CARRY) sized to the home room's capacity, home spawns only; in the home room fills to full from the storage;
     │                       anywhere else any load latches deposit mode: unloadHome(mission room) (storage, terminal, containers); then (no store with room) @task donate(taker): the nearest creep of ours taking 50+ (MyCreep.donatable; the most-taking among the equally near, pickTaker) is walked to and fed until it takes no more, then the next, else taskTransferResources, else with no container at all holdNear (wait beside the nearest WORK creep; the pile once nobody is left or the mission winds down), else the controller pile;
     │                       init() does the retreat/flee every tick (the `fleeing` flag: start() and donate move nothing that tick); donate is the first method on the fixed @task (15 Oct 2026): memory.task2 = {name: "donate", id: 1, args: [the taker's id]} until it answers "start";
     │                       empty in the mission room with ttl under 2 x memory.tripLeg + 30 it recycles at a spawn there; while the mission winds down it delivers, then recycles
     ├─ Bulldozer @register  (job.bulldozer.ts) 1 WORK per MOVE (25W/25M at full energy, 2:1 until 14 Oct 2026); boosts XZH2O at home when a lab has it ready (never waits); planWalk over mission.dozePositions() at range 1, @task doze(xy, room) dismantles the tile (rampart first)
     ├─ Razer    @register   (job.razer.ts) the Bulldozer body (job.bulldozer dozerSpawn, spawns nearest home); in the Raze room @task dismantle the dozeableStruct with the cheapest walk
     │                       (planWalk over targets(); rampart on the tile first), then walks onto the foreign sites (job.scout stompable); idle `idleTicks` (kIdleTicks, 10) -> memory.decomm,
     │                       @task decomm = JobCreep.recycleAt(originSpawn()): the spawn that hatched it (memory.nest, else a home spawn) and recycleCreep, suicide with none; a foreign safe mode counts as nothing to do
     │   └─ Canopener @register (job.canopener.ts) fixed WORK, WORK, MOVE x 16 (32 WORK, 4000) from the home room with the full cost (JobCreep.readySpawn); targets() = the Loot mission's
     │                       coveredRamparts (the ramparts over its containers), stomp() nothing, idleTicks 1 (recycles the tick no covered container is left); fleeKeepers first
     ├─ Chaos    @register   (job.chaos.ts) fixed [4 MOVE, WORK, MOVE] (350) from the "close" spawns of the Nidoran mission room (closeSpawns: within a hop of the nearest, e.g. W27S5 and W25S7 for W23S4), the first free one with the energy; walks to that room and @task dismantles
     │                       chaosTargets (not ours, has hits, not wall/rampart/core/bank/lair/portal), the one furthest from its sibling chaos in the room (nearest to itself
     │                       among equals; nearest when alone); flees armed creeps (not keepers) within 5 until all are 7 away (idleFlee, up to 2 rooms but never into a
     │                       hostile-claimed room), which also interrupts the dismantle task, and holds 3 ticks (memory.fled) before heading back to the active room; under 100 hits or 100 TTL walks into the nearest owned room (memory.retreat) and stays; a foreign safe mode is nothing to do; after(): idleDismantle, in any room not ours or reserved by us
     │                       within 2 (linear) of the mission room, dismantles an adjacent chaosTarget (most hits first) when the melee/range (WORK) intents are free; a road being dismantled is also stepped onto (plain move) so a chaos never sits on an exit tile
     ├─ Konmari  @register   (job.konmari.ts) CARRY/MOVE pairs like Swiper; loads worthless resources (catalyzed boosts and the stock-ruled resources the trader manages excepted, swipeworth.junkIn) from the home storage then terminal, walks towards the
     │                       Swipe target and drops 20 units per tick while outside the home room; empty -> home for more; nothing worthless left -> suicide
     ├─ Swiper   @register   (job.swiper.ts) CARRY/MOVE pairs from the spawns nearest home (JobCreep.homeName: mission
     │                       "home", else "spawn", else the nest's room, else a random spawn's, so "Once Swiper <room>" works), sized to energy on hand (max 50 parts);
     │                       loots the Swipe target through swipe.ts's questSwipe (shared with Furiosa) with targets by path: the cheapest-path non-own structure holding anything worth taking (one Rewalker.planWalk over all candidates, kept while it still qualifies), one resource at a time in random order
     │                       (nuker excluded; rampart-covered or unreachable ones skipped 1500 ticks via memory.swipe.skip) until full, or until the room is empty and it holds anything,
     │                       then unloads at home until empty (swipe.deliverHome: storage, terminal, else the home container with the most space, else dropped at the controller); after() nomNearby,
     │                       picking up only what is neither worthless nor outside the mission's worth (no energy under ignoreEnergy); empty at home while the mission reports
     │                       its route held (Swipe.guardedBy) it waits within 4 of the middle tile of the home exit toward the target (waitByExit) instead of leaving; with no
     │                       CARRY part left it suicides (ERR_FULL forever otherwise)
     ├─ JobCreep.unloadLatch/unloadHome  (job.creep.ts) shared by Trucker and Swiper: latched (memory.unload) until empty; walks
     │                       straight to the home storage, else terminal (ours, with space), else the home container with the most free
     │                       space (memory.dropid), then the next; every transfer passes what fits; null when home has no space
     └─ JobRole              bridge to legacy roles: start() calls creep.run()/after() (job.role.ts)
         ├─ Worker  @register              (job.worker.ts)
         ├─ Ctrl    @register              (job.ctrl.ts)   pure job (no role.ctrl.ts, no boosts): ctrl spot, fill from an adjacent store to one upgrade's worth (empty: carry nudge so the withdraw feeds the same tick's upgrade), upgrade; ecap rules; spawns only with the room full (energyAvailable >= min(capacity, 5000))
         ├─ Hub     @register              (job.hub.ts)    needs storage + meta 'hub' spot
         ├─ Hauler  @register  priority 9  (job.hauler.ts) energy = min(2500, ecap/2)
         ├─ CtrlHauler @register priority -1 (job.ctrlhauler.ts) storage -> Meta_ctrl container shuttle; body 'hauler' (<= 1500 energy, local);
         │                                                 want(mission) = 1 only while storage energy >= 100k, the ctrl container exists and is empty,
         │                                                 and the mission's ctrl creep is empty (else 0); after() idleNom
         ├─ Hubminer @register             (job.hubminer.ts) ordinary mineral miner, the job-layer replacement for role.mineral.ts; Hub/Thorhub lay nJobs(Hubminer, Hubminer.want(room)):
         │                                                 1 while the room's Meta_min extractor stands (ours) on a non-thorium mineral with mineralAmount > 0 and storage + terminal hold under 100k of it; stands on the meta's 'mineral'
         │                                                 spot (the container tile) and drop-mines into the container, skipping any tick the container's free space is under one
         │                                                 harvest (info.mineral); the mineral is the one under the meta's extractor, type-checked every tick, never the room's first mineral;
         │                                                 body 2 WORK per MOVE up to 32/16 (4000) sized to room capacity, from the room's own spawns only and only with the full cost in
         │                                                 hand; mined out it recycles at the nearest spawn
         ├─ Hubminecart @register          (job.hubminecart.ts) Chemist subclass: the cart behind the Hubminer; [CARRY, CARRY, MOVE] x 3 (450) from the room's own spawns;
         │                                                 Hub/Thorhub lay nJobs(Hubminecart, Hubminecart.want(room)): 1 while the Meta_min container holds anything, 2 past half full;
         │                                                 empty: withdraw from that container; loaded: Chemist.deliver (a lab wanting it, else terminal, else storage); empty under
         │                                                 50 TTL, or with container and mineral both empty, it recycles at the nearest spawn
         ├─ Chemist @register              (job.chemist.ts) pure Task2 port of role.chemist.ts (overrides start()); Hub mission only, Chemist.want(room) = 1 with a terminal and a lab;
         │                                                 body 'chemist' (10C/5M, local). Empty: @task drain a lab whose mineralDrain() says so, energy for a claimed boost lab under 1000 (1 Nov 2026), fetch a lab's planType (labWant: up to 800, 2400 boosting; claimed boost labs first, emptiest first, then reaction labs emptiest first)
         │                                                 from terminal then storage, fetch lab energy from the richer depot (> 5k), fetch G for the nuker, @task gather stray non-energy (nearest pile/tombstone/ruin/container; sets memory.stray); loaded: @task fill the lab/nuker wanting it, else stash in terminal/storage (storage first for a gathered load)
         ├─ Upgrader @register priority -1 (job.upgrader.ts) port of role.upgrader.ts; surplus sink: taskRecharge then goUpgradeController,
         │                                                 after() idleNom + idleRecharge; body 'upgrader' (2W/1C per level) via "local";
         │                                                 Upgrader.want(room) = 0 at RCL8, without storage, or below 100k, else storage energy / 100k (linear, fractional: 150k = 1.5)
         ├─ Farmer  @register              (job.farmer.ts) port of role.farmer.ts; Task2 start() calls legacy task* helpers
         ├─ Wolf    @register              (job.wolf.ts)   port of role.wolf.ts; Task2 @task fight/retreat, body 'wolf' via "close"; fight() closes on its target, creep or structure, with moveChase;
         │                                                 pickTarget(): armed hostiles, then an invader core, then any enemy creep (never Source Keepers), from the mission room first while it is in view
         │                                                 (from anywhere) and only then from the room the wolf is in; a target in another room is walked to with moveChase (a creep is tracked so
         │                                                 pursue() follows it if it leaves); with no target it pursues lastTarget (the creep it last fought: to it while visible, else to where it was last
         │                                                 seen and over the exit it left by), then walks to the mission room and holds near the centre
         ├─ Guard   @register              (job.guard.ts)  port of role.guard.ts; Task2 @task hunt/duel/healCreep/retreat, kites melees via idleFlee;
         │                                                 picks its fight in the arena (the mission room while visible from anywhere, else its own room; Source Keepers are never targets, arenaEnemies/arenaMelees/potshots, so SkFarm's guards work in a keeper room): without vision it walks to the room first, with vision it heads straight for its target from wherever it is and only walks to the room when nothing there needs it;
         │                                                 engage() shoots and closes to range 2 (3 on a melee target, since kite backs off at 2; 2 while that melee is fatigued, for the 10 damage instead of 4); an unarmed target (no active ATTACK or RANGED_ATTACK) is chased with moveChase instead, to range 1 and then a step at it every tick; pickEnemy(): the closest enemy, but civilians are left out (and a hunted civilian dropped) while a disarmed fighter is present (not hostile, body built with ATTACK, RANGED_ATTACK or HEAL); order with no melee about: armed enemies and disarmed fighters, then healing a hurt friendly (healCreep, dropped when a fighter shows up; pickHurt and after() heal our fighters with ATTACK or RANGED_ATTACK parts before civilians, heal.ts healPick), then civilians (dropped for a hurt friendly);
         │                                                 with nothing to do hold() drifts to within 3 of the room centre (RoomIntel.centerPos), but only after 3 idle ticks
         │                                                 (memory.gidle) so a friendly flickering on an exit draws it over instead of resetting it;
         │                                                 body 'guard' via "remote": room capacity >= 550, energyDef scales T/RA pairs to energy available (spawning.md)
         ├─ Micro @register                (job.micro.ts)  [RANGED_ATTACK, MOVE] from the nearest spawn; suppress.ts suppressMicro (Farm, Remote, Hub, Thorhub): paceNJobs(Micro, 1) once tenemies >= 50 with no hostiles; targets only enemies without RANGED_ATTACK; remembers its latest target (EnemyCreep) and, with it out of sight for under 100 ticks, waits beside the tile it was last seen on in this room (lurk) before drifting back to the room centre (hold), so a scout bouncing on an exit gets shot on its next bounce
         ├─ Skhunter @register             (job.skhunter.ts) init(): swing() (the melee/heal intents) then the per-tick logic in decide()/perTick, start() "wait" (14 Oct 2026); Source Keeper hunter for the SK farm (ms.skfarm, to come); fixed body 25 MOVE, 20 ATTACK, 5 HEAL (4100; heals at the tail so they survive a keeper fight) from the
         │                                                 mission's home room, else the spawns nearest the mission room, only one with the energy now; init() every tick before the tasks: attack an
         │                                                 adjacent enemy, else self-heal while hurt or an enemy is within 3, else idleHeal; then flee (idleFlee to 5) while a ranged non-keeper hostile is within 4, hunt or not; else stalk the keeper with the most hits at range 4 until
         │                                                 full (a self-heal issued this tick with heal power >= hurts counts), then @task hunt it beside it until it is dead; no keeper alive: the
         │                                                 lair with the fewest ticksToSpawn, range 4 until full, then beside it. Test with `Once Skhunter W25S6`
         ├─ Skharvester @register          (job.skharvester.ts) Harvester subclass for the SK farm: fixed body 4 MOVE, 8 WORK, 1 CARRY (1050) from the Harvester's spawn pick; claims SkFarm's rsrc metas (sourceMetas), walks with memory.rewalksk; flee() first
         │                                                 each tick: fleeKeepers (exported, shared with Sktrucker: a keeper within 5 -> idleFlee to 6, a keeper at 6 -> hold still so it does not bounce between 5 and 6, a lair within 5 with ticksToSpawn < 4 -> flee to 6), then the Harvester's retreat and
         │                                                 a flee from non-keeper hostiles; the container site, mining, building, repair and the
         │                                                 container top-up are Harvester.work/after. Laid by SkFarm: paceNJobs(Skharvester, 3, 1450)
         ├─ Sktrucker @register            (job.sktrucker.ts) per-tick logic in init() via decide()/perTick, start() "wait" (14 Oct 2026); SK farm hauler: [CARRY, MOVE] x 25 (2500) from the home room (else nearest), full cost in hand; SkFarm paces
         │                                                 paceNJobs(Sktrucker, n, 1450) with n = farm containers holding >= 500 energy; walks with memory.rewalksk; each tick: fleeKeepers
         │                                                 (shared with Skharvester: keepers within 5 fled to 6, hold at 6), then full or under 50 TTL with a load -> unloadHome (latched), under 50 TTL empty -> wait at home,
         │                                                 else withdraw from the farm container with the most energy (none: wait within 3 of the room centre); after(): idleNom outside home.
         │                                                 Overridable pieces for Looter: containers, loadOf, fetch, flee, retire, retireTTL
         │   └─ Looter  @register            (job.looter.ts) a Sktrucker for the Loot mission: containers = Loot.openContainers, loadOf = everything held, fetch withdraws the largest
         │                                                 stack, flee = dodgeKeepers only (invaders ignored), retireTTL 100, retire = home then JobCreep.recycleAt(originSpawn())
         ├─ Usurper  @register             (job.usurper.ts) [MOVE x5, CLAIM] (850) from the StealReactor home (JobCreep.readySpawn); memory.usurp "claim": walk to the core, beside
         │                                                 the reactor claimReactor until it reads my (report logs each code); "die": memory.grave = the first Kind.SourceKeeper
         │                                                 exit room, memory.rewalksk on (walk drops the keeper layer), walk there and up to the nearest keeper; none: wait at the centre
         ├─ Prospector @register           (job.prospector.ts) mineral miner: [WORK, CARRY, MOVE, MOVE] units up to the home room's capacity (max 12), WORK first, CARRY, MOVEs
         │                                                 last (damage costs mining before speed; never slowed loaded), from the home room's spawns with the whole cost in hand; donatable 0;
         │                                                 memory.rewalksk and fleeKeepers (shared with Skharvester) when the mission room is a keeper room (intel.roomKind); goes home to unload
         │                                                 when every WORK is broken (then recycles) or an armed non-keeper enemy is in the mission room; full, or under 100 TTL with a load ->
         │                                                 unloadHome (latched); empty at home under 200 TTL -> recycle at the nearest spawn; else stands on the mission's mineralSpot()
         │                                                 (ProspectMission; beside the mineral without one) and harvests the room's non-thorium mineral (ERR_TIRED = extractor cooldown, ignored).
         │                                                 Laid by SkFarm.prospect() and Reactor.prospect(): paceNJobs(Prospector, 1, 1450) while wantProspector(room, home) (exported: no armed
         │                                                 non-keeper enemy, mineral left, a keeper tombstone within 5 of the mineral when the room has lairs, home under kMineralStock 50k of it)
         ├─ Skvulture @register            (job.skvulture.ts) per-tick logic in init() via decide()/perTick, start() "wait" (first init port, 14 Oct 2026); SK-room scavenger for the SK farm; [CARRY, MOVE] x 17 (1700) from the home room (else the nearest spawns), only with the
         │                                                 full cost in hand; walks with memory.rewalksk while looting and with the keeper layer back on (cached path dropped) when carrying home or retiring (avoidKeepers). Each tick: flee (idleFlee to 5) while a keeper or an armed non-keeper enemy is within 4; full, or under 100 TTL with a
         │                                                 load, carry it home (unloadHome, latched by memory.unload; dropAt the controller when home has no store); under 100 TTL and empty, wait
         │                                                 in the home room; else loot the locked target (memory.vid + vkind pile|tomb: pickup beside a pile; from a tombstone withdraw one resource a tick, the largest boost compound first, then energy; only energy and BOOSTS compounds, never thorium or raw minerals), re-picked only when
         │                                                 the id goes bad (gone or nothing lootable) as the largest of the mission room's energy piles (by energy) and tombstones with loot (by lootable store); else follow the mission's Skhunter
         │                                                 within 2, else sit within 3 of the room centre; outside home, after() idleNoms energy within reach. laid by SkFarm (paceNJobs(Skvulture, 1, 1450))
         ├─ Pup @register                  (job.pup.ts)    Wolf with memory.size ATTACK + MOVE pairs; suppress.ts suppressPup (same missions): paceNJobs(Pup, 3) while enemies with HEAL and no hostiles are in the room, size = ceil(heal power / ATTACK_POWER / 2) set on the egg
         ├─ Wickthree @register            (job.wickthree.ts) AssaultThree's fighter (1 Nov 2026): Wicktwo on 6 TOUGH, 10 MOVE, 21 RANGED_ATTACK, 13 HEAL (6960; the 50-part cap, so
         │                                                 not the 22 RANGED_ATTACK asked for) with static boosts() = XZHO2 on the MOVE first (nearSpawn) then Wicktwo's, and
         │                                                 spawnNearLabs = true. Nothing else of its own.
         ├─ Wicktwo @register              (job.wicktwo.ts) AssaultTwo's fighter and the wick family's base (31 Oct 2026): fixed 4 TOUGH, 25 MOVE, 12 RANGED_ATTACK, 9 HEAL (5340) from the home room (readySpawn;
         │                                                 with the subclass's spawnNearLabs a home spawn with a lab within 2 when any has, and spawnDirections() (read by spawn.ts
         │                                                 runSpawns) steps the hatchling out beside the lab holding or claimed for its first boost),
         │                                                 priority 3. start(): escape() first: in a foreign room in safe mode (every action of ours but moving is blocked there,
         │                                                 healing included) with a hostile tower, a PathFinder step toward the nearest exit over the Rewalker matrix; then at home with a wanted boost missing (XGHO2 on TOUGH, XLHO2 on HEAL, XKHO2 on RANGED_ATTACK when the mission's
         │                                                 boostRanged is on; the subclass's static boosts(ranged) in the order taken) -> boost(): a MOVE boost heading the missing list is
         │                                                 asked for alone (requestBoost(boost, nearSpawn): struct.lab.ts picks the free lab nearest a spawn) until it is on; else
         │                                                 room.requestBoost for each missing one every tick and boostCreep at a lab holding enough mineral
         │                                                 and energy for the bare parts, waiting beside the first lab otherwise; mission.recycling -> recycleAt(originSpawn); mode attack
         │                                                 (and not manual) -> attack(): walk into the target room; there, the mission's targets() clear the own-target ids; a working melee
         │                                                 within 2 is fled to 3 (idleFlee); the walk goes to targets()[0] (range 1; beside a structure target reposition(): of the tiles
         │                                                 within 1 of it we could stand on (standable: inside the edge, no wall, no obstacle or hostile rampart, no other creep) the one
         │                                                 with the highest massDamage(pos), moved to when it is equal to or higher than from here, nearest of equals; equal tiles may
         │                                                 be traded tick by tick, by design) else ownTarget(): the kept creep (creepId) while in the
         │                                                 room, else the militant with the least hits + rampart hits (coverHits), else the kept structure (structId), else the structure
         │                                                 with the least hits (structures(): not ours, hits > 0, no road/controller/lair/portal/power bank/core; containers only once nothing
         │                                                 else stands); nothing -> hold within 3 of the mission flag; any other mode -> stage(): engage a militant in the staging room,
         │                                                 else wait within 5 of the staging flag. after(): fire() the ladder (listed target in range 3; else nearest militant not under a
         │                                                 rampart over 10k, active first; an adjacent focus is mass-attacked when massDamage() >= a shot; else mass when it beats a shot
         │                                                 at the weakest structure in range, else that shot; outside the target room militants only; while a hostile tower stands the
         │                                                 spawns are spared: never the focus or the weakest, and no mass attack with a spawn within 3, since the trial rooms popped safe
         │                                                 mode the tick their spawn was hit), then healSelf while a tower with
         │                                                 energy is in the room and we are whole, else heal.ts healIdle with overheal while an enemy creep is within 3.
         │   └─ Ballerina @register        (job.ballerina.ts) Wicktwo on the Crow body with wantedBoosts() = []: laid by AssaultTwo once the target is tower-free.
         │   └─ Coredrillthree @register   (job.coredrillthree.ts) InvaderCoreThree's fighter (5 Nov 2026): Wickthree with every boost (wantedBoosts() = boosts(true)). start(): core gone ->
         │                                                 afterCore(): memory.retire decided once (ticksToLive > 500): recycleAt(originSpawn), else wreck(): beside the mission's first
         │                                                 target, else the nearest rampart (goal, a TStruct), Wicktwo.reposition around it; bare at home -> boost(); else onto the
         │                                                 mission's spot (movePos range 0). after(): fireDrill(): an armed enemy beside us not under a rampart over 10k -> mass attack;
         │                                                 the core within 3 -> rangedAttack (lands on its rampart first); wrecking -> mass attack while massDamage() > 0; else
         │                                                 idleRanged(): the nearest enemy creep within 3, armed first. Heals as the wick (self every tick only while the core stands).
         ├─ Corecleaner @register          (job.corecleaner.ts) InvaderCoreThree's dismantler (5 Nov 2026): fixed 25 WORK, 25 MOVE (3750, 1250 hits a tick) from the home room (readySpawn),
         │                                                 priority 3. Core standing -> approach(): the walk to the spot is planned at range 1 and walked at range 40 (Rewalker.walkingTo:
         │                                                 a stored walk to the same destination is never replanned for a new range; a walk with no steps left is planned again at 1), so it
         │                                                 stops one tile inside the core's room on the path that leads in; with no drill in the room, or once a tower has hit it (the room's event log; memory.backoff), it backs out toward home; a tile in a keeper's reach is walked on from.
         │                                                 Core gone -> clean(): the mission's targets() in order; none: the rampart beside it with the fewest hits; none beside:
         │                                                 Rewalker.planWalk over every rampart; no ramparts: the towers; nothing: suicide. target is a TStruct; never a container.
         ├─ Coresweeper @register          (job.coresweeper.ts) InvaderCoreThree's hauler (5 Nov 2026): CARRY, MOVE x 25 (2500) from the home room (readySpawn). pick(): of the mission's
         │                                                 openLoot() the resource with the highest swipeworth.unitValue, the nearer holder on a tie; energy only once nothing else is
         │                                                 left (the mission's lootLeft() false; then only by a sweeper already in the room) or within coreDist + 50 ticks of life; one withdraw or pickup a tick. Full, or loaded under coreDist +
         │                                                 15 ticks: unloadHome (dropAt the controller with no store), latched. Empty at home under 2 x coreDist, or empty anywhere
         │                                                 under coreDist + 15: suicide. Nothing open: with a load and accessEta() > coreDist, home with it; else wait within 2 of the spot. No loot left: unload, then recycleAt(originSpawn).
         │   └─ Crow @register             (job.crow.ts)   Capture's fighter: fixed 25 MOVE, 24 RANGED_ATTACK, 1 HEAL (5100, Crow.power = 240) from the home room's spawns only (the daemon
         │                                                 waits for the energy); decide(): retreat (to the staging flag, range 2, not home) when hurt as Guard, else in staging mode stage():
         │                                                 walk to within 2 of the staging flag (the staging room without one) and wait, chasing nothing (shots and heals within reach are
         │                                                 Guard.after's opportunistic pass; potshots() leaves Source Keepers out, the staging room being a keeper room);
         │                                                 in attack mode Guard.decide with hold() at range 3 of the mission flag in the target room instead of the room centre
         │   └─ Mini @register             (job.mini.ts)   Guard on the fixed 'mini' body [RANGED_ATTACK, MOVE, MOVE, HEAL], still via "close"
         │   └─ Toxic @register            (job.toxic.ts)  bait-and-trap skirmisher on the 'mini' body via "close", spawned by Once, or by Swipe for a guarded route
         │                                                 room (the egg's memory.troom names the room to fight in, targetRoom; else the mission's); mode machine in
         │                                                 memory.tmode: travel (start) -> bait (hold range 5 from the nearest hostile, idleFlee when
         │                                                 closer; memory.tstill counts ticks at full health with no flee or damage while the nearest hostile
         │                                                 holds its tile (memory.tfoe), 10 closes to 4, 20 to 3) -> trap (within 2 of an exit with a hostile within 5: stand on the tile just inside
         │                                                 the nearest exit and shoot; back to bait past range 7) ; heal once every RANGED_ATTACK is gone (out by the nearest exit, then idleFlee to
         │                                                 range 5 from every exit tile and hostile, sit until full, then travel); harass with no hostiles (engage assaulters, heal friendlies,
         │                                                 hold within 5 of the room centre (RoomIntel.centerPos, cached in Memory.rooms[x].intel.center). Guard.after() fires
         │                                                 and heals opportunistically in every mode
         ├─ Reserver @register             (job.reserver.ts) port of role.reserver.ts; @task reserve, body 'reserver' via "close"
         ├─ Claimer  @register             (job.claimer.ts) port of role.claimer.ts for Startup; body 'claimer' ([MOVE, CLAIM]) via "remote";
         │                                                 @task claim: claimController, or attackController when someone else owns it; idles once `my`
         ├─ Immortan @register             (job.immortan.ts) Season 11 reactor reserver; body 'immortan' ([MOVE x5, CARRY, CLAIM], full speed on swamps) via "close", walks to the sector core,
         │                                                  @task reserve calls creep.claimReactor(reactor) at range 1 (needs a CLAIM part) whenever it is not ours, or every tick
         │                                                  while a hostile creep with a live CLAIM part is in the room; logs each new return code;
         │                                                  steps off a tile holding >= 10 thorium to a clean one beside the reactor; with the CARRY part
         │                                                  feeds any thorium aboard to the reactor while it holds < 980 and tops up to 9 from a tombstone or
         │                                                  ruin within reach while carrying less; a pile (pickup takes up to 50) only if it fits under 9,
         │                                                  or when empty with the reactor at <= 900 so the lot goes straight in
         ├─ Warboy   @register             (job.warboy.ts) Season 11 thorium runner; fixed RCL6 body 9 WORK / 9 CARRY / 18 MOVE (2250 energy, 450 carry) from a "home" spawn with that much energy;
         │                                                init() every tick first: a ranged non-keeper hostile within 4 -> idleFlee to 5, the running task dropped for the tick (start() re-picks it next tick); Warrunner inherits it;
         │                                                gathers until full, or ticksToLive < 3 x (planned walk to the reactor + 50), or the visible reactor's fuel has fallen to that walk time (within 25 ticks; further below it cannot land in time so it keeps filling), the walk PathFinder-planned from the harvest tile (memoized per tile) and 3 the aging rate of a loaded creep: @task scavenge dropped/tombstone/ruin thorium in its room first,
         │                                                then @task harvest (home thorium mineral); then deliver (transfers whatever fits each tick, only while reactor.my, waits otherwise)
         │                                                and back to gathering; a partial load is delivered when nothing is left to gather; never suicides
         │   └─ Warrunner @register        (job.warrunner.ts) Warboy without WORK: [CARRY, MOVE] x 9 alternating (900 energy, the same 450 load; damage costs capacity and speed together) from a "home" spawn; @task load withdraws
         │                                                what fits from the home terminal (planTravel from beside it), but only once our visible reactor will have room for the full load at landing (store - planned walk + 450 <= 1000), idling within 2 of the terminal until then (at home and too old for the loaded walk, @task retire puts any thorium back in the terminal and recycles at the nearest spawn), then Warboy's deliver/scavenge/leave-early rules;
         │                                                a partial load goes when the terminal runs dry; empty with an empty terminal it waits within 2 of the terminal
         ├─ Cleanup   @register            (job.cleanup.ts)  Thormine teardown sweeper, `cleanupBody(energyAvailable)` = energyDef CARRY,CARRY,MOVE interleaved up to 50 parts from the mission room's spawn (waits for >= 300 energy, so never under 2 groups); moves energy into the
         │                                                terminal from the first non-empty tier: dropped -> tombstones/ruins -> storage/container/link -> towers (only while the room's
         │                                                spawn energy < 300) -> extensions (never the spawn: its 1/tick trickle would keep the sweep going for ever); nothing left: recycleCreep at
         │                                                the spawn when the refund (body cost x life left) is >= 300, else suicide (a dropped refund pile would restart the sweep). looseEnergy(room) (same tiers) is what the mission sizes and ends the phase by
         ├─ Thoreater @register            (job.thoreater.ts) Season 11 thorium miner for Thormine; energyDef body 2 WORK : 1 CARRY, one MOVE per two parts, from a spawn in the
         │                                                mission room with >= 650 energy (RCL6: 14 WORK / 7 CARRY / 11 MOVE); @task harvest the room's thorium mineral only while
         │                                                the next intent (active WORK x HARVEST_MINERAL_POWER) fits in the store, whatever fills it (energy handed over by another creep included), so nothing
         │                                                spills on the tile; @task deposit the whole store (thorium first, until empty) into the
         │                                                room terminal when full for the next intent, when anything but thorium is aboard, or ticksToLive < 3 x (PathFinder walk from the harvest tile to the terminal + 20),
         │                                                3 the aging of a creep carrying 100+ thorium; the walk is memoized per tile in memory.travel;
         │                                                too old for another loaded walk and empty it waits within 2 of the terminal; mineral mined out (mineralAmount 0)
         │                                                and store empty: @task recycle at the nearest spawn in the room (suicide with none); after(): idleNomType(thorium) while it fits
         └─ Srcer   @registerAs("asrc"), @registerAs("bsrc")  priority 8, body 'srcer' (job.srcer.ts)
```

## Registration and lookup

- `process.register(klass)` stores `klass` in a module-level `Map` under
  `klass.name`. `Service.spawn("GlobalRespawn")` looks up the first word of the
  command; if missing it tries `require("ms." + name)` (`getOrImport`).
- `mycreep.register(klass)` stores under `klass.name.toLowerCase()`;
  `registerAs("asrc")` stores under an explicit name. A creep's role is
  `_.words(name)[0].toLowerCase()`, so creep `asrc3` resolves to `Srcer` and
  `startup0` to `Startup`.
- `getMyCreep(name)` caches wrapper instances in a `Map`; `unget(name)` drops
  one when the creep dies. Unknown roles fall back to a bare `MyCreep` and log
  `Missing Role!`.

## Scheduling a mission

```js
// From the game console. scheduleService is a global wrapper around Service.schedule
// (main.ts) and works; require('process').Service.schedule(...) is the long form.
scheduleService('GlobalRespawn')
scheduleService('Hub W25S7')         // args[1]=owned room; GlobalRespawn without startups, from the room's own spawns
scheduleService('Swipe W5N8 W6N8')   // args[1]=target, args[2]=home
scheduleService('Farm W5N8 W6N8')    // args[1]=farm room, args[2]=home (drop) room
scheduleService('Farm W5N8 W6N8 W7N8')  // optional args[3]=the only room its creeps spawn from (no fallback; eggs wait)
scheduleService('Reactor W6N8')      // args[1]=home room; mission works on that sector's core (W5N5)
scheduleService('Reactor W6N8 2')    // optional args[2]=cap on warboys
scheduleService('ReactorDepot W25S7')  // args[1]=home room; Reactor fed by warrunners from the home terminal once it holds one warrunner load (450) of thorium, until empty; held (nothing laid) while off
scheduleService('ReactorDepot W25S7 2')  // optional args[2]=cap on warrunners
getService('ReactorDepot W25S7').pause()  // Reactor and subclasses: lay nothing at all, purge eggs, shepherd the living; Memory.missions[x].held survives resets
getService('ReactorDepot W25S7').resume() // clears the hold; status() shows `held` while paused
getService('Capture W25S5').pause()      // no crow or scout eggs, purge eggs, keep flags and crows; resume() undoes it (ReactorDepot did both for its core as thorium ran out and returned, until 1 Nov 2026) this way (`paused:<n>` is the invader-core pause)
scheduleService('Thormine W26S8')    // args[1]=owned room with thorium, extractor and terminal; miners fill the terminal, terminal ships to W25S7
scheduleService('Thormine W26S8 W22S7')  // optional args[2]=room to ship the thorium to instead
scheduleService('Remote W5N8 W6N8')  // args[1]=remote room, args[2]=home; scout + held reservation (phase 1)
scheduleService('Remote W5N8 W6N8 W7N8')  // optional args[3]=the only room its creeps spawn from (as Farm; idles `spawn-not-ready` while it has no spawn)
scheduleService('PaveAll W5N8')      // a paver every 1400 ticks (two while 20+ planned road tiles are unbuilt) until the room has none of our sites (Remote/Startup schedule these)
scheduleService('SkFarm W25S6 W25S7')  // args[1]=keeper room, args[2]=home (spawns); one Skhunter and one Skvulture, each one egg per 1450 ticks
scheduleService('Capture W25S5')     // args[1]=target room; home (RCL7+, nearest) and staging (next room back) are picked on the first run; Capture/staging_Capture flags mark the target centre and the staging spot
scheduleService('Raze W27S4 W27S5')  // args[1]=room to clear, args[2]=home (spawns nearest it); one Razer, winds down when it decommissions
scheduleService('StealReactor W15S5')  // args[1]=a sector's core; one Usurper at a time walks from the nearest spawning room to claim its reactor, no matter what
scheduleService('CoreMiner W5N5 W3N4')  // args[1]=sector centre room, args[2]=home; scout + one prospector on the mineral while the room has no hostile creep or invader core; status() shows the mineral, clear/HOSTILE and home's stock
scheduleService('Loot W24S6 W25S7')  // args[1]=beaten stronghold room, args[2]=home (spawns); canopeners open the containers, a looter empties them, winds down when all are empty
scheduleService('InvaderCore W4N6 W3N4')  // args[1]=stronghold room, args[2]=home (spawns and labs; the nearest spawning room when left out); evolves into InvaderCoreThree for a level 3 core
scheduleService('Nidoran W23S4')     // args[1]=seed room (its reserver/owner is the target player unless args[2] names one); paired Chaos dismantlers rotate through the player's reserved rooms within 2 hops
scheduleService('Once Scout W5N8')   // args[1]=job class, args[2]=room; one creep, then winds down
scheduleService('Once Toxic W25S5 3')  // optional args[3]=count: that many creeps one after another (memory.laid), then winds down
scheduleService('Xfer W27S4 W29S4')    // args[1]=room to fill, args[2]=room to take energy from (home), optional args[3]=fedexes (default 2); getService(...).takeitall = true drains the storage to 0
scheduleService('XferStartup W24S7 W26S8')   // same arguments; lays fedexes only while W24S7's storage holds less energy than W26S8's (nothing without a storage there), winds down once W24S7 has a terminal
scheduleService('Always Mini W28S4')   // args[1]=job class, args[2]=room; one creep per lifetime for good (optional args[3]=per lifetime); windDown() stops it
scheduleService('Selloff W3N4')      // args[1]=room; sells the terminal's non-energy stock (random order) into buy orders, one deal per cooldown, skipping orders that pay less per unit than the shipping energy is worth (transfer rate x energy buy-order price); under 25k terminal energy keeps one 10k energy buy order 1cr over the best foreign bid (Memory.selloff[room].bid); kills itself on shardSeason (no market) Buys or bids for no energy at all while the room's storage holds 100k+ energy (kStorageRich, Nov 2026): the terminal is the hub creep's to fill then, and a sale short of shipping energy waits (logged every 100 ticks); status() shows `storage:rich`.
scheduleService('Trader')            // no args; market trader: paper fills per scenario in Memory.trader.sim; getService('Trader').live('fairB', 1.2e9) deals that scenario for real (floor halts it; resume(); live(null) stops); traderReport(), traderReport('live', 25), traderWatch(), reset(); rules via stockRules()/stockRule(); the pricer's suspects()/blacklist() apply
scheduleService('Furiosa')           // power creep Furiosa; picks a home power spawn room into Memory.furiosa.home
scheduleService('Balance'); getService('Balance').addRooms('W26S8', 'W25S7')  // no args; rooms via addRoom/addRooms/removeRoom (Memory.balance.rooms); thorium to W25S7 (setThoriumRoom), RCL<8 minerals to the nearest RCL8 room, base minerals to a 10k floor among RCL8 rooms, then the fullest terminal sends half the energy gap to the emptiest when the gap is >= 5k; stocks() for the base minerals per RCL8 room
```

`schedule` = `spawn` + push the command onto `Memory.scheduler.services`, which
`Service.boot()` replays on every global reset. Both are idempotent: a command
that is already live returns the existing instance and is not pushed twice
(`boot()` also dedupes the list). That is why `GlobalRespawn` is
alive with no constructor call anywhere in the code. `Service.getType(cmd)`
returns the live instance. `kill()` removes the name from
`Memory.scheduler.services` and the services map and sets `dead`, so `runAll`
drops it from the run table on the next tick. Living creeps are then never run
again (nothing outside the mission calls `mycreep.run()`), and eggs left in
`Memory.creeps` still spawn. Prefer `windDown()` for a clean exit.

## Evolving a mission into another command

```js
getService('Farm W25S8 W26S8').evolve('Farm W25S8 W25S7')
```

`Mission.evolve(cmd)` schedules `cmd` (idempotent; a live instance is reused),
`donateAll`s its eggs, hatches and creeps to it (`donateRole` per role) (each creep's
`memory.mission` is repointed), merges the `paceCreeps` timers (`memory.when`),
then `kill()`s the old mission and deletes `Memory.missions[old]`. Nothing is
purged, so no creep is lost. Only the base `MissionMemory` moves: a subclass
with extra state should override `evolve`; `Remote.evolve` calls
`removeMetas()` first so the old plan and its sites go, and the new Remote
replans against its own home on its next visible run. The target may be a different mission class; the creeps keep their
jobs and simply resolve `this.mission` to the new instance. `GrowFarm` calls
it on itself (into a `Remote` on the same arguments) when its home room grows.

## Winding down a mission

```js
require('process').Service.getType('Swipe W5N8 W6N8').windDown()
```

`windDown()` sets `Memory.missions[name].windDown`, which survives resets.
While it is set `Mission.run()` skips the normal path and runs `runWindDown()`:

1. `purgeEggs`: every egg that is not yet spawning is deleted from
   `Memory.creeps` (so the `SpawnDaemon` never sees it); one already spawning
   is moved to `hatch`.
2. `spawnHatches` and `runCreeps` continue as usual, so living creeps keep
   working until they die of age.
3. `watchTombs` records, per living creep, the tick its tombstone would decay
   (`body.length * TOMBSTONE_DECAY_PER_PART`) in `Memory.missions[name].tombs`;
   `expireTombs` drops entries once that tick passes, or once a visible
   tombstone for that creep has decayed.
4. When `eggs`, `hatch`, `creeps` and `tombs` are all empty the mission calls
   `kill()`, deletes `Memory.missions[name]`, and returns `"kill"`.

`Process.status()` returns the one-line summary `lsProcess()`/`statusServices()`
show via `Process.toString()` = `name [status()]` (`process|daemon|scheduled|transient`, `row:<priority>`, `dead`). `Mission.status()` appends `windDown` and
`tombs:` while winding down, then `eggs: hatch: creeps:` counts. A subclass
that wants more should call `super.status()` and append to the result.

The three shipped missions check `this.windingDown` first thing in `run()` and
skip straight to `super.run()`, so they lay no eggs while winding down. A new
`Mission` subclass should do the same.

## Mission lifecycle

`Memory.missions[name] = { eggs: string[], hatch: string[], creeps: string[] }`

1. **Lay** (`layEgg(role)`): pick a free name via `findName(role)` (`role` plus the
   lowest free integer), push to `eggs`, and create
   `Memory.creeps[name] = { laid, cpu: 0, mission, home: "egg", birth, nest: "egg" }`.
2. **Spawn** (`SpawnDaemon.runSpawns` in `spawn.ts`, `late` row): collect all
   `Memory.creeps` with `nest === "egg"`, sort by `MyCreep.priority` desc then
   age (500-tick buckets), skip hibernating eggs, call `mycreep.spawn(spawns)`
   for `[spawn, body]`, and `spawnCreep` when the room can afford it. Energy
   already committed to earlier eggs in the same room is subtracted. On success
   `nest = spawn.name`, `home = room.name`. `energyStructures` comes from
   `room.strat.spawnEnergy()` (metastruct ordering).
3. **Hatch** (`hatchEggs`): once `Game.creeps[name]` exists the name moves from
   `eggs` to `hatch`. Eggs whose `nest` was mutated are reset with a "Stuck egg"
   log. `mycreep.eggRun()` runs each tick while waiting (no-op for jobs).
4. **Born** (`spawnHatches`): when `!spawning`, the name moves to `creeps`.
5. **Run** (`runCreeps`): `mycreep.run()` every tick. Returns `false` when the
   creep is gone; then `Memory.creeps[name]` is deleted and the wrapper dropped.

### Population helpers on `Mission`

- `nCreeps(role, n, life=1500)`: keep total remaining TTL (creeps + hatches +
  eggs) above `(n-1)*life` plus spawn lag. With `n=1` the replacement is laid as
  the last creep dies. Never more than one unhatched egg per role at a time
  (`hasEgg`), so `n=2` from nothing lays the second egg only after the first
  hatches.
- `nJobs(ctor, n, life=1500)`: `nCreeps(ctor.name.toLowerCase(), n, life)`.
- `donate(ctor, other)` / `donateRole(role, other)` / `donateAll(other)`: move
  one role's, or every role's, eggs, hatches and creeps to mission `other`,
  repointing each creep's `memory.mission`; return the moved names.
- `paceNJobs(ctor, n, life=1500)` / `paceNCreeps(role, n, life)`: `n` of the
  role at a time, paced. The rate is `life / (n+1)` (Oct 2026; was `life / n`)
  so a replacement is laid before the oldest dies, and the head count is
  capped as `nCreeps` caps it: nothing is laid while creeps + hatches + eggs
  of the role already number `n`, so an early death is replaced at the next
  rate tick and nothing is doubled. Below 1 it is the duty cycle `nCreeps`
  uses (`paceCreeps(role, life / n)`, no cap); `n <= 0` lays nothing (`Farm`
  farmers, `Startup` pioneers).
- `paceCreeps(role, rate)` / `paceJobs(ctor, rate)`: port of `team.ts
  paceRole`. Lays at most one egg per `rate` ticks (tracked in
  `memory.when[role]`), never while one is unhatched, and does not replace a
  creep that dies early. Rates below `kMinPaceRate` (100) are clamped up to
  it; non-positive or non-finite rates lay nothing. Use it for spawning that
  should stop the moment the trigger goes away (`Farm.suppressInvaderCore`,
  `Farm.reserve`) or when the target is a rate rather than a head count
  (`Farm` farmers: `1500 / nFarmers`).
- `nCreeps`/`nJobs` accept fractional `n` (TTL-based; 1.5 averages 1.5 creeps).
  Below 1 they delegate to `paceCreeps(role, life / n)`, a duty cycle. `n <= 0`
  lays nothing.
- `hasEgg(role)`, `hasRole(role)`, `roleCreeps/roleHatches/roleEggs(role)`.
- `getRoomName(alias)`: `""` = mission room, a room-name string passes through;
  subclasses add aliases (`Swipe` maps `"home"` to `args[2]`; `Farm` maps
  `"spawn"` to its optional `args[3]`). A non-null `"spawn"` pins every
  `JobRole.stratSpawn` job and `Scout` of the mission to that room's spawns.
- The three rooms (Oct 2026): every mission has a target (`roomName`), a
  home and a spawn room. `homeRoomName` is `getRoomName("home")` else the
  target; `spawnRoomName` is `getRoomName("spawn")` else the home;
  `hasHomeRoom`/`hasSpawnRoom` say whether the mission named one. Jobs
  that pin only when told to call `JobCreep.spawnRoomSpawns(spawns)`: the
  spawn room's spawns when named, else null and their own distance pick
  (`Bulldozer.spawn` -> `dozerSpawn(pinned || spawns, home, !!pinned)`).

## GlobalRespawn (`src/ms.globalrespawn.ts`)

Room = `Game.spawns.Home.room`, or the first spawn's room when no spawn is named `Home` (throws only with no spawns at all). Each tick:

```
if no creeps at all:              nJobs(Reboot, 1)        # emergency: body sized from energyAvailable
nCreeps('startup', max(1, 6-rcl)) # 5 at RCL1 down to 1 at RCL5+
  || (ecap >= 550 && (nCreeps('bsrc',1) || nCreeps('asrc',1)))
  || nCreeps('hauler', 1)
nJobs(Worker, 1); nJobs(Ctrl, 1); if storage: nJobs(Hub, 1)
nJobs(Upgrader, Upgrader.want(room))   # 0 at RCL8 / no storage / < 100k, else storage energy / 100k (150k = 1.5); laid last (priority -1)
super.run(); return "critical"
```

The `||` chain lays at most one of startup/bsrc/asrc/hauler per tick. `asrc`/
`bsrc` need `Meta_asrc`/`Meta_bsrc` metastructures to find their source
([metastruct.md](metastruct.md)); `Hub.spawn` returns no spawn until a `hub`
spot exists.

## Hub (`src/ms.hub.ts`)

`"Hub <room>"`, the same loop for any other owned room, minus the startup line:

```
if room invisible or controller not ours: paced log; super.run(); return "normal"
if no creeps at all:              nJobs(Reboot, 1)
(ecap >= 550 && (nCreeps('bsrc',1) || nCreeps('asrc',1))) || nCreeps('hauler', nHaulers())
  # nHaulers = min(3, 1 + floor(max(0, dropped energy - 1000) / 2000)); constants at the top of ms.hub.ts
nJobs(Worker, 1); nJobs(Ctrl, 1); if storage: nJobs(Hub, 1)
nJobs(Upgrader, Upgrader.want(room)); nJobs(CtrlHauler, CtrlHauler.want(mission))
nJobs(Upgrader, Upgrader.want(room))   # 0 at RCL8 / no storage / < 100k, else storage energy / 100k (150k = 1.5); laid last (priority -1)
super.run(); return "critical"
```

Every job spawns "local" (nearest spawns by route distance), so the room's own
spawn once it has one; `Reboot.spawn` prefers the mission room's spawns for the
same reason. Before the room has a spawn the `Startup` mission's pioneers carry
it, so both missions can run side by side until `Startup` winds down at RCL4.
The mission class is `Hub` in the process registry and the job class is `Hub`
in the creep registry; `nJobs(HubJob, 1)` still lays `hub<n>` eggs because
`nJobs` uses the constructor's runtime name. `status()` appends `rcl:<level>`,
the dropped energy and the current hauler target.

## MyCreep.run() and Task2

```
run():  if creep gone -> return false
        init() -> false drops memory.task2         # per-tick hook; false = the task in flight is wrong now
        up to 3 times: ret = runTask()            # replays memory.task2 {name, args, id?}
                       if ret === "start": delete task2; ret = start()
                       loop while ret in {"again","start"}
        after(); return true
```

`Task2Ret = "again" | "start" | "wait" | false`. `init()` runs every tick
before the task resumes: per-tick guards and intents live there (a flee, a
swing at an adjacent enemy, mode tracking), and a job without task locks can
keep all its per-tick logic there with `start()` returning `"wait"`, run
through `perTick(step)` so a step that answers `"again"`/`"start"` (a walk
that arrives) gets its next pass the same tick, as `start()` would (3 passes
at most, `kPasses`; `run()` itself goes through `perTick` too); Skvulture was the first moved this way (`decide()`, as Crow names it), then Skhunter (`swing()` for the intents, then `decide()`), Sktrucker (Looter with it) and Harvester (Skharvester with it); Fedex `donate` is the first method on the fixed `@task` (15 Oct 2026), its retreat and flee in `init()` with a `fleeing` flag the task honours. It
returns `false` (honoured since 14 Oct 2026) to drop the task in flight when
the situation changed, so `start()` decides afresh this tick; a flee is not
that (the task should resume afterwards, see Warboy's `fleeing` flag). A
method decorated with `@task` (mycreep.ts) records its name and JSON-cloned
args in `memory.task2` on first call so the next tick resumes it without
re-deciding. The first argument
that is a game object (has a string `id`) is stored as its id with `task.id`
set to its 1-based position; `runTask` swaps `Game.getObjectById(...)` back in
and returns `"start"` when the object is gone. Users: `Swiper.dropRange`,
`Wolf.fight`, `Wolf.retreat`, `Reserver.reserve`.

Default `start()` (MyCreep and JobRole) is `this.c.run(); this.c.after();
return "wait"`, which hands control to the legacy prototype role dispatch
([creep-roles.md](creep-roles.md)). This bridge is what lets the 2017 role
mixins run under the 2022 mission system.

## Adding a new job

1. Create `src/job.foo.ts` with `@register export class Foo extends JobRole` (or
   `JobCreep` for fully new behaviour).
2. Implement `spawn(spawns): [StructureSpawn|null, BodyPartConstant[]]`. For a
   `JobRole`, `this.localSpawn(spawns, eggMem)` runs `spawnold.buildBody` with
   `eggMem.body` defaulting to the role name; that name must be a `case` in
   `buildBody` ([spawning.md](spawning.md)).
3. Either rely on an existing `roleFoo()` prototype method, or override
   `start()` with Task2 logic.
4. Import the module from `main.ts` (or from the mission that uses it) so the
   decorator runs; then call `this.nJobs(Foo, n)` from a mission.
