import { Mission } from "mission";
import { register, Priority } from "process";
import * as debug from "debug";
import { Scout } from "job.scout";
import { Immortan } from "job.immortan";
import { Warboy } from "job.warboy";
import { sectorCore, findReactors, thoriumMineral } from "reactor";

// Ticks of one warboy round trip: ~250 harvesting (rate per WORK cancels
// against carry per CARRY), plus the walk both ways. Tune from observation.
const kWarboyCycle = 700;

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
