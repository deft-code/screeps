import { register } from "mycreep";
import { Wicktwo, Boost } from "job.wicktwo";

// Wickthree: AssaultThree's fighter against three-tower rooms
// (ms.assaultthree.ts): the wick (job.wicktwo.ts, every behaviour shared)
// on a heavier body with its MOVEs boosted. 6 TOUGH, 10 MOVE, 21
// RANGED_ATTACK, 13 HEAL (6960 energy): the 50-part cap, so the 22nd
// RANGED_ATTACK asked for on 1 Nov 2026 would have been the 51st part and
// the TOUGH count mattered more. Boosts, in the order taken: XZHO2 on the
// MOVE (fatigue x4: 10 boosted MOVEs carry the 40 other parts at full speed
// off swamp), XGHO2 on the TOUGH (damage x0.3), XLHO2 on the HEAL (x4),
// and XKHO2 on the RANGED_ATTACK with the mission's boostRanged switch.
// Three towers at close range deal 1800 raw, 540 through the boosted
// TOUGH, under the 624 the boosted heals restore.
//
// Unboosted the hatchling moves one tile in four ticks, so (Wicktwo, keyed
// off spawnNearLabs and the MOVE boost's nearSpawn): it spawns from a home
// spawn with a lab within kLabRange when there is one, steps out of the
// spawn toward the lab holding or claimed for XZHO2 (spawnDirections), the
// MOVE boost is asked for a lab beside a spawn (struct.lab.js findBoostLab)
// and is taken before any other (Wicktwo.boost waits at that lab alone).
const kTough = 6;
const kMoves = 10;
const kRanged = 21;
const kHeals = 13;
export const kMoveBoost: MineralBoostConstant = RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE;

@register
export class Wickthree extends Wicktwo {
    static readonly body: BodyPartConstant[] = [
        ..._.times(kTough, () => TOUGH),
        ..._.times(kMoves, () => MOVE),
        ..._.times(kRanged, () => RANGED_ATTACK),
        ..._.times(kHeals, () => HEAL),
    ] as BodyPartConstant[];

    static readonly spawnNearLabs: boolean = true;

    // The MOVE boost first, then the wick's own list.
    static boosts(ranged: boolean): Boost[] {
        return [{ part: MOVE, boost: kMoveBoost, nearSpawn: true }, ...Wicktwo.boosts(ranged)];
    }
}
