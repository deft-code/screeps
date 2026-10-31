import { register } from "mycreep";
import { Wicktwo, Boost } from "job.wicktwo";
import { Crow } from "job.crow";

// Ballerina: the wick once the target room's towers are gone
// (ms.assaulttwo.ts). The same job on the Crow's body (25 MOVE, 24
// RANGED_ATTACK, 1 HEAL: job.crow.ts) and no boosts, so it leaves home
// the tick it hatches.
@register
export class Ballerina extends Wicktwo {
    static readonly body: BodyPartConstant[] = Crow.body;

    wantedBoosts(): Boost[] {
        return [];
    }
}
