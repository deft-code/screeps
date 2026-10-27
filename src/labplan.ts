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
// Idle ladder (idle(), docs/balance-design.md): when no plan entry has a
// makeable step (plan done, or blocked on stock) the labs run, in order,
// the first rung whose inputs are stocked at kMinInput: X with the tier-2
// compound held most of (its catalyzed product); OH with the tier-1 held
// most of (its tier-2); O and H into OH while OH is under kIdleHydroxide;
// ZK and UL into G. An idle choice (memory.idle) has no quota and no hold,
// but a running one is kept while its inputs last and its rung is still
// the top one that applies, so the labs do not hop between two tier-2s.
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
    // The current product came from the idle ladder, not the plan.
    idle?: boolean
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
// The game's input -> input -> product table, loosely typed for lookups by
// resource variable (its declared type is a literal map per reagent).
const ReactionOf = REACTIONS as unknown as { [a: string]: { [b: string]: ResourceConstant } };

const kDefaultPlan: LabPlanEntry[] = [
    // 3000 each until 27 Oct 2026 (10000 by console edit before that).
    { res: RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, quota: 20000 },
    { res: RESOURCE_CATALYZED_GHODIUM_ALKALIDE, quota: 20000 },
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

// The idle ladder's rungs: tier-1 compounds (base + H or O), tier-2
// (tier-1 + OH), and how much OH the O + H rung builds.
const kTier1: ResourceConstant[] = [
    RESOURCE_UTRIUM_HYDRIDE, RESOURCE_UTRIUM_OXIDE, RESOURCE_KEANIUM_HYDRIDE, RESOURCE_KEANIUM_OXIDE,
    RESOURCE_LEMERGIUM_HYDRIDE, RESOURCE_LEMERGIUM_OXIDE, RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_ZYNTHIUM_OXIDE,
    RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM_OXIDE,
];
const kTier2: ResourceConstant[] = [
    RESOURCE_UTRIUM_ACID, RESOURCE_UTRIUM_ALKALIDE, RESOURCE_KEANIUM_ACID, RESOURCE_KEANIUM_ALKALIDE,
    RESOURCE_LEMERGIUM_ACID, RESOURCE_LEMERGIUM_ALKALIDE, RESOURCE_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_ALKALIDE,
    RESOURCE_GHODIUM_ACID, RESOURCE_GHODIUM_ALKALIDE,
];
const kIdleHydroxide = 2000;

// Which rung of the idle ladder makes `res`: 1 catalyze, 2 hydrate, 3 OH,
// 4 G; 0 for anything else.
function rungOf(res: string): number {
    const ins = Reactions[res] || [];
    if (_.contains(ins, RESOURCE_CATALYST)) return 1;
    if (_.contains(ins, RESOURCE_HYDROXIDE)) return 2;
    if (res === RESOURCE_HYDROXIDE) return 3;
    if (res === RESOURCE_GHODIUM) return 4;
    return 0;
}

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

    // The first plan entry under quota with something makeable in its chain,
    // else the idle ladder's rung, else nothing. The third value says the
    // choice is an idle one.
    choose(): [ResourceConstant | null, string, boolean] {
        for (const e of this.plan) {
            const have = this.stock(e.res);
            if (have >= e.quota) continue;
            const r = this.makeable(e.res);
            if (r) return [r, `toward ${e.res} ${have}/${e.quota}`, false];
        }
        const idle = this.idle();
        if (idle) return [idle[0], idle[1], true];
        return [null, "nothing makeable under quota", false];
    }

    // Of `list`, the resource stocked at kMinInput or more that we hold the
    // most of; null when none is.
    richest(list: ResourceConstant[]): ResourceConstant | null {
        const have = list.filter(r => this.stock(r) >= kMinInput);
        return have.length ? _.max(have, r => this.stock(r)) : null;
    }

    // The idle ladder (file header). A running idle product whose inputs
    // are still stocked is kept while its rung is still the first that
    // applies.
    idle(): [ResourceConstant, string] | null {
        const s = (r: string) => this.stock(r);
        const mem = this.mem;
        const cur = mem.idle && mem.current ? mem.current : null;
        const keep = (rung: number): [ResourceConstant, string] | null =>
            cur && rungOf(cur) === rung && _.every(this.inputs(cur), p => s(p) >= kMinInput) ? [cur, mem.why || "idle"] : null;

        // REACTIONS[a][b] is the game's product table (ReactionOf); every
        // tier-1 has an OH product and every tier-2 an X product.
        if (s(RESOURCE_CATALYST) >= kMinInput) {
            const t2 = this.richest(kTier2);
            if (t2) return keep(1) || [ReactionOf[RESOURCE_CATALYST][t2], `idle: catalyzing ${t2}`];
        }
        if (s(RESOURCE_HYDROXIDE) >= kMinInput) {
            const t1 = this.richest(kTier1);
            if (t1) return keep(2) || [ReactionOf[t1][RESOURCE_HYDROXIDE], `idle: ${t1} + OH`];
        }
        if (s(RESOURCE_HYDROXIDE) < kIdleHydroxide && s(RESOURCE_OXYGEN) >= kMinInput && s(RESOURCE_HYDROGEN) >= kMinInput) {
            return [RESOURCE_HYDROXIDE, `idle: OH toward ${kIdleHydroxide}`];
        }
        if (s(RESOURCE_ZYNTHIUM_KEANITE) >= kMinInput && s(RESOURCE_UTRIUM_LEMERGITE) >= kMinInput) {
            return [RESOURCE_GHODIUM, "idle: ZK + UL"];
        }
        return null;
    }

    // Whether the current product can still run (each input in stock or in
    // a lab) and is still wanted (under its quota; an idle product has none).
    viable(res: ResourceConstant): boolean {
        const room = this.room;
        if (!room) return false;
        if (!this.mem.idle && this.stock(res) >= this.quotaOf(res)) return false;
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
        const [want, why, idle] = this.choose();
        const mem = this.mem;
        const cur = mem.current || null;
        if (want === cur) {
            // The same product, but now the plan's (or the ladder's): note it.
            if (cur && idle !== !!mem.idle) {
                mem.idle = idle;
                mem.why = why;
            }
            // Idle from the start, with the labs still on autoReactAll's last
            // plan (W26S8 held L/H/LH from before its LabPlan, 27 Oct 2026):
            // clear them, or the Chemist keeps filling a lab nobody runs.
            if (!cur && this.room?.memory.labs?.current) this.apply(null, why, false);
            return;
        }
        // An idle choice has no hold: the ladder's answer rules at once.
        const stale = !cur || !!mem.idle || !this.viable(cur) || Game.time - (mem.since || 0) >= kHold;
        if (!force && !stale) return;
        this.apply(want, why, idle);
    }

    apply(res: ResourceConstant | null, why: string, idle = false) {
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
        mem.idle = idle;
        debug.log(this.name, "labs ->", res || "idle", `(${why})`);
    }

    kill() {
        const labmem = Memory.rooms[this.roomName]?.labs;
        if (labmem) delete labmem.managed;
        super.kill();
    }

    // Every compound and base mineral in the plan's chains, plan order,
    // deepest last; then the current idle product's, if any.
    chain(): string[] {
        const out: string[] = [];
        const walk = (res: string) => {
            if (_.contains(out, res)) return;
            out.push(res);
            for (const p of this.inputs(res)) walk(p);
        };
        for (const e of this.plan) walk(e.res);
        if (this.mem.idle && this.mem.current) walk(this.mem.current);
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
