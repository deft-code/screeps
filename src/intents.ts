// Intents: what a creep has told the engine this tick, one record per creep
// per tick (a Creep's `tick.intents`, a MyPowerCreep's IntentLog). The
// convention (CLAUDE.md): check the slot before deciding on an action, so
// the target picking is skipped as well as the intent, and set it after a
// successful one. The checks are the can*() predicates, the records the
// set*() methods; nothing here refuses anything, the engine's own
// last-intent-wins rule stands when a caller skips the check.
//
// Slots and what shares them:
//   move       the tile the creep tried to step onto (setMove); a pulled
//              creep's is the puller's tile, with `pulled` the puller's name
//   pull       name of the creep we pull this tick
//   withdraw, transfer, pickup, drop   the target or resource
//   melee      the adjacent-only actions: attack, heal (canAttack / setAttack)
//   range      rangedAttack, rangedMassAttack, rangedHeal (canRange / setRange)
//   melee+range  the work actions, which the engine allows one of a tick and
//              none while attacking: harvest, build, repair, dismantle,
//              upgradeController, attackController, claimController,
//              reserveController, generateSafeMode (canWork / setWork)
//   say, power, enableRoom, renew, spawn, upgrade, suicide, sign   power
//              creeps and the odd ones; set(kind, what) / has(kind)

export type IntentKind = "move" | "pull" | "pulled" | "withdraw" | "transfer" | "pickup" | "drop"
    | "melee" | "range" | "say" | "power" | "enableRoom" | "renew" | "spawn" | "upgrade" | "suicide" | "sign";

export class Intents {
    move?: RoomPosition;
    pull?: string;
    pulled?: string;
    withdraw?: any;
    transfer?: any;
    pickup?: any;
    drop?: any;
    melee?: any;
    range?: any;
    say?: string;
    power?: PowerConstant;
    enableRoom?: any;
    renew?: any;
    spawn?: any;
    upgrade?: any;
    suicide?: boolean;
    sign?: any;

    // --- checks: is the slot free this tick? ---------------------------------------

    canMove(): boolean { return !this.move; }
    canWithdraw(): boolean { return !this.withdraw; }
    canTransfer(): boolean { return !this.transfer; }
    canPickup(): boolean { return !this.pickup; }
    canDrop(): boolean { return !this.drop; }
    // attack or heal
    canAttack(): boolean { return !this.melee; }
    // rangedAttack, rangedMassAttack or rangedHeal
    canRange(): boolean { return !this.range; }
    // the work actions: both slots free
    canWork(): boolean { return !this.melee && !this.range; }
    canRenew(): boolean { return !this.renew; }

    has(kind: IntentKind): boolean { return !!this[kind]; }

    // --- records: after the engine took the intent -------------------------------------

    // The tile stepped toward.
    setMove(pos: RoomPosition) { this.move = pos; }
    // Pulled by `puller`: the step is onto its tile.
    setPulled(puller: Creep) {
        this.move = puller.pos;
        this.pulled = puller.name;
    }
    setPull(pulled: Creep) { this.pull = pulled.name; }
    setWithdraw(target: any) { this.withdraw = target; }
    setTransfer(target: any) { this.transfer = target; }
    setPickup(resource: any) { this.pickup = resource; }
    setDrop(resource: any) { this.drop = resource; }
    setAttack(target: any) { this.melee = target; }
    setRange(target: any) { this.range = target; }
    setWork(target: any) { this.melee = this.range = target; }
    setRenew(target: any) { this.renew = target; }

    set(kind: IntentKind, what: any) { (this as any)[kind] = what; }
}
