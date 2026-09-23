import { Mission, MissionMemory } from "mission";
import { register, Priority, Service } from "process";
import * as debug from "debug";
import { getSpots } from "spots";
import { getMetaManager } from "metastruct";
import { Thoreater } from "job.thoreater";
import { Cleanup, kCleanupCost, looseEnergy } from "job.cleanup";

// Where the mined thorium is shipped unless the command names another room.
const kDefaultDest = "W25S7";
// Ticks between "waiting on" log lines while the gate is closed.
const kLogPace = 500;

// Teardown (see the class comment). One cleanup per this much energy left
// outside the terminal, between kCleanupMin and kCleanupMax.
const kEnergyPerCleanup = 2000;
const kCleanupMin = 1;
const kCleanupMax = 4;
// The room counts as drained of energy under this much outside the terminal
// (a recycled cleanup leaves ~30 in its tombstone) and under this much in
// the terminal (below TERMINAL_MIN_SEND nothing more can be shipped).
const kEnergyEmpty = 50;
const kTerminalEmpty = 100;
// Structures destroyed per tick in phase 3.
const kDestroyPerTick = 10;

type Phase = "missions" | "cleanup" | "destroy" | "done";

interface ThormineMemory extends MissionMemory {
    // Set the first time the room's thorium is seen with any amount left. A
    // mined-out thorium mineral vanishes from the room (Season 11), so this
    // is how "mined out" is told apart from "never had thorium".
    thoriumSeen?: boolean
    // Set once teardown begins; only ever moves forward.
    teardown?: {
        phase: Phase
        since: number
        // Missions this teardown wound down, for status.
        wound?: string[]
    }
}

// Mine a room's thorium into its terminal and ship it on.
//
//   scheduleService('Thormine W26S8')         // args[1]=owned room with the thorium
//   scheduleService('Thormine W26S8 W25S7')   // optional args[2]=room to ship it to
//
// Each tick with the room visible:
//   - nJobs(Thoreater, spots): one miner per walkable tile beside the thorium
//     mineral, but only while the mineral has thorium left, an extractor
//     stands on it and the room has a terminal of ours. With the gate closed
//     no egg is laid and the living miners finish their loads.
//   - ship(): whenever the terminal is off cooldown and holds at least
//     TERMINAL_MIN_SEND thorium, send as much as its energy can pay the
//     transfer for to the destination room's terminal. Skipped when the
//     destination is this room or has no terminal we can see.
//
// Teardown. Once the mineral is exhausted (mineralAmount 0, whatever its
// regeneration timer says), the terminal holds no thorium and no thoreater
// is left, the mission dismantles the room in phases (memory.teardown.phase):
//   missions  windDown() every other mission homed here (getRoomName("home")
//             is this room, or roomName is with no home: Hub, Startup, Farm,
//             Remote, Reactor, ReactorDepot, ...); clear the room's meta plan
//             and remove its flags so ClaimedStrat stops placing sites; cancel
//             construction sites. Next phase once none of them is scheduled.
//   cleanup   nJobs(Cleanup, energy outside the terminal / 2000, 1..4) from
//             this room's spawn while its spawn energy covers the body; they
//             move every bit of energy into the terminal (job.cleanup.ts).
//             Next phase once under 50 energy is left outside the terminal,
//             no cleanup is alive or queued and the terminal holds under 100.
//   destroy   up to 10 structures a tick: everything but roads, the terminal
//             and the spawn first (walls and ramparts included), then roads,
//             then the spawn and terminal. Construction sites keep being
//             cancelled. With nothing but the controller left, unclaim it.
//   done      the mission kills itself and drops its memory.
// Throughout teardown nothing is mined and the terminal ships everything it
// holds to the destination, other resources first and energy last (energy
// pays the transfers). abortTeardown() from the console undoes the state in
// the first two phases (the missions already wound down stay wound down);
// destroy cannot be undone.
@register
export class Thormine extends Mission {
    get roomName() {
        return this.args[1];
    }

    get destName(): string {
        return this.args[2] || kDefaultDest;
    }

    get mem(): ThormineMemory {
        return this.memory as ThormineMemory;
    }

    get phase(): Phase | null {
        return this.mem.teardown?.phase || null;
    }

    run(): Priority {
        if (this.windingDown) return super.run();
        const room = this.room;
        if (room) {
            if (this.phase) {
                this.teardown(room);
            } else {
                const mineral = this.mineral;
                if (mineral && mineral.mineralAmount > 0 && !this.mem.thoriumSeen) {
                    this.mem.thoriumSeen = true;
                    debug.log(this.name, "thorium seen:", mineral.mineralAmount, "at", mineral.pos);
                }
                this.mine(room);
                this.ship(room);
                if (this.exhausted(room)) this.beginTeardown();
            }
        }
        super.run();
        return "normal";
    }

    // The room's thorium mineral, mined out or not; null without vision.
    get mineral(): Mineral | null {
        const room = this.room;
        if (!room || !RESOURCE_THORIUM) return null;
        return room.find(FIND_MINERALS, { filter: m => m.mineralType === RESOURCE_THORIUM })[0] || null;
    }

    get extractor(): StructureExtractor | null {
        const mineral = this.mineral;
        if (!mineral) return null;
        return mineral.pos.lookFor(LOOK_STRUCTURES)
            .find(s => s.structureType === STRUCTURE_EXTRACTOR) as StructureExtractor | undefined || null;
    }

    // The room's thorium was seen and is now gone or empty. A mined-out
    // thorium mineral disappears from the room, so "no mineral" after one
    // was seen counts. False without vision.
    get minedOut(): boolean {
        if (!this.room || !this.mem.thoriumSeen) return false;
        const mineral = this.mineral;
        return !mineral || mineral.mineralAmount <= 0;
    }

    // Why no miner may be laid, or null when all three gates are open.
    get closed(): string | null {
        if (this.minedOut) return "thorium mined out";
        const mineral = this.mineral;
        if (!mineral) return "no thorium mineral";
        if (mineral.mineralAmount <= 0) return "thorium mined out";
        if (!this.extractor) return "no extractor";
        const terminal = this.room?.terminal;
        if (!terminal || !terminal.my) return "no terminal";
        return null;
    }

    // Walkable tiles beside the mineral: terrain non-wall (spots.ts) minus
    // any tile an obstacle structure of ours or anyone's occupies.
    get spots(): number {
        const mineral = this.mineral;
        if (!mineral) return 0;
        return getSpots(mineral.pos).filter(pos =>
            !pos.lookFor(LOOK_STRUCTURES).some(s => _.contains(OBSTACLE_OBJECT_TYPES, s.structureType))).length;
    }

    // Thorium in the room's terminal, 0 without one.
    get stock(): number {
        const T = RESOURCE_THORIUM;
        const term = this.room?.terminal;
        return term && T ? term.store[T] || 0 : 0;
    }

    mine(room: Room) {
        const closed = this.closed;
        if (closed) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "waiting on", closed, "in", room.name);
            return null;
        }
        return this.nJobs(Thoreater, this.spots);
    }

    // The destination's terminal when it can take a shipment from `room`.
    destTerminal(room: Room): StructureTerminal | null {
        const dest = this.destName;
        if (dest === room.name) return null;
        const term = Game.rooms[dest]?.terminal;
        return term && term.my ? term : null;
    }

    // Largest amount of `res`, at most `have`, this terminal can ship to
    // `dest` with its energy, at least TERMINAL_MIN_SEND; 0 when none.
    affordable(terminal: StructureTerminal, res: ResourceConstant, have: number, dest: string): number {
        const room = terminal.room.name;
        let amount = have;
        const budget = (cost: number) => res === RESOURCE_ENERGY ? amount + cost : cost;
        while (amount >= TERMINAL_MIN_SEND &&
            budget(Game.market.calcTransactionCost(amount, room, dest)) > terminal.store.energy) {
            amount = Math.floor(amount / 2);
        }
        return amount >= TERMINAL_MIN_SEND ? amount : 0;
    }

    // One send of `res` from the room's terminal to the destination; false
    // when nothing went.
    send(room: Room, res: ResourceConstant): boolean {
        const terminal = room.terminal;
        if (!terminal || !terminal.my || terminal.cooldown) return false;
        const destTerminal = this.destTerminal(room);
        if (!destTerminal) return false;
        const dest = destTerminal.room.name;
        const have = Math.min(terminal.store[res] || 0, destTerminal.store.getFreeCapacity(res) || 0);
        if (have < TERMINAL_MIN_SEND) return false;
        const amount = this.affordable(terminal, res, have, dest);
        if (!amount) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "terminal short of energy to ship", have, res, "to", dest);
            return false;
        }
        const err = terminal.send(res, amount, dest, this.name);
        if (err !== OK) {
            debug.log(this.name, "send failed", err, amount, res, "to", dest);
            return false;
        }
        debug.log(this.name, "sent", amount, res, "to", dest);
        return true;
    }

    // Ship the terminal's thorium to the destination when the terminal can.
    ship(room: Room) {
        if (!RESOURCE_THORIUM) return false;
        return this.send(room, RESOURCE_THORIUM);
    }

    // Teardown: ship whatever the terminal holds, energy last.
    shipAll(room: Room) {
        const terminal = room.terminal;
        if (!terminal || terminal.cooldown) return false;
        const others = (Object.keys(terminal.store) as ResourceConstant[])
            .filter(res => res !== RESOURCE_ENERGY && terminal.store[res] >= TERMINAL_MIN_SEND);
        for (const res of others) {
            if (this.send(room, res)) return true;
        }
        return this.send(room, RESOURCE_ENERGY);
    }

    // ---- teardown ----

    // Mined out (seen, now gone or empty), nothing banked, nobody still carrying.
    exhausted(room: Room): boolean {
        if (!this.minedOut) return false;
        if (this.stock > 0) return false;
        const mem = this.memory;
        return !mem.eggs.length && !mem.hatch.length && !mem.creeps.length;
    }

    beginTeardown() {
        this.mem.teardown = { phase: "missions", since: Game.time, wound: [] };
        debug.log(this.name, "TEARDOWN: thorium exhausted and terminal empty; winding down", this.roomName);
    }

    // Console: undo the teardown state while nothing has been destroyed.
    abortTeardown(): string {
        const phase = this.phase;
        if (!phase) return "not tearing down";
        if (phase === "destroy" || phase === "done") return `cannot abort in phase ${phase}`;
        const wound = this.mem.teardown?.wound || [];
        delete this.mem.teardown;
        debug.log(this.name, "teardown aborted in phase", phase, "; still wound down:", wound.join(",") || "none");
        return `aborted; reschedule by hand: ${wound.join(", ") || "nothing"}`;
    }

    setPhase(phase: Phase) {
        const td = this.mem.teardown!;
        debug.log(this.name, "TEARDOWN:", td.phase, "->", phase, "after", Game.time - td.since, "ticks");
        td.phase = phase;
        td.since = Game.time;
    }

    teardown(room: Room) {
        this.shipAll(room);
        this.unplan(room);
        switch (this.phase) {
            case "missions":
                if (this.windDownHomed()) this.setPhase("cleanup");
                return;
            case "cleanup":
                if (this.cleanup(room)) this.setPhase("destroy");
                return;
            case "destroy":
                if (this.destroy(room)) this.setPhase("done");
                return;
            case "done":
                debug.log(this.name, "TEARDOWN complete;", this.roomName, "unclaimed; killing");
                this.kill();
                delete Memory.missions[this.name];
                return;
        }
    }

    // Every other mission homed in this room: its "home" alias is this room,
    // or it has no home and its own room is this one (Hub, Startup).
    homedMissions(): Mission[] {
        return Service.all().filter(s => {
            if (!(s instanceof Mission) || s === this) return false;
            const home = s.getRoomName("home");
            return home ? home === this.roomName : s.roomName === this.roomName;
        }) as Mission[];
    }

    // Wind down the homed missions; true once none is scheduled any more.
    windDownHomed(): boolean {
        const wound = this.mem.teardown!.wound = this.mem.teardown!.wound || [];
        const live = this.homedMissions();
        for (const m of live) {
            if (m.windingDown) continue;
            m.windDown();
            if (!_.contains(wound, m.name)) wound.push(m.name);
            debug.log(this.name, "TEARDOWN: winding down", m.name);
        }
        return live.length === 0;
    }

    // Stop the room from building: drop its meta plan, remove its flags and
    // cancel any construction site. Repeated every teardown tick so nothing
    // replans it.
    unplan(room: Room) {
        const man = getMetaManager(room.name);
        if (man.metas.length) {
            debug.log(this.name, "TEARDOWN: dropping", man.metas.length, "metas in", room.name);
            man.metas = [];
            man.save();
        }
        for (const flag of room.find(FIND_FLAGS)) {
            debug.log(this.name, "TEARDOWN: removing flag", flag.name);
            flag.remove();
        }
        for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) site.remove();
    }

    // Phase 2; true when the room is drained.
    cleanup(room: Room): boolean {
        const loose = looseEnergy(room);
        const mem = this.memory;
        const busy = mem.eggs.length + mem.hatch.length + mem.creeps.length;
        const termEnergy = room.terminal?.store.energy || 0;
        if (loose < kEnergyEmpty && !busy && termEnergy < kTerminalEmpty) return true;
        if (loose < kEnergyEmpty && !busy && Game.time % kLogPace === 0) {
            debug.log(this.name, "TEARDOWN: room drained, waiting for the terminal to ship", termEnergy, "energy");
        }
        if (room.energyAvailable < kCleanupCost) return false;
        if (!room.findStructs(STRUCTURE_SPAWN).length) return false;
        const n = Math.min(kCleanupMax, Math.max(kCleanupMin, Math.floor(loose / kEnergyPerCleanup)));
        this.nJobs(Cleanup, n);
        return false;
    }

    // Phase 3; true once the controller has been unclaimed.
    destroy(room: Room): boolean {
        const all = room.find(FIND_STRUCTURES).filter(s => s.structureType !== STRUCTURE_CONTROLLER);
        if (!all.length) {
            const err = room.controller?.my ? room.controller.unclaim() : OK;
            if (err !== OK) {
                debug.log(this.name, "TEARDOWN: unclaim failed", err);
                return false;
            }
            return true;
        }
        const last = [STRUCTURE_SPAWN, STRUCTURE_TERMINAL] as StructureConstant[];
        const group =
            all.filter(s => s.structureType !== STRUCTURE_ROAD && !_.contains(last, s.structureType)).length ?
                all.filter(s => s.structureType !== STRUCTURE_ROAD && !_.contains(last, s.structureType)) :
            all.filter(s => s.structureType === STRUCTURE_ROAD).length ?
                all.filter(s => s.structureType === STRUCTURE_ROAD) :
                all;
        let n = 0;
        for (const s of group) {
            if (n >= kDestroyPerTick) break;
            const err = s.destroy();
            if (err !== OK) {
                debug.log(this.name, "TEARDOWN: destroy failed", err, s.structureType, s.pos);
                continue;
            }
            n++;
        }
        if (n) debug.log(this.name, "TEARDOWN: destroyed", n, "of", all.length, "structures");
        return false;
    }

    status(): string {
        const mineral = this.mineral;
        const td = this.mem.teardown;
        const tear = td ? ` TEARDOWN:${td.phase}(${Game.time - td.since}) wound:${(td.wound || []).length}` : "";
        const gate = this.closed ? ` closed:${this.closed}` : ` spots:${this.spots}`;
        return super.status() + ` visible:${!!this.room} thorium:${mineral?.mineralAmount ?? "-"}` +
            ` terminal:${this.stock} dest:${this.destName}${gate}${tear}`;
    }
}
