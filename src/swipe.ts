// Swiping: looting a room's structures and hauling the take home, for any
// creep of mine (MyBaseCreep: the Swiper job of the Swipe mission, and
// Furiosa's swipe child flags on MyPowerCreep). One state machine
// (questSwipe) over the creep's memory.swipe, parameterised by what is
// worth taking (swipeworth.ts) and how a target is chosen:
//
//   "path"   the structure with the cheapest walk, one PathFinder search over
//            every candidate at range 1 (Swiper: a 25 CARRY body, many trips)
//   "value"  the structure holding the most valuable resource per unit, the
//            nearer on a tie, taking its resources most valuable first
//            (Furiosa: a small store, a 5000-tick life)
//
// Targets are the room's structures that are not ours, hold something worth
// taking, have no rampart on top, are not nukers (withdrawing from one is
// bugged) and have not refused us lately: a withdraw that fails with
// ERR_NOT_OWNER (a hostile rampart over it) or a walk that finds no path
// (walled in) skips the structure for kSkipTicks. Full, or holding something
// when the room has nothing left, the creep carries the load home: the home
// storage, else the terminal, else (a young room) the container with the
// most free space, else dropped within 3 of the controller; one resource a
// tick, every transfer sized to what fits. A load begun is finished before
// looting resumes (the `unload` latch), and a room run dry sends the partial
// load home and is remembered so (`dry`) until the creep has unloaded.
//
// Shared with ms.swipe.ts, which winds the mission down when swipeTargets()
// finds nothing left.
import { MyBaseCreep, planWalk } from "mybasecreep";
import { walkIncomplete } from "Rewalker";
import { anything, byValue, unitValue, worthless, Worth } from "swipeworth";

// Ticks a structure that refused a withdraw or a walk is left alone.
const kSkipTicks = 1500;
// Withdrawing from a nuker is bugged; everything else with a store is fair game.
const kNoSwipe: StructureConstant[] = [STRUCTURE_NUKER];
// How far from the controller a load is dropped with nowhere to put it.
const kDropRange = 3;

export type SwipePick = "path" | "value";

export interface SwipeMemory {
    // structure being emptied; re-picked every tick, kept for status
    target?: Id<AnyStoreStructure>
    // structure id -> tick until which it is left alone
    skip?: { [id: string]: number }
    // the target room had nothing left when we set off home with a partial load
    dry?: boolean
    // carrying home until empty
    unload?: boolean
    // home container being filled while home has no storage/terminal space
    dropid?: Id<StructureContainer>
}

declare global {
    interface CreepMemory {
        swipe?: SwipeMemory
    }
    interface PowerCreepMemory {
        swipe?: SwipeMemory
    }
}

type AnyStore = StoreDefinition | Store<ResourceConstant, false>;

// Resources a store holds that are `worth` taking, in random order (so a loot
// run mixes what it takes).
export function stocked(store: AnyStore, worth: Worth = anything): ResourceConstant[] {
    const s = store as unknown as { [res: string]: number };
    return _.shuffle(Object.keys(s).filter(res => s[res] > 0 && worth(res as ResourceConstant))) as ResourceConstant[];
}

// Does the store hold anything `worth` taking?
function hasStocked(store: AnyStore, worth: Worth): boolean {
    const s = store as unknown as { [res: string]: number };
    return _.any(Object.keys(s), res => s[res] > 0 && worth(res as ResourceConstant));
}

// May a swiper loot this structure (see the header)? `skip` is the creep's
// refusal list, structure id -> tick until which it is left alone.
export function isSwipeTarget(s: AnyStructure, skip: { [id: string]: number } = {}, worth: Worth = anything): s is AnyStoreStructure {
    return !(s as OwnedStructure).my &&
        !_.contains(kNoSwipe, s.structureType) &&
        (s as AnyStoreStructure).store !== undefined &&
        hasStocked((s as AnyStoreStructure).store, worth) &&
        !(skip[s.id] > Game.time) &&
        !_.any(s.pos.lookFor(LOOK_STRUCTURES), r => r.structureType === STRUCTURE_RAMPART);
}

// Structures in `room` a swiper may loot.
export function swipeTargets(room: Room, skip: { [id: string]: number } = {}, worth: Worth = anything): AnyStoreStructure[] {
    return room.find(FIND_STRUCTURES, { filter: (s: AnyStructure) => isSwipeTarget(s, skip, worth) }) as AnyStoreStructure[];
}

// The creep's swipe state, made on first use.
export function swipeMemory(me: MyBaseCreep): SwipeMemory {
    return me.memory.swipe = me.memory.swipe || {};
}

function skipTarget(me: MyBaseCreep, mem: SwipeMemory, target: AnyStoreStructure, why: string) {
    const skip = mem.skip = mem.skip || {};
    skip[target.id] = Game.time + kSkipTicks;
    delete mem.target;
    me.log(target.structureType, "at", target.pos, why + ", skipping it for", kSkipTicks);
}

// The target in the creep's room, by `pick` (see the header), or null. In
// path mode the target already picked is kept while it still qualifies
// (the search is the expensive part, and the walk is stored); in value mode
// it is picked afresh every tick, since once the best resource of a
// structure is aboard another may hold the most valuable one left.
export function pickTarget(me: MyBaseCreep, mem: SwipeMemory, worth: Worth, pick: SwipePick): AnyStoreStructure | null {
    const room = me.room;
    const pos = me.pos;
    if (!room || !pos) return null;
    if (pick === "path" && mem.target) {
        const kept = Game.getObjectById(mem.target);
        if (kept && kept.pos.roomName === room.name && isSwipeTarget(kept, mem.skip, worth)) return kept;
    }
    const targets = swipeTargets(room, mem.skip, worth);
    if (!targets.length) return null;
    if (pick === "value") {
        const ranked = targets.map(t => ({ t, value: unitValue(_.first(byValue(t.store, worth))!) }));
        const top = _.max(ranked, r => r.value).value;
        return pos.findClosestByRange(ranked.filter(r => r.value >= top).map(r => r.t));
    }
    // planWalk stores the path as the creep's walk, so the walkTo to the
    // same tile follows it unchanged. Range when the search fails.
    const i = planWalk(me, targets.map(t => ({ pos: t.pos, range: 1 })));
    if (i >= 0) return targets[i];
    me.dlog("planWalk failed", i, "falling back to range");
    return pos.findClosestByRange(targets);
}

// Walk to the target and withdraw its next resource; a status string.
export function swipeFrom(me: MyBaseCreep, mem: SwipeMemory, target: AnyStoreStructure, worth: Worth, pick: SwipePick): string {
    if (!me.isNearTo(target)) {
        const ret = me.walkTo(target.pos, 1);
        // An incomplete search for a walk inside the target's own room is
        // not a long trip cut short by maxOps: the structure is walled in.
        if (ret === ERR_NO_PATH || walkIncomplete(me.tryc, target.pos)) {
            skipTarget(me, mem, target, "has no path");
            delete me.memory._walk;
            return "no path, retarget";
        }
        return `to ${target.structureType}`;
    }
    const res = pick === "value" ? _.first(byValue(target.store, worth)) : _.first(stocked(target.store, worth));
    if (!res) return "retarget";
    const err = me.withdraw(target, res);
    if (err === OK) return `swiping ${res}`;
    if (err === ERR_NOT_OWNER) skipTarget(me, mem, target, "is covered");
    else me.log("withdraw from", target.structureType, "at", target.pos, "failed", err);
    delete mem.target;
    return "retarget";
}

// Latch for deliverHome: true from the tick `begin` holds until the creep is
// empty, so a partial transfer does not send it back half loaded.
export function unloadLatch(me: MyBaseCreep, mem: SwipeMemory, begin: boolean): boolean {
    if (!me.carried) {
        delete mem.unload;
        delete mem.dropid;
        return false;
    }
    if (begin) mem.unload = true;
    return !!mem.unload;
}

// Where a load goes in `home`: storage or terminal with room, else the
// container with the most free space (kept in mem.dropid until it fills;
// never a source container, mode "src": the haulers drain that), else null.
export function unloadStore(me: MyBaseCreep, mem: SwipeMemory, home: Room): StructureStorage | StructureTerminal | StructureContainer | null {
    for (const s of [home.storage, home.terminal]) {
        if (s?.my && s.store.getFreeCapacity() > 0) return s;
    }
    const kept = mem.dropid && Game.getObjectById(mem.dropid);
    if (kept && kept.pos.roomName === home.name && kept.store.getFreeCapacity() > 0) return kept;
    const conts = (home.findStructs(STRUCTURE_CONTAINER) as StructureContainer[])
        .filter(k => k.mode !== "src" && k.store.getFreeCapacity() > 0);
    if (!conts.length) {
        delete mem.dropid;
        return null;
    }
    const cont = _.max(conts, k => k.store.getFreeCapacity());
    mem.dropid = cont.id;
    return cont;
}

// Straight to the home store from wherever we are (one cross-room walk) and
// unload one resource a tick; with nowhere to put it, drop it at the
// controller. A status string.
export function deliverHome(me: MyBaseCreep, mem: SwipeMemory, homeName: string): string {
    const home = Game.rooms[homeName];
    if (!home) {
        me.walkRoom(homeName);
        return "to home";
    }
    const res = _.first(stocked(me.store!));
    if (!res) return "empty";
    const dest = unloadStore(me, mem, home);
    if (dest) {
        if (!me.isNearTo(dest)) {
            me.walkTo(dest.pos, 1);
            return "to store";
        }
        const free = dest.store.getFreeCapacity(res) || 0;
        const amount = Math.min(me.store![res], free);
        const err = me.transfer(dest, res, amount);
        if (err !== OK) me.log("transfer to", dest, "failed", err);
        // A container this fills is done with: pick the next one.
        if (dest.structureType === STRUCTURE_CONTAINER && amount >= free) delete mem.dropid;
        return `unloading ${res}`;
    }
    if (home.controller) {
        if (me.walkTo(home.controller.pos, kDropRange) !== OK) return "to controller";
        me.drop(res);
        return `dropping ${res}`;
    }
    me.log("nowhere to deliver in", homeName);
    return "stuck: no store";
}

// One tick of the quest (see the header): a status string, or false once
// the creep is empty and the target room has nothing left worth taking,
// whether it stands there or has just unloaded at home.
export function questSwipe(me: MyBaseCreep, targetRoom: string, homeName: string, worth: Worth = anything, pick: SwipePick = "path"): string | false {
    const pos = me.pos;
    if (!pos) return "not spawned";
    const mem = swipeMemory(me);
    if (unloadLatch(me, mem, me.free === 0)) return deliverHome(me, mem, homeName);

    if (pos.roomName !== targetRoom) {
        if (mem.dry) {
            if (unloadLatch(me, mem, true)) return deliverHome(me, mem, homeName);
            delete me.memory.swipe;
            return false;
        }
        delete mem.target;
        me.walkRoom(targetRoom);
        return "to target";
    }

    const target = pickTarget(me, mem, worth, pick);
    mem.target = target?.id;
    if (target) {
        delete mem.dry;
        return swipeFrom(me, mem, target, worth, pick);
    }
    if (unloadLatch(me, mem, true)) {
        mem.dry = true;
        return deliverHome(me, mem, homeName);
    }
    delete me.memory.swipe;
    return false;
}

// Grab what lies within reach (a pile, then a tombstone, then a ruin) with
// whatever intents the tick has left, except the worthless: a Konmari drops
// that along the swipe roads. No movement. True when something was taken.
export function nomNearby(me: MyBaseCreep): boolean {
    const room = me.room;
    const pos = me.pos;
    if (!room || !pos || !me.free) return false;
    if (me.intents.canPickup()) {
        const pile = _.find(room.lookForAtRange(LOOK_RESOURCES, pos, 1, true),
            spot => !worthless(spot[LOOK_RESOURCES].resourceType));
        if (pile) return me.pickup(pile[LOOK_RESOURCES]) === OK;
    }
    if (!me.intents.canWithdraw() || !me.intents.canTransfer()) return false;
    for (const look of [LOOK_TOMBSTONES, LOOK_RUINS] as (LOOK_TOMBSTONES | LOOK_RUINS)[]) {
        for (const spot of room.lookForAtRange(look, pos, 1, true)) {
            const holder = (spot as any)[look] as Tombstone | Ruin;
            const res = _.first(stocked(holder.store, r => !worthless(r)));
            if (res) return me.withdraw(holder, res) === OK;
        }
    }
    return false;
}
