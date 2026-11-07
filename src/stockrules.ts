import { cfg } from "marketcfg";

// Stock rules: what the trader may do with each resource, by how much of it
// a room holds. Design: docs/market-design.md.
//
// Four thresholds, two independent pairs:
//
//   stock <  need     buy at market (price guards only)
//   stock <  want     buy when the price is a good buy
//   stock >  surplus  sell when the price is a good sell
//   stock >  glut     sell at market (price guards only)
//
// need <= want and surplus <= glut. `want` may sit above `surplus`: between
// the two both optional sides are open and the trader works the resource
// for profit, buying under its fair buy price and selling over its fair sell
// price. A rule with need > surplus or need >= glut would buy what it must
// then sell, so it is rejected (logged once, the resource is not traded).
//
// A rule is the class default, overlaid by kRules (the hardcoded exceptions),
// overlaid by Memory.marketcfg.rules (console overrides: stockRule()).
// Overrides are meant to be temporary: stockRules("ts") prints them as lines
// for kRules.
export interface StockRule {
    need?: number
    want?: number
    surplus?: number
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

export type ResClass = "base" | "ghodium" | "tier3" | "factory0" | "factory1" | "factory2" | "other";

const kBase: ResourceConstant[] = [
    RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_LEMERGIUM,
    RESOURCE_KEANIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST,
];

const kDefaultDepth = 10000;

// The class defaults are the dry-run assumptions of 6 Nov 2026: base
// minerals, ghodium and the tier-3 boosts want 5k with a surplus of 3k (a
// working band), level-0 factory products want 3k with a surplus of 0, and
// the level-1 and level-2 commodities are assumed to start at 1000 and 100
// units, sold from there and bought back up to it. Tier-3 boosts also carry
// a need of a few units: the unit an elevated bid is probed with.
const kClassRules: Record<ResClass, StockRule> = {
    base: { want: 5000, surplus: 3000, depth: 10000, chunk: 1000 },
    ghodium: { want: 5000, surplus: 3000, depth: 5000, chunk: 1000 },
    tier3: { need: 10, want: 5000, surplus: 3000, depth: 5000, chunk: 1000 },
    factory0: { want: 3000, surplus: 0, depth: 3000, chunk: 500 },
    factory1: { want: 1000, surplus: 0, depth: 200, chunk: 100, start: 1000 },
    factory2: { want: 100, surplus: 0, depth: 30, chunk: 10, start: 100 },
    other: {},
};

// The hardcoded exceptions to the class defaults. Empty so far.
const kRules: Partial<Record<ResourceConstant, StockRule>> = {
};

const kFields: (keyof StockRule)[] = ["need", "want", "surplus", "glut", "floor", "ceil", "depth", "chunk", "start"];

let classes: Map<string, ResClass> | undefined;
function classMap(): Map<string, ResClass> {
    if (classes) return classes;
    const map = new Map<string, ResClass>();
    for (const res of kBase) map.set(res, "base");
    map.set(RESOURCE_GHODIUM, "ghodium");
    for (const res of RESOURCES_ALL) {
        // The catalyzed boosts: X + a tier-2 compound.
        if (res.length === 5 && res[0] === "X") map.set(res, "tier3");
    }
    for (const res in COMMODITIES) {
        // COMMODITIES also lists the decompressions (U from utrium_bar) and
        // energy (from battery): those keep the class they have, or none.
        if (map.has(res) || res === RESOURCE_ENERGY) continue;
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

// Why a rule cannot be traded on, or "" when it is sound.
function invalid(rule: StockRule): string {
    const { need, want, surplus, glut } = rule;
    if (need !== undefined && want !== undefined && need > want) return "need > want";
    if (surplus !== undefined && glut !== undefined && surplus > glut) return "surplus > glut";
    if (need !== undefined && surplus !== undefined && need > surplus) return "need > surplus";
    if (need !== undefined && glut !== undefined && need >= glut) return "need >= glut";
    return "";
}

// The merged rule for a resource. A rule that fails validation keeps only its
// tracking fields (depth), so the resource is priced but never traded.
export function ruleFor(res: string): StockRule {
    const override = (cfg().rules || {})[res];
    const rule: StockRule = Object.assign({}, kClassRules[classOf(res)], (kRules as any)[res], override);
    const why = invalid(rule);
    if (why) {
        if (!complained.has(res + why)) {
            complained.add(res + why);
            console.log(`stockrules: rule for ${res} rejected (${why}): ${JSON.stringify(rule)}`);
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
    return rule.need !== undefined || rule.want !== undefined || rule.surplus !== undefined || rule.glut !== undefined;
}

// Every resource with a tradeable rule: those of a class with thresholds,
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

// Console: stockRule("H") shows the merged rule; stockRule("H", {surplus:
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
    return `${res} [${classOf(res)}] ${JSON.stringify(ruleFor(res))}` + (all[res] ? ` override ${JSON.stringify(all[res])}` : "");
}

// Console: stockRules() lists every tradeable rule, overridden fields
// starred; stockRules("ts") prints the overrides as lines for kRules.
export function stockRules(format?: string): string {
    const overrides = cfg().rules || {};
    if (format === "ts") {
        const lines = Object.keys(overrides).sort().map(res => {
            const merged = Object.assign({}, (kRules as any)[res], overrides[res]);
            return `    ${/^\w+$/.test(res) ? res : JSON.stringify(res)}: ${JSON.stringify(merged).replace(/"(\w+)":/g, "$1: ").replace(/,/g, ", ")},`;
        });
        return lines.length ? lines.join("\n") : "no overrides";
    }
    const lines: string[] = [];
    for (const res of ruledResources().sort((a, b) => classOf(a).localeCompare(classOf(b)) || a.localeCompare(b))) {
        const rule = ruleFor(res);
        const over = overrides[res] || {};
        const cells = kFields.filter(f => rule[f] !== undefined).map(f => `${f}${f in over ? "*" : ""}:${rule[f]}`);
        lines.push(`${res} [${classOf(res)}] ${cells.join(" ")}`);
    }
    return lines.join("\n");
}
