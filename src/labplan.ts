import { register, Priority, Service } from "process";
import * as debug from "debug";
import * as k from "constants";

// LabPlan <room>: a stock-aware chooser for the room's labs, in place of
// struct.lab.js's autoReactAll (which picks from a fixed boost list and
// assumes every base mineral is to hand; it parked W25S7 on LH with no L
// in the room, Oct 2026). The labs themselves, the Chemist, lab.planType,
// fill/drain thresholds and boosts are all unchanged: this only decides
// what terminal.setLabs() is called with.
//
//   scheduleService('LabPlan W25S7')
//   getService('LabPlan W25S7').status()
//   getService('LabPlan W25S7').add('XZHO2', 3000)          // append a target
//   getService('LabPlan W25S7').add('G', 5000, 'XGHO2')     // ...ahead of another
//   getService('LabPlan W25S7').setQuota('XLHO2', 6000)
//   getService('LabPlan W25S7').remove('XGHO2')
//   getService('LabPlan W25S7').reset()                     // the default plan
//   getService('LabPlan W25S7').replan()                    // choose again now
//
// The plan (Memory.labplan[room].plan, console-edited, kDefaultPlan to
// start) is an ordered list of products with quotas. Every kPace ticks the
// first entry whose stock (terminal + storage) is under quota is walked
// down the Reactions table, deepest first as autoReact did, but a reaction
// is only chosen when both of its inputs are stocked at kMinInput or more;
// an intermediate under its quota (its own entry, else kIntermediate) is
// made before the step above it, one that cannot be made is skipped and the
// step above runs on what there is. An entry with nothing makeable in its
// chain gives way to the next, and with nothing at all the labs are
// cleared (the Chemist then drains them).
//
// Switching: the choice is applied at once when the labs are idle, the
// current product cannot run (an input gone from stock and labs) or has
// reached its quota; otherwise the current product holds for kHold ticks
// before a different choice replaces it, so the Chemist is not sent to
// refill the labs every cycle.
//
// While the service runs, Memory.rooms[x].labs.managed stops runLabs from
// calling autoReactAll in that room; kill() clears it.

export interface LabPlanEntry {
    res: ResourceConstant
    quota: number
}

interface LabPlanMem {
    plan: LabPlanEntry[]
    // The product the labs are set to (null: cleared), since when, and why.
    current?: ResourceConstant | null
    since?: number
    why?: string
}

declare global {
    interface Memory {
        labplan?: { [room: string]: LabPlanMem }
    }
    interface Room {
        orderedLabs(): StructureLab[]
    }
    interface StructureTerminal {
        setLabs(res: ResourceConstant): void
    }
    interface RoomMemory {
        labs?: { current?: string, order?: string[], managed?: boolean, [id: string]: any }
    }
}

// product -> its two inputs; base minerals map to [] (constants.js).
const Reactions = (k as any).Reactions as { [res: string]: string[] };

const kDefaultPlan: LabPlanEntry[] = [
    { res: RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, quota: 3000 },
    { res: RESOURCE_CATALYZED_GHODIUM_ALKALIDE, quota: 3000 },
];
// Stock to build of an intermediate with no entry of its own before the
// step above it runs.
const kIntermediate = 2000;
// Both inputs must be stocked this much for a reaction to be chosen.
const kMinInput = 300;
// Ticks between choices, and the least a running product holds before a
// different choice replaces it.
const kPace = 100;
const kHold = 500;
const kLogPace = 500;

@register
export class LabPlan extends Service {
    get roomName(): string {
        return this.args[1];
    }

    get room(): Room | null {
        return Game.rooms[this.roomName] || null;
    }

    get mem(): LabPlanMem {
        const all = Memory.labplan = Memory.labplan || {};
        return all[this.roomName] = all[this.roomName] || { plan: _.cloneDeep(kDefaultPlan) };
    }

    get plan(): LabPlanEntry[] {
        return this.mem.plan;
    }

    // Console: edit the plan. add() appends, or inserts ahead of `before`;
    // an existing entry has its quota updated in place.
    add(res: ResourceConstant, quota: number, before?: ResourceConstant): LabPlanEntry[] {
        if (!Reactions[res]) throw new Error(`${res} is not a lab product`);
        const plan = this.plan;
        const have = _.find(plan, e => e.res === res);
        if (have) {
            have.quota = quota;
            return plan;
        }
        const i = before ? _.findIndex(plan, e => e.res === before) : -1;
        if (i >= 0) plan.splice(i, 0, { res, quota });
        else plan.push({ res, quota });
        return plan;
    }

    remove(res: ResourceConstant): LabPlanEntry[] {
        _.remove(this.plan, e => e.res === res);
        return this.plan;
    }

    setQuota(res: ResourceConstant, quota: number): LabPlanEntry[] {
        return this.add(res, quota);
    }

    reset(): LabPlanEntry[] {
        return this.mem.plan = _.cloneDeep(kDefaultPlan);
    }

    replan(): string {
        this.step(true);
        return this.status();
    }

    // Terminal plus storage.
    stock(res: string): number {
        const room = this.room;
        if (!room) return 0;
        const r = res as ResourceConstant;
        return (room.terminal?.store[r] || 0) + (room.storage?.store[r] || 0);
    }

    inputs(res: string): string[] {
        return Reactions[res] || [];
    }

    isBase(res: string): boolean {
        return !this.inputs(res).length;
    }

    // Its own quota when listed, else kIntermediate.
    quotaOf(res: string): number {
        return _.find(this.plan, e => e.res === res)?.quota ?? kIntermediate;
    }

    // The reaction to run toward `res`: an under-quota compound input that
    // can itself be made, deepest first; else `res` when both inputs are
    // stocked; else null.
    makeable(res: string): ResourceConstant | null {
        const ins = this.inputs(res);
        if (!ins.length) return null;
        for (const part of ins) {
            if (this.isBase(part)) continue;
            if (this.stock(part) >= this.quotaOf(part)) continue;
            const sub = this.makeable(part);
            if (sub) return sub;
        }
        if (_.every(ins, p => this.stock(p) >= kMinInput)) return res as ResourceConstant;
        return null;
    }

    // The first plan entry under quota with something makeable in its chain.
    choose(): [ResourceConstant | null, string] {
        for (const e of this.plan) {
            const have = this.stock(e.res);
            if (have >= e.quota) continue;
            const r = this.makeable(e.res);
            if (r) return [r, `toward ${e.res} ${have}/${e.quota}`];
        }
        return [null, "nothing makeable under quota"];
    }

    // Whether the current product can still run (each input in stock or in
    // a lab) and is still wanted (under its quota).
    viable(res: ResourceConstant): boolean {
        const room = this.room;
        if (!room) return false;
        if (this.stock(res) >= this.quotaOf(res)) return false;
        const labs = room.findStructs(STRUCTURE_LAB) as StructureLab[];
        return _.every(this.inputs(res), p =>
            this.stock(p) + _.sum(labs, l => l.mineralType === p ? l.mineralAmount || 0 : 0) >= LAB_REACTION_AMOUNT);
    }

    // True on the first run after a global reset, so the choice is made at
    // once rather than at the next pace tick.
    private booted = false;

    run(): Priority {
        const room = this.room;
        if (!room?.controller?.my || !room.terminal?.my) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "no owned room with a terminal at", this.roomName);
            return "low";
        }
        const labmem = room.memory.labs = room.memory.labs || {};
        labmem.managed = true;
        if (room.findStructs(STRUCTURE_LAB).length < 3) {
            if (Game.time % kLogPace === 0) debug.log(this.name, "under 3 labs in", this.roomName);
            return "low";
        }
        if (this.booted && (Game.time + room.terminal.pos.xy) % kPace !== 0) return "low";
        this.booted = true;
        this.step();
        return "low";
    }

    step(force = false) {
        const [want, why] = this.choose();
        const cur = this.mem.current || null;
        if (want === cur) return;
        const stale = !cur || !this.viable(cur) || Game.time - (this.mem.since || 0) >= kHold;
        if (!force && !stale) return;
        this.apply(want, why);
    }

    apply(res: ResourceConstant | null, why: string) {
        const room = this.room!;
        if (res) {
            room.terminal!.setLabs(res);
        } else {
            for (const lab of room.orderedLabs()) lab.planType = null as unknown as ResourceConstant;
            delete room.memory.labs!.current;
        }
        const mem = this.mem;
        mem.current = res;
        mem.since = Game.time;
        mem.why = why;
        debug.log(this.name, "labs ->", res || "idle", `(${why})`);
    }

    kill() {
        const labmem = Memory.rooms[this.roomName]?.labs;
        if (labmem) delete labmem.managed;
        super.kill();
    }

    // Every compound and base mineral in the plan's chains, plan order,
    // deepest last.
    chain(): string[] {
        const out: string[] = [];
        const walk = (res: string) => {
            if (_.contains(out, res)) return;
            out.push(res);
            for (const p of this.inputs(res)) walk(p);
        };
        for (const e of this.plan) walk(e.res);
        return out;
    }

    status(): string {
        const mem = this.mem;
        const cur = mem.current ? `${mem.current} since:${Game.time - (mem.since || 0)}` : "idle";
        const plan = this.plan.map(e => `${e.res}:${this.stock(e.res)}/${e.quota}`).join(" ");
        const stock = this.chain().map(r => `${r}:${this.stock(r)}`).join(" ");
        return super.status() + ` room:${this.roomName} labs:${cur} (${mem.why || "-"}) plan: ${plan || "none"} | stock: ${stock}`;
    }
}
