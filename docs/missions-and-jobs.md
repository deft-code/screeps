# Missions, Jobs, and MyCreep (the 2022 architecture)

Files: `src/process.ts`, `src/mission.ts`, `src/mycreep.ts`, `src/job.creep.ts`,
`src/job.role.ts`, `src/job.*.ts`, `src/ms.*.ts`, `src/spawn.ts`.

This is the active design and the target for any new behaviour. It replaced the
flag-driven "team" system ([legacy-systems.md](legacy-systems.md)).

## Class map

```
Process                      run(): Priority; kill()           (process.ts)
 └─ Service                  named by a command string, e.g. "Swipe W5N8 W6N8"
     ├─ Selloff      @register  (ms.selloff.ts)   "Selloff <room>"; no creeps, so a purple flag "Selloff_<room>" may run it.
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
     │                                            MyPowerCreep.spawn, which records memory.home on the creep) at the home power
     │                                            spawn when she exists but is unspawned and the spawn cooldown has passed.
     │                                            Spawned: the Furiosa flag's child flags ("<prefix><n>_Furiosa", sorted by name)
     │                                            pick the behaviour; first known prefix wins, unknown ones are logged and skipped.
     │                                            swipe -> MyPowerCreep.questSwipe(child flag room, Furiosa flag room), going for the structure that holds the most valuable resource (buy-order price per unit) and taking its resources most valuable first, only what swipeworth.ts prices as worth it for the flag room; the child flag is removed once
     │                                            questSwipe returns false (creep empty and the room has nothing left, judged at home after the last
     │                                            partial unload too), so the next child takes over without a trip back.
     │                                            No usable child flag: walk to within 5 of the Furiosa flag and wait. TTL < 300: runRenew
     │                                            at the home power spawn instead of any child behaviour.
     └─ Mission (abstract)   owns eggs/hatch/creeps lists in Memory.missions[name]
         ├─ GlobalRespawn    @register  (ms.globalrespawn.ts)  ACTIVE
         ├─ Bulldoze         @register  (ms.bulldoze.ts)       "Bulldoze <target> <home>"; tile list in memory.doze fed by `bulldoze*` flags (flag = this tile next, flag removed) and by the breach plan
         │                                                     (spawn -> first tile, cost round(log10(hits)*20) per blocked tile, replanned every 100 ticks); one Bulldozer while the list is not empty; asks the home labs for XZH2O while a dozer is an egg/hatch
         ├─ Hub              @register  (ms.hub.ts)            "Hub <room>"; GlobalRespawn for any owned room, without the startup creeps:
                                                              Reboot while the mission has no creeps, bsrc (only with a Meta_bsrc)/asrc (ecap >= 550; nCreeps 1 + (cached spawn->spot walk + 30)/1500 each) or haulers (1 + one per 2k dropped energy over 1k, max 3), Worker, Ctrl, Hub once storage exists, Upgrader.want(room) upgraders (below RCL8: storage energy / 100k, from 100k, fractional),
                                                              all spawned "local"; idles (paced log) while the room is not ours or has no spawn of its own (status `no-spawn`). Distinct from the `Hub` job class (separate registries).
         ├─ Swipe            @register  (ms.swipe.ts)          "Swipe <target> <home>"; Scout while the target is invisible, else two Swipers (kSwipers);
         │                                                     winds down once the target room has no swipe targets left (job.swiper swipeTargets)
         │                                                     worth(res) (swipeworth.ts, shared with Furiosa's questSwipe): energy always; else market.getBuyOrderPrice(res) >= 2 x getSellOrderPrice(energy, home) (energy delivered to home);
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
         │                                                     nJobs(Guard, 1) while any enemy creep (room.enemies) is in the core;
         │                                                     paceNJobs(Toxic, 1) while an armed enemy (room.hostiles) with no active HEAL part is in the core;
         │                                                     nJobs(Immortan, 1) while the reactor is visible and either not `my` or `my` with over 100 thorium aboard (CLAIM creeps are costly);
         │                                                     nJobs(Warboy, min(args[2], 700 / tripLoad)) once the home room has an
         │                                                     extractor on a thorium mineral with thorium left, the core is visible with a reactor in it and no armed hostile (room.hostiles),
         │                                                     and a full load will still fit when it lands: store - 600 (lead ticks) + thorium inbound from every Reactor mission's warboys and eggs + 450 <= 1000
         │   └─ ReactorDepot @register  (ms.reactordepot.ts)  "ReactorDepot <room> [cap]"; Reactor with the runner hooks overridden: runnerClass Warrunner
         │                                                     (loads from the home terminal instead of mining), runnerCycle 300, leadTicks 300, and homeHasThorium =
         │                                                     the home terminal holds > 1000 thorium (status `depot:<n>`). Scout, probe, guard, immortan and the
         │                                                     invader-core pause are inherited; inboundThorium counts both missions' runners against the reactor.
         │                                                     Keeps Rewalker.getRoute(home, core) in memory.route (refreshed every 500 ticks) with its SK rooms in
         │                                                     memory.skRooms (status `route:.. sk:..`); watch() checks every visible SK room on the route each tick for an
         │                                                     invader core with a level, and one found (or a creep dying in such a room whose intel shows a core) sets
         │                                                     pauseUntil = now + 2500 and purges every egg but scouts (Mission.purgeEggs keep-list); while paused
         │                                                     paceJobs(Scout, 1400) still runs (Reactor.whilePaused hook), so passing scouts renew the pause until the core is gone
         ├─ Thormine         @register  (ms.thormine.ts)       "Thormine <room> [dest]"; mines <room>'s thorium into its terminal and ships it to [dest] (default W25S7).
         │                                                     With the room visible: nJobs(Thoreater, spots), spots = walkable tiles beside the thorium mineral
         │                                                     (spots.ts terrain minus obstacle structures), only while the mineral has thorium left, an extractor
         │                                                     stands on it and the room has a terminal of ours (status shows `closed:<reason>` otherwise, log every 500 ticks);
         │                                                     ship(): terminal off cooldown with >= TERMINAL_MIN_SEND (100) thorium -> terminal.send to [dest] (must be another
         │                                                     room with a visible terminal of ours), the amount halved until this terminal's energy covers calcTransactionCost.
         │                                                     Teardown (memory.teardown.phase, status `TEARDOWN:<phase>(<ticks>)`), begun when the mineral reads 0, the terminal
         │                                                     holds no thorium and no thoreater is left; abortTeardown() from the console undoes phases 1-2 only:
         │                                                     missions: windDown() every other Mission whose "home" alias is this room, or whose roomName is with no home (Hub, Startup);
         │                                                     clear the room's metas (MetaManager.save), remove every flag in the room, cancel construction sites (repeated each tick);
         │                                                     cleanup: nJobs(Cleanup, energy outside the terminal / 2000, 1..4) while the spawn energy covers the 150 body; done under 50 loose, no sweeper, terminal < 100 or unable to afford a send;
         │                                                     ends under 50 energy outside the terminal, no cleanup alive/queued, terminal < 100 energy;
         │                                                     destroy: up to 10 structures a tick, everything but roads/spawn/terminal first, then roads, then spawn and terminal,
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
                                                              a foreign reservation itself); no farmers.
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
                                                              truck(): paceJobs(Trucker, min(1500, 1500 / (5*sum(src cap) / (avg carry * 1500 / (2*legSteps+10))))) only once a container stands on an rsrc tile;
                                                              same gates; 1500 while no trucker is alive; legSteps = longest source leg from planning
         ├─ Once             @register  (ms.once.ts)           "Once <Job> <room> [count]"; lays an egg of the job whenever none is alive until count
                                                              (args[3], default 1) have been laid (memory.laid), winds down once the last has spawned,
                                                              kills and deschedules itself when the creep and its tombstone are gone
         ├─ PaveAll          @register  (ms.paveall.ts)        "PaveAll <room>"; paceJobs(Paver, 1400) while Game.constructionSites has any of ours in the
                                                              room (works without vision), windDown() once none are left; requested by Remote and Startup
         └─ Startup          @register  (ms.startup.ts)        "Startup <room>"; claims and boots a room: nJobs(Scout, 1) while the room is invisible;
                                                              nJobs(Claimer, 1, 600) while the controller is not ours and owned rooms < GCL, and meanwhile
                                                              paceNJobs(Pioneer, 2) if nobody owns or reserves the room and it has saved metas (`canPioneerEarly`;
                                                              ActiveStrat places the road/container sites, status shows `early`);
                                                              while ours and below RCL4, paceNJobs(Pioneer, 2) (hardcoded kPioneers per lifetime) and nJobs(Guard, 1) while the room has no tower,
                                                              spawned outside the room; at RCL4 windDown(): pioneers live
                                                              out their lives, then the mission kills and deschedules itself. Distinct from
                                                              the `Startup` job class (separate registries).
                                                              "Startup <room> [home]": while not ours and GCL is full (owned rooms >= gcl.level) no
                                                              claimer; instead `planRoad`: PathFinder controller -> home spawn (home = args[2], else the
                                                              nearest outside spawn's room) through `Rewalker.restrictedRoomCallback` (its route and cost
                                                              matrices, so keeper lairs and hostile rooms are avoided), plainCost 2 / swampCost 10, kept in
                                                              memory.road as a Rewalker `Path`, replanned every 500 ticks and drawn (yellow dashed) while
                                                              the mission room has >= 2 of our construction sites; `replanRoad()` drops it; status adds `gcl:` and `road:<tiles> via:<rooms>`.
                                                              The path becomes traffic entries, one `Meta_rroad` per room named `rroad_<room>_startup`
                                                              (tracked in memory.roadMetas, status `metas:<rooms>`), shaped like a remote's: in the mission
                                                              room from the border the path leaves by to each source (beside its asrc/bsrc/rsrc spot when
                                                              planned, level 0) and to the controller (level 0 too, unlike a remote's swamp-only leg: pioneers upgrade it), border -> border between, the home
                                                              storage (kOrigin) -> border at home, every entry searched swamp-averse (swampCost 55, as the
                                                              road's own search); each room's MetaManager plans the roads and ActiveStrat/ClaimedStrat
                                                              place the sites; a changed replan replaces them in place, windDown() and `removeRoad()` delete them
                                                              and each room's traffic replan removes our road sites left on dropped tiles. Unowned road
                                                              rooms with our sites in view get "PaveAll <room>"
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
     │                       init() sets memory.home to the mission room so roleBootstrap works there (rolePioneer in role.bootstrap.js)
     ├─ Reboot   @register   priority 10, body from energyAvailable   (job.reboot.ts)
     ├─ Scout    @register   [MOVE] from the "home" room if any, walks to the mission room (job.scout.ts); there, shadows the
     │                       armed hostiles (not keepers): 5 from any with RANGED_ATTACK, 3 from melee-only; idleFlee when
     │                       inside, else closes on the one with least slack (distance - range) and holds at 0; with no
     │                       hostiles, walks onto the nearest foreign construction site to stomp it (not under ramparts or
     │                       obstacles, not while the owner's controller is in safe mode)
     ├─ Paver    @register   (job.paver.ts) port of role.paver.js; body 'farmer' via the "close" spawn strategy, only once that room holds >= 550 energy; three modes in memory.pmode:
     │                       work (walk to the mission room, taskBuildAny, then taskRepairRemote on roads/containers; empty -> gather or forage),
     │                       gather (mission room is not SK and has a source: taskRechargeHarvest there until full), forage (SK room or no source:
     │                       walk the Rewalker route toward memory.home taking the nearest piles >= 50, tombstones, ruins, our stores or a
     │                       non-SK source in each room, nothing within 5 of a lair; taskRechargeHarvest at home as last resort; full -> work);
     │                       after(): idleNom + idleBuild|idleRepairAny; spawned by PaveAll
     ├─ Harvester @register  (job.harvester.ts) port of role.harvester.js for Remote; 6W/1C/3M from "home" (falls back to the nearest spawns) (floor 3W/1C/2M); claims an rsrc meta
     │                       (memory.rsrc; if all are claimed it shadows the harvester with the fewest ticks to live), stands on the
     │                       container tile drop-mining; builds the container site and repairs the container, withdrawing from it for that;
     │                       after() idles (nom/build/repair) only while inside the mission room
     ├─ Trucker  @register   (job.trucker.ts) port of role.trucker.js for Remote; 2 CARRY per MOVE from the nearest spawns (closeSpawns, offroad
     │                       when empty); withdraws from the fullest rsrc container (sweeps dropped energy), once more than half full unloads
     │                       at home until empty (JobCreep.unloadHome); after() idleNom picks up adjacent energy
     ├─ Bulldozer @register  (job.bulldozer.ts) 2 WORK per MOVE (33W/17M at full energy); boosts XZH2O at home when a lab has it ready (never waits); planWalk over mission.dozePositions() at range 1, @task doze(xy, room) dismantles the tile (rampart first)
     ├─ Konmari  @register   (job.konmari.ts) CARRY/MOVE pairs like Swiper; loads worthless resources (catalyzed boosts excepted) from the home storage then terminal, walks towards the
     │                       Swipe target and drops 20 units per tick while outside the home room; empty -> home for more; nothing worthless left -> suicide
     ├─ Swiper   @register   (job.swiper.ts) CARRY/MOVE pairs from the spawns nearest home (JobCreep.getHomeRoomName: mission
     │                       "home", else "spawn", else the nest's room, else a random spawn's, so "Once Swiper <room>" works), sized to energy on hand (max 50 parts);
     │                       loots the Swipe target: @task withdrawFrom the cheapest-path non-own structure with anything in its store (Rewalker.planWalk over all candidates), one resource at a time in random order
     │                       (nuker excluded; rampart-covered ones skipped 1500 ticks via memory.skip) until full, or until the room is empty and it holds anything,
     │                       then unloads at home until empty (JobCreep.unloadHome), else dropAt the controller
     ├─ JobCreep.unloadLatch/unloadHome  (job.creep.ts) shared by Trucker and Swiper: latched (memory.unload) until empty; walks
     │                       straight to the home storage, else terminal (ours, with space), else the home container with the most free
     │                       space (memory.dropid), then the next; every transfer passes what fits; null when home has no space
     └─ JobRole              bridge to legacy roles: start() calls creep.run()/after() (job.role.ts)
         ├─ Worker  @register              (job.worker.ts)
         ├─ Ctrl    @register              (job.ctrl.ts)   boosts XGH2O, ecap rules
         ├─ Hub     @register              (job.hub.ts)    needs storage + meta 'hub' spot
         ├─ Hauler  @register  priority 9  (job.hauler.ts) energy = min(2500, ecap/2)
         ├─ CtrlHauler @register priority -1 (job.ctrlhauler.ts) storage -> Meta_ctrl container shuttle; body 'hauler' (<= 1500 energy, local);
         │                                                 want(mission) = 1 only while storage energy >= 100k, the ctrl container exists and is empty,
         │                                                 and the mission's ctrl creep is empty (else 0); after() idleNom
         ├─ Chemist @register              (job.chemist.ts) pure Task2 port of role.chemist.js (overrides start()); Hub mission only, Chemist.want(room) = 1 with a terminal and a lab;
         │                                                 body 'chemist' (10C/5M, local). Empty: @task drain a lab whose mineralDrain() says so, fetch a lab's planType (labWant: up to 800, 2400 boosting)
         │                                                 from terminal then storage, fetch lab energy from the richer depot (> 5k), fetch G for the nuker, @task gather stray non-energy (nearest pile/tombstone/ruin/container; sets memory.stray); loaded: @task fill the lab/nuker wanting it, else stash in terminal/storage (storage first for a gathered load)
         ├─ Upgrader @register priority -1 (job.upgrader.ts) port of role.upgrader.js; surplus sink: taskRecharge then goUpgradeController,
         │                                                 after() idleNom + idleRecharge; body 'upgrader' (2W/1C per level) via "local";
         │                                                 Upgrader.want(room) = 0 at RCL8, without storage, or below 100k, else storage energy / 100k (linear, fractional: 150k = 1.5)
         ├─ Farmer  @register              (job.farmer.ts) port of role.farmer.js; Task2 start() calls legacy task* helpers
         ├─ Wolf    @register              (job.wolf.ts)   port of role.wolf.js; Task2 @task attack/retreat, body 'wolf' via "close"
         ├─ Guard   @register              (job.guard.ts)  port of role.guard.js; Task2 @task hunt/duel/healCreep/retreat, kites melees via idleFlee;
         │                                                 engage() shoots and closes to range 2 (3 on a melee target, since kite backs off at 2);
         │                                                 with nothing to do hold() drifts to within 3 of spots.roomCentroid, but only after 3 idle ticks
         │                                                 (memory.gidle) so a friendly flickering on an exit draws it over instead of resetting it;
         │                                                 body 'guard' via "remote": room capacity >= 550, energyDef scales T/RA pairs to energy available (spawning.md)
         │   └─ Mini @register             (job.mini.ts)   Guard on the fixed 'mini' body [RANGED_ATTACK, MOVE, MOVE, HEAL], still via "close"
         │   └─ Toxic @register            (job.toxic.ts)  bait-and-trap skirmisher on the 'mini' body via "close", spawned by Once; mode machine in
         │                                                 memory.tmode: travel (start) -> bait (hold range 5 from the nearest hostile, idleFlee when
         │                                                 closer; memory.tstill counts ticks at full health with no flee or damage while the nearest hostile
         │                                                 holds its tile (memory.tfoe), 10 closes to 4, 20 to 3) -> trap (within 2 of an exit with a hostile within 5: stand on the tile just inside
         │                                                 the nearest exit and shoot; back to bait past range 7) ; heal once every RANGED_ATTACK is gone (out by the nearest exit, then idleFlee to
         │                                                 range 5 from every exit tile and hostile, sit until full, then travel); harass with no hostiles (engage assaulters, heal friendlies,
         │                                                 hold within 5 of spots.roomCentroid, cached in Memory.rooms[x].centroid). Guard.after() fires
         │                                                 and heals opportunistically in every mode
         ├─ Reserver @register             (job.reserver.ts) port of role.reserver.js; @task reserve, body 'reserver' via "close"
         ├─ Claimer  @register             (job.claimer.ts) port of role.claimer.js for Startup; body 'claimer' ([MOVE, CLAIM]) via "remote";
         │                                                 @task claim: claimController, or attackController when someone else owns it; idles once `my`
         ├─ Immortan @register             (job.immortan.ts) Season 11 reactor reserver; body 'immortan' ([MOVE x5, CARRY, CLAIM], full speed on swamps) via "close", walks to the sector core,
         │                                                  @task reserve calls creep.claimReactor(reactor) at range 1 (needs a CLAIM part) whenever it is not ours, or every tick
         │                                                  while a hostile creep with a live CLAIM part is in the room; logs each new return code;
         │                                                  steps off a tile holding >= 10 thorium to a clean one beside the reactor; with the CARRY part
         │                                                  feeds any thorium aboard to the reactor while it holds < 980 and tops up to 9 from a tombstone or
         │                                                  ruin within reach while carrying less; a pile (pickup takes up to 50) only if it fits under 9,
         │                                                  or when empty with the reactor at <= 900 so the lot goes straight in
         ├─ Warboy   @register             (job.warboy.ts) Season 11 thorium runner; fixed RCL6 body 9 WORK / 9 CARRY / 18 MOVE (2250 energy, 450 carry) from a "home" spawn with that much energy;
         │                                                gathers until full, or ticksToLive < 3 x (planned walk to the reactor + 50), or the visible reactor's fuel has fallen to that walk time (within 25 ticks; further below it cannot land in time so it keeps filling), the walk PathFinder-planned from the harvest tile (memoized per tile) and 3 the aging rate of a loaded creep: @task scavenge dropped/tombstone/ruin thorium in its room first,
         │                                                then @task harvest (home thorium mineral); then deliver (transfers whatever fits each tick, only while reactor.my, waits otherwise)
         │                                                and back to gathering; a partial load is delivered when nothing is left to gather; never suicides
         │   └─ Warrunner @register        (job.warrunner.ts) Warboy without WORK: 9 CARRY / 9 MOVE (900 energy, the same 450 load) from a "home" spawn; @task load withdraws
         │                                                what fits from the home terminal (planTravel from beside it), then Warboy's deliver/scavenge/leave-early rules;
         │                                                a partial load goes when the terminal runs dry; empty with an empty terminal it waits within 2 of the terminal
         ├─ Cleanup   @register            (job.cleanup.ts)  Thormine teardown sweeper, `cleanupBody(energyAvailable)` = energyDef CARRY,CARRY,MOVE interleaved up to 50 parts from the mission room's spawn (>= 150 energy); moves energy into the
         │                                                terminal from the first non-empty tier: dropped -> tombstones/ruins -> storage/container/link -> towers (only while the room's
         │                                                spawn energy < 150) -> extensions (never the spawn: its 1/tick trickle would keep the sweep going for ever); nothing left: recycleCreep at
         │                                                the spawn when the refund (body cost x life left) is >= 300, else suicide (a dropped refund pile would restart the sweep). looseEnergy(room) (same tiers) is what the mission sizes and ends the phase by
         ├─ Thoreater @register            (job.thoreater.ts) Season 11 thorium miner for Thormine; energyDef body 2 WORK : 1 CARRY, one MOVE per two parts, from a spawn in the
         │                                                mission room with >= 650 energy (RCL6: 14 WORK / 7 CARRY / 11 MOVE); @task harvest the room's thorium mineral only while
         │                                                the next intent (active WORK x HARVEST_MINERAL_POWER) fits in the store, so nothing spills on the tile; @task deposit into the
         │                                                room terminal when full for the next intent or ticksToLive < 3 x (PathFinder walk from the harvest tile to the terminal + 20),
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
// (main.js) and works; require('process').Service.schedule(...) is the long form.
scheduleService('GlobalRespawn')
scheduleService('Hub W25S7')         // args[1]=owned room; GlobalRespawn without startups, from the room's own spawns
scheduleService('Swipe W5N8 W6N8')   // args[1]=target, args[2]=home
scheduleService('Farm W5N8 W6N8')    // args[1]=farm room, args[2]=home (drop) room
scheduleService('Farm W5N8 W6N8 W7N8')  // optional args[3]=the only room its creeps spawn from (no fallback; eggs wait)
scheduleService('Reactor W6N8')      // args[1]=home room; mission works on that sector's core (W5N5)
scheduleService('Reactor W6N8 2')    // optional args[2]=cap on warboys
scheduleService('ReactorDepot W25S7')  // args[1]=home room; Reactor fed by warrunners from the home terminal while it holds > 1000 thorium
scheduleService('ReactorDepot W25S7 2')  // optional args[2]=cap on warrunners
scheduleService('Thormine W26S8')    // args[1]=owned room with thorium, extractor and terminal; miners fill the terminal, terminal ships to W25S7
scheduleService('Thormine W26S8 W22S7')  // optional args[2]=room to ship the thorium to instead
scheduleService('Remote W5N8 W6N8')  // args[1]=remote room, args[2]=home; scout + held reservation (phase 1)
scheduleService('Remote W5N8 W6N8 W7N8')  // optional args[3]=the only room its creeps spawn from (as Farm; idles `spawn-not-ready` while it has no spawn)
scheduleService('PaveAll W5N8')      // a paver every 1400 ticks until the room has none of our sites (Remote/Startup schedule these)
scheduleService('Once Scout W5N8')   // args[1]=job class, args[2]=room; one creep, then winds down
scheduleService('Once Toxic W25S5 3')  // optional args[3]=count: that many creeps one after another (memory.laid), then winds down
scheduleService('Selloff W3N4')      // args[1]=room; sells the terminal's non-energy stock (random order) into buy orders, one deal per cooldown, skipping orders that pay less per unit than the shipping energy is worth (transfer rate x energy buy-order price); under 25k terminal energy keeps one 10k energy buy order 1cr over the best foreign bid (Memory.selloff[room].bid); kills itself on shardSeason (no market)
scheduleService('Furiosa')           // power creep Furiosa; picks a home power spawn room into Memory.furiosa.home
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
- `paceNJobs(ctor, n, life=1500)`: `paceJobs(ctor, life / n)`, i.e. `n` creeps
  per lifetime as a rate; `n <= 0` lays nothing (`Farm` farmers, `Startup`
  pioneers).
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
        init()
        up to 3 times: ret = runTask()            # replays memory.task2 {name, args, id?}
                       if ret === "start": delete task2; ret = start()
                       loop while ret in {"again","start"}
        after(); return true
```

`Task2Ret = "again" | "start" | "wait" | false`. A method decorated with
`@task` (mycreep.ts) records its name and JSON-cloned args in `memory.task2` on
first call so the next tick resumes it without re-deciding. The first argument
that is a game object (has a string `id`) is stored as its id with `task.id`
set to its 1-based position; `runTask` swaps `Game.getObjectById(...)` back in
and returns `"start"` when the object is gone. Users: `Swiper.dropRange`,
`Wolf.attack`, `Wolf.retreat`, `Reserver.reserve`.

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
4. Import the module from `main.js` (or from the mission that uses it) so the
   decorator runs; then call `this.nJobs(Foo, n)` from a mission.
