import { register } from "process";
import { AssaultTwo } from "ms.assaulttwo";
import { Wicktwo } from "job.wicktwo";
import { Wickthree } from "job.wickthree";

// AssaultThree <room> <home>: AssaultTwo (ms.assaulttwo.ts: every mode,
// flag, staging and breach rule) against a three-tower room, with the
// Wickthree (job.wickthree.ts) as its wick. Scheduled by hand, or by an
// Assault <room> <home> mission once it has seen three towers.
//
//   scheduleService('AssaultThree W28N1 W27S4')
//   getService('AssaultThree W28N1 W27S4').status()
//   getService('AssaultThree W28N1 W27S4').boostRanged = true   // XKHO2 on the ranged parts too (persisted)
@register
export class AssaultThree extends AssaultTwo {
    get wickClass(): typeof Wicktwo {
        return Wickthree;
    }
}
