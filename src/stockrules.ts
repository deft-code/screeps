import { cfg } from "marketcfg";

// Stock rules: what the trader may do with each resource, by how much of it
// a room holds. Design: docs/market-design.md, section 8 (bands, 8 Nov 2026).
//
// Seven optional, monotone boundaries cut the stock axis into eight bands:
//
//   0   need   stock   hold   goodbuy   arb   clear   glut         -> stock
//   | need | stock | hold | goodbuy | arb | clear | glut | liquidate
//
// Each band has a buy cap and a sell floor as multipliers of the fair prices
// (fair buy = min(ask mid, ask slow), fair sell = max(bid mid, bid slow)),
// interpolated linearly inside the band where its two ends differ; a closed
// side never deals. `m` is the "very good" margin (0.15 or 0.10, the trader's
// paper variants):
//
//   band       buy cap            sell floor
//   need       2.0 -> 1.0         closed
//   stock      1 - m              closed
//   hold       closed             closed
//   goodbuy    1.0                1 + m
//   arb        1.0                1 + m -> 1.0
//   clear      1.0 -> 1 - m       1.0
//   glut       closed             1.0 -> 0.5
//   liquidate  closed             0 (any real bid)
//
// A missing boundary below the highest one given collapses its band to
// nothing (it takes the value of the boundary below it, 0 under the first).
// Missing boundaries above the highest one given do not collapse: the band
// that boundary opens runs to infinity, so only a rule with `glut` ever
// liquidates (without `glut` but with `clear`, the glut band runs to
// infinity; with `arb` the highest, the clear band does). A band running to
// infinity keeps the multipliers of its lower end. Boundaries must be
// monotone (need <= stock <= ... <= glut among those present), else the rule
// is rejected (logged once, the resource is not traded).
//
// A rule is the class default, overlaid by kRules (the hardcoded exceptions),
// overlaid by Memory.marketcfg.rules (console overrides: stockRule()).
// Overrides are meant to be temporary: stockRules("ts") prints them as lines
// for kRules.
export interface StockRule {
    need?: number
    stock?: number
    hold?: number
    goodbuy?: number
    arb?: number
    clear?: number
    glut?: number
    // Never sell under / buy over this many credits a unit.
    floor?: number
    ceil?: number
    // Units behind a price: the tracker averages the best `depth` units of a
    // side (market.ts). A side with less on offer has no price.
    depth?: number
    // Most units in one deal.
    chunk?: number
    // Dry run only: stock the simulation assumes on top of what the room holds.
    start?: number
}

export const kBounds = ["need", "stock", "hold", "goodbuy", "arb", "clear", "glut"] as const;
export const kBands = ["need", "stock", "hold", "goodbuy", "arb", "clear", "glut", "liquidate"] as const;
export type Band = typeof kBands[number];

// The default "very good" margin: 15% inside the fair price.
export const kVeryGood = 0.15;

export interface BandInfo {
    band: Band
    // The band's stock range [lo, hi); hi is Infinity for liquidate.
    lo: number
    hi: number
    // Multipliers of fair buy / fair sell; undefined = that side is closed.
    buyMult?: number
    sellMult?: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// The band a stock is in and the multipliers in force there. The position
// inside a band is clamped to [0, 1], a band of zero width is never entered
// (stock < hi fails when lo == hi), and a band running to infinity sits at
// its lower end (t = 0), so nothing divides by zero.
export function bandOf(rule: StockRule, stock: number, margin = kVeryGood): BandInfo {
    // A rule with no boundary at all trades nothing; tradeable() keeps such
    // rules out of the trader anyway.
    if (!tradeable(rule)) return { band: "hold", lo: 0, hi: Infinity };
    // The highest boundary given: the band it opens is the last one.
    let top = -1;
    kBounds.forEach((f, i) => { if (rule[f] !== undefined) top = i; });
    let lo = 0;
    for (let i = 0; i < kBounds.length; i++) {
        const b = rule[kBounds[i]];
        const hi = i > top ? Infinity : b === undefined ? lo : Math.max(lo, b);
        if (stock < hi) {
            const t = hi === Infinity ? 0 : hi > lo ? Math.min(1, Math.max(0, (stock - lo) / (hi - lo))) : 0;
            const band = kBands[i];
            const info: BandInfo = { band, lo, hi };
            switch (band) {
                case "need": info.buyMult = lerp(2.0, 1.0, t); break;
                case "stock": info.buyMult = 1 - margin; break;
                case "hold": break;
                case "goodbuy": info.buyMult = 1.0; info.sellMult = 1 + margin; break;
                case "arb": info.buyMult = 1.0; info.sellMult = lerp(1 + margin, 1.0, t); break;
                case "clear": info.buyMult = lerp(1.0, 1 - margin, t); info.sellMult = 1.0; break;
                case "glut": info.sellMult = lerp(1.0, 0.5, t); break;
            }
            return info;
        }
        lo = hi;
    }
    return { band: "liquidate", lo, hi: Infinity, sellMult: 0 };
}

// "glut 0.68s" / "stock 0.85b" / "goodbuy 1.00b/1.15s" / "hold": a band and
// its multipliers, for the console.
export function bandStr(b: BandInfo): string {
    const sides = [b.buyMult === undefined ? "" : `${b.buyMult.toFixed(2)}b`, b.sellMult === undefined ? "" : `${b.sellMult.toFixed(2)}s`]
        .filter(s => s).join("/");
    return sides ? `${b.band} ${sides}` : b.band;
}

export type ResClass = "base" | "tier3used" | "tier3unused" | "compound" | "energy" | "factory0" | "factory1" | "factory2" | "other";

const kBase: ResourceConstant[] = [
    RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_LEMERGIUM,
    RESOURCE_KEANIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST,
];

// Ghodium and the tier-3 boosts the labs use; the other tier-3 boosts are
// sold down and (on the band table's intent) not bought.
const kTier3Used: ResourceConstant[] = [
    RESOURCE_GHODIUM, RESOURCE_CATALYZED_GHODIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
    RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
    RESOURCE_CATALYZED_LEMERGIUM_ACID, RESOURCE_CATALYZED_UTRIUM_ACID,
];

const kDefaultDepth = 10000;

// The class defaults of 8 Nov 2026 (docs/market-design.md section 8), per
// owned room. The factory classes are cleared, never stocked: the clear band
// up to 1k, the glut band from 1k to 10k, liquidate above. Commodity NPC
// bids follow a daily average players manipulate (cell is being depressed
// by earwig), so neither the bids nor the tracker's fair price is an anchor
// worth holding stock against.
const kClassRules: Record<ResClass, StockRule> = {
    base: { need: 3000, stock: 6000, hold: 6000, goodbuy: 12000, arb: 24000, clear: 40000, glut: 100000, depth: 10000, chunk: 1000 },
    tier3used: { need: 1000, stock: 3000, hold: 3000, goodbuy: 6000, arb: 10000, clear: 15000, glut: 25000, depth: 5000, chunk: 1000 },
    tier3unused: { hold: 0, goodbuy: 1000, arb: 3000, clear: 5000, glut: 8000, depth: 5000, chunk: 1000 },
    compound: { stock: 1000, hold: 3000, goodbuy: 4000, arb: 6000, clear: 7000, glut: 8000 },
    energy: { need: 10000, stock: 50000, hold: 900000, goodbuy: 910000, arb: 920000, clear: 930000, glut: 940000, chunk: 5000 },
    factory0: { need: 0, stock: 0, hold: 0, goodbuy: 0, arb: 0, clear: 1000, glut: 10000, depth: 3000, chunk: 500 },
    factory1: { need: 0, stock: 0, hold: 0, goodbuy: 0, arb: 0, clear: 1000, glut: 10000, depth: 200, chunk: 100 },
    factory2: { need: 0, stock: 0, hold: 0, goodbuy: 0, arb: 0, clear: 1000, glut: 10000, depth: 30, chunk: 10 },
    other: {},
};

// The hardcoded exceptions to the class defaults.
const kRules: Partial<Record<ResourceConstant, StockRule>> = {
    // Temporary (8 Nov 2026): W3N4 held 111k K, so it sells in the glut band
    // instead of liquidating.
    K: { glut: 150000 },
};

const kFields: (keyof StockRule)[] = [...kBounds, "floor", "ceil", "depth", "chunk", "start"];

let classes: Map<string, ResClass> | undefined;
function classMap(): Map<string, ResClass> {
    if (classes) return classes;
    const map = new Map<string, ResClass>();
    for (const res of kBase) map.set(res, "base");
    for (const res of kTier3Used) map.set(res, "tier3used");
    map.set(RESOURCE_ENERGY, "energy");
    // The lab compounds from REACTIONS: tier 1 (two letters: OH, ZK, UL, UH,
    // UO, ...), tier 2 (UH2O, UHO2, ...) and tier 3 (X + a tier-2 compound).
    for (const a in REACTIONS) {
        for (const b in (REACTIONS as any)[a]) {
            const res = (REACTIONS as any)[a][b] as string;
            if (map.has(res)) continue;
            if (res.length === 5 && res[0] === "X") map.set(res, "tier3unused");
            else if (res !== RESOURCE_GHODIUM && res.length >= 2) map.set(res, "compound");
        }
    }
    for (const res in COMMODITIES) {
        // COMMODITIES also lists the decompressions (U from utrium_bar) and
        // energy (from battery): those keep the class they have, or none.
        if (map.has(res)) continue;
        const level = (COMMODITIES as any)[res].level || 0;
        if (level === 0) map.set(res, "factory0");
        else if (level === 1) map.set(res, "factory1");
        else if (level === 2) map.set(res, "factory2");
    }
    return classes = map;
}

export function classOf(res: string): ResClass {
    return classMap().get(res) || "other";
}

const complained = new Set<string>();

// Why a rule cannot be traded on, or "" when it is sound: the boundaries
// present must not decrease.
function invalid(rule: StockRule): string {
    let prev: string | undefined;
    for (const f of kBounds) {
        const v = rule[f];
        if (v === undefined) continue;
        if (typeof v !== "number" || isNaN(v) || v < 0) return `${f} ${v} is not a stock`;
        if (prev !== undefined && v < rule[prev as keyof StockRule]!) return `${f} ${v} < ${prev} ${rule[prev as keyof StockRule]}`;
        prev = f;
    }
    return "";
}

// The merged rule for a resource. A rule that fails validation keeps only its
// tracking fields (depth), so the resource is priced but never traded.
export function ruleFor(res: string): StockRule {
    const override = (cfg().rules || {})[res];
    const hard = (kRules as any)[res];
    const rule: StockRule = Object.assign({}, kClassRules[classOf(res)], hard, override);
    const why = invalid(rule);
    if (why) {
        // A class default complains once for the whole class.
        const who = override || hard ? res : `class ${classOf(res)}`;
        if (!complained.has(who + why)) {
            complained.add(who + why);
            console.log(`stockrules: rule for ${who} rejected (${why}): ${JSON.stringify(rule)}`);
        }
        return { depth: rule.depth };
    }
    return rule;
}

export function depthFor(res: string): number {
    const override = (cfg().rules || {})[res];
    if (override && override.depth > 0) return override.depth;
    const hard = (kRules as any)[res] as StockRule | undefined;
    return (hard && hard.depth) || kClassRules[classOf(res)].depth || kDefaultDepth;
}

// Does the rule let the trader do anything at all?
export function tradeable(rule: StockRule): boolean {
    return kBounds.some(f => rule[f] !== undefined);
}

// Every resource with a tradeable rule: those of a class with boundaries,
// the hardcoded ones and the overridden ones.
export function ruledResources(): string[] {
    const out = new Set<string>();
    for (const [res, klass] of classMap()) {
        if (tradeable(kClassRules[klass])) out.add(res);
    }
    for (const res in kRules) out.add(res);
    for (const res in cfg().rules || {}) out.add(res);
    return Array.from(out).filter(res => tradeable(ruleFor(res)));
}

// The real stock of a resource in a room: storage, terminal and factory
// (labs excluded: they are LabPlan's working stock).
export function roomStock(room: Room, res: ResourceConstant): number {
    let n = 0;
    for (const s of [room.storage, room.terminal, ...room.findStructs(STRUCTURE_FACTORY)]) {
        if (s && s.my) n += s.store[res] || 0;
    }
    return n;
}

function terminalRooms(): Room[] {
    return _.filter(Game.rooms, r => !!r.terminal && r.terminal.my && !!r.controller && r.controller.my);
}

// Console: stockRule("H") shows the merged rule; stockRule("H", {glut:
// 60000}) overrides fields; stockRule("H", null) drops the override.
export function stockRule(res: string, patch?: { [field: string]: number } | null): string {
    const all = cfg().rules = cfg().rules || {};
    if (patch === null) {
        delete all[res];
    } else if (patch) {
        const bad = Object.keys(patch).filter(f => !_.contains(kFields, f) || typeof patch[f] !== "number");
        if (bad.length) return `unknown or non-numeric fields: ${bad.join(", ")} (fields: ${kFields.join(", ")})`;
        all[res] = Object.assign(all[res] || {}, patch);
    }
    const rule = ruleFor(res);
    const bands = terminalRooms().map(r => { const s = roomStock(r, res as ResourceConstant); return `${r.name} ${s} ${bandStr(bandOf(rule, s))}`; });
    return `${res} [${classOf(res)}] ${JSON.stringify(rule)}` + (all[res] ? ` override ${JSON.stringify(all[res])}` : "") +
        (bands.length ? ` | ${bands.join(", ")}` : "");
}

// Console: stockRules() lists every tradeable rule, overridden fields
// starred (an override from Memory.marketcfg.rules or a kRules exception),
// then each terminal room's stock and the band it is in; stockRules("ts")
// prints the console overrides as lines for kRules.
export function stockRules(format?: string): string {
    const overrides = cfg().rules || {};
    if (format === "ts") {
        const lines = Object.keys(overrides).sort().map(res => {
            const merged = Object.assign({}, (kRules as any)[res], overrides[res]);
            return `    ${/^\w+$/.test(res) ? res : JSON.stringify(res)}: ${JSON.stringify(merged).replace(/"(\w+)":/g, "$1: ").replace(/,/g, ", ")},`;
        });
        return lines.length ? lines.join("\n") : "no overrides";
    }
    const rooms = terminalRooms();
    const lines: string[] = [];
    for (const res of ruledResources().sort((a, b) => classOf(a).localeCompare(classOf(b)) || a.localeCompare(b))) {
        const rule = ruleFor(res);
        const over = Object.assign({}, (kRules as any)[res], overrides[res]);
        const cells = kFields.filter(f => rule[f] !== undefined).map(f => `${f}${f in over ? "*" : ""}:${rule[f]}`);
        const bands = rooms.map(r => { const s = roomStock(r, res as ResourceConstant); return `${r.name}:${s} ${bandStr(bandOf(rule, s))}`; });
        lines.push(`${res} [${classOf(res)}] ${cells.join(" ")}${bands.length ? " | " + bands.join(", ") : ""}`);
    }
    return lines.join("\n");
}
