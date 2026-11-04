// MyBaseCreep: what MyCreep (mycreep.ts) and MyPowerCreep (powercreep.ts)
// share on top of TAnyCreep. The two cannot share a class (one is a TCreep,
// the other a TPowerCreep), so the contract is an interface and the shared
// bodies are the functions below, which the two classes call from their
// own methods. Code that works on either (swipe.ts) takes a MyBaseCreep.
//
// Intents: the per-tick record of what the creep has told the engine
// (intents.ts: can*() checks before deciding, set*() after a successful
// intent). A MyCreep's record is its Creep's `tick.intents`, the one the
// legacy roles on Creep.prototype read and write, so both layers see one
// record; a MyPowerCreep keeps its own IntentLog. The action wrappers only
// record: a caller that wants to skip an action when its slot is taken
// checks `intents.canX()` first, target picking and all, as the legacy
// roles do.
import { defaultRewalker, WalkReturnCode } from "Rewalker";
import { CreepKind, Target } from "tanycreep";
import { IntentKind, Intents } from "intents";

const rewalker = defaultRewalker();

// A per-tick intent record on the heap.
export class IntentLog {
    private tick = -1;
    private log = new Intents();

    get current(): Intents {
        if (this.tick !== Game.time) {
            this.tick = Game.time;
            this.log = new Intents();
        }
        return this.log;
    }
}

// The memory both kinds keep; the global interfaces carry the fields.
export type MyBaseMemory = CreepMemory | PowerCreepMemory;

export interface MyBaseCreep {
    readonly name: string;
    readonly kind: CreepKind;
    readonly c: AnyCreep | null;
    readonly tryc: AnyCreep;
    readonly exists: boolean;
    readonly pos: RoomPosition | null;
    readonly room: Room | null;
    readonly store: StoreDefinition | null;
    readonly carried: number;
    readonly free: number;
    readonly hits: number;
    readonly hitsMax: number;
    readonly hurts: number;
    readonly ticksToLive: number;
    readonly memory: MyBaseMemory;
    readonly intents: Intents;
    // The room the creep works for: a mission's home, a power creep's chosen
    // home; else the birth room.
    readonly homeName: string | undefined;
    // The room it was spawned in.
    readonly birthName: string | undefined;

    withdraw(target: Structure | Tombstone | Ruin, resource: ResourceConstant, amount?: number): ScreepsReturnCode;
    transfer(target: AnyCreep | Structure, resource: ResourceConstant, amount?: number): ScreepsReturnCode;
    pickup(resource: Resource): ScreepsReturnCode;
    drop(resource: ResourceConstant, amount?: number): ScreepsReturnCode;
    say(message: string, toPublic?: boolean): ScreepsReturnCode;
    moveDir(direction: DirectionConstant): ScreepsReturnCode;
    // A Rewalker walk: OK within range, a direction while stepping, else an error.
    walkTo(pos: RoomPosition, range?: number): WalkReturnCode;
    // Toward a room's middle until inside its core.
    walkRoom(roomName: string, range?: number): WalkReturnCode;

    isNearTo(target: Target): boolean;
    inRangeTo(target: Target, range: number): boolean;
    log(...args: any[]): void;
    dlog(...args: any[]): void;
}

// What the helpers need of their caller.
interface Issuer {
    readonly intents: Intents;
    readonly tryc: AnyCreep;
    dlog(...args: any[]): void;
}

// Issue an intent of `kind`: act(), recorded as `what` in the slot on OK and
// logged (dlog) on anything else. Nothing is refused: a caller that wants
// to skip when the slot is taken checks intents.canX() first.
export function issue(me: Issuer, kind: IntentKind, act: () => ScreepsReturnCode, what: any = true): ScreepsReturnCode {
    const err = act();
    if (err === OK) me.intents.set(kind, what);
    else me.dlog(kind, "failed", err);
    return err;
}

// As issue, for the work actions, which take both the melee and the range slot.
export function issueWork(me: Issuer, act: () => ScreepsReturnCode, what: any = true): ScreepsReturnCode {
    const err = act();
    if (err === OK) me.intents.setWork(what);
    else me.dlog("work", "failed", err);
    return err;
}

// Walk toward pos with the Rewalker; a step taken records its direction as
// the move intent.
export function walkTo(me: Issuer, pos: RoomPosition, range = 1, ignoreSK = false): WalkReturnCode {
    const ret = rewalker.walkTo(me.tryc, pos, range, ignoreSK);
    if (ret > 0) me.intents.setMove(ret as DirectionConstant);
    return ret;
}

export function walkRoom(me: Issuer, roomName: string, range = 20, ignoreSK = false): WalkReturnCode {
    return walkTo(me, new RoomPosition(25, 25, roomName), range, ignoreSK);
}

// One PathFinder search over every goal: the index of the goal the walk was
// planned to, the walk stored as the creep's; -1 when the search failed.
export function planWalk(me: Issuer, goals: { pos: RoomPosition, range: number }[], ignoreSK = false): number {
    return rewalker.planWalk(me.tryc, goals, ignoreSK);
}
