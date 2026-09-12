import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Scout } from "job.scout";
import { Immortan } from "job.immortan";
import { Warboy } from "job.warboy";

// The Season 11 reactor lives in the sector core: the centre room of each
// 10x10 sector, whose coordinates both end in 5 (W5N5, W15N25, E5S5, ...).
export function sectorCore(roomName: string): string | null {
    const parsed = /^([WE])(\d{1,2})([NS])(\d{1,2})$/.exec(roomName);
    if (!parsed) return null;
    const x = Math.floor(parseInt(parsed[2], 10) / 10) * 10 + 5;
    const y = Math.floor(parseInt(parsed[4], 10) / 10) * 10 + 5;
    return `${parsed[1]}${x}${parsed[3]}${y}`;
}

// Season 11's Reactor is a RoomObject, not a Structure: its prototype has only
// owner, my, store and continuousWork, so FIND_STRUCTURES never returns it.
// Confirmed on the seasonal server: FIND_REACTORS=10051, LOOK_REACTORS="reactor",
// RESOURCE_THORIUM="T".
declare global {
    interface ReactorObject extends RoomObject {
        id: Id<ReactorObject>
        owner?: Owner
        my: boolean
        store: Store<ResourceConstant, false>
        continuousWork: number
    }
    // Only defined on the seasonal server; guard with typeof before use.
    const FIND_REACTORS: FindConstant | undefined;
    const LOOK_REACTORS: LookConstant | undefined;
    const RESOURCE_THORIUM: ResourceConstant | undefined;
}

// The thorium mineral in `room` that can be mined right now: an extractor on
// it and thorium left. Null without visibility.
export function thoriumMineral(room: Room | null): Mineral | null {
    if (!room || !RESOURCE_THORIUM) return null;
    return room.find(FIND_MINERALS, {
        filter: m => m.mineralType === RESOURCE_THORIUM && m.mineralAmount > 0 &&
            m.pos.lookFor(LOOK_STRUCTURES).some(s => s.structureType === STRUCTURE_EXTRACTOR),
    })[0] || null;
}

// Ticks of one warboy round trip: ~250 harvesting (rate per WORK cancels
// against carry per CARRY), plus the walk both ways. Tune from observation.
const kWarboyCycle = 700;

export function findReactors(room: Room): ReactorObject[] {
    if (typeof FIND_REACTORS === "undefined") return [];
    return room.find(FIND_REACTORS as FindConstant) as unknown as ReactorObject[];
}

// Tick each mission last dumped its probe; module-level so it resets with the global.
const lastProbe = new Map<string, number>();

// Schedule from the console:
//   scheduleService('Reactor W6N8')     // args[1]=home room: spawns come from here, its
//                                       // sector core is the mission room
//   scheduleService('Reactor W6N8 2')   // optional args[2]=cap on the number of warboys
@register
export class Reactor extends Mission {
    // The room named in the command; also the scout's spawn room.
    get homeName() {
        return this.args[1];
    }

    // The mission room is the sector core, not the room on the command line.
    get roomName() {
        return sectorCore(this.homeName) || this.homeName;
    }

    getRoomName(alias = "") {
        if (alias === "home") return this.homeName;
        return super.getRoomName(alias);
    }

    run(): Priority {
        if (this.windingDown) return super.run();

        if (!this.room) {
            // No visibility at the core: a scout parks there so we can look around.
            this.nJobs(Scout, 1);
        } else {
            this.probe();
            this.hold();
            this.fuel();
        }
        super.run();
        return "normal";
    }

    // CLAIM creeps are expensive, so an Immortan is laid only when we can see
    // the reactor and it is not ours. Anyone can re-claim it, so this also
    // covers taking it back after a loss.
    hold() {
        const reactor = this.reactors[0];
        if (!reactor || reactor.my) return null;
        return this.nJobs(Immortan, 1);
    }

    // Optional cap on warboys from the schedule command; Infinity when absent.
    get maxWarboysArg() {
        return Number(this.args[2]) || Infinity;
    }

    // Enough warboys in flight to deliver 1 thorium per tick, the reactor's
    // burn rate: each delivers tripLoad per kWarboyCycle ticks. Only while the
    // home room can actually mine thorium and we can see the reactor.
    fuel() {
        const home = this.getRoom("home");
        if (!home || !thoriumMineral(home)) return null;
        if (!this.reactors.length) return null;
        const load = Warboy.tripLoad(home.energyCapacityAvailable);
        const n = Math.min(this.maxWarboysArg, kWarboyCycle / load);
        return this.nJobs(Warboy, n);
    }

    // Reactors in the core room; the seasonal server should have exactly one.
    get reactors(): ReactorObject[] {
        const room = this.room;
        return room ? findReactors(room) : [];
    }

    // Once a global reset (or every 500 ticks) log what the core's reactor
    // looks like so we can learn how it behaves.
    probe() {
        const room = this.room!;
        const last = lastProbe.get(this.name);
        if (last !== undefined && Game.time - last < 500) return;
        lastProbe.set(this.name, Game.time);
        const reactors = this.reactors;
        if (!reactors.length) {
            debug.log(this.name, "no reactor in", room.name, "structures:",
                JSON.stringify(_.countBy(room.find(FIND_STRUCTURES), s => s.structureType)));
            return;
        }
        for (const r of reactors) {
            debug.log(this.name, "reactor", r.id, r.pos, "owner:", r.owner?.username,
                "work:", r.continuousWork, "store:", JSON.stringify(r.store),
                "cap:", RESOURCE_THORIUM && r.store.getCapacity(RESOURCE_THORIUM),
                "effects:", JSON.stringify(r.effects));
        }
    }

    status(): string {
        const r = this.reactors[0];
        const state = r ? ` owner:${r.owner?.username ?? "-"} work:${r.continuousWork}` : "";
        return super.status() + ` core:${this.roomName} visible:${!!this.room} reactors:${this.reactors.length}${state}`;
    }
}
