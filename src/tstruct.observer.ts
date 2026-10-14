import { TStruct, register } from "tstruct";

// TObserver: the TStruct wrapper for observers, with observeMax from
// struct.observer.ts ported onto it.
//
// The one range check on an observer is in the API: observeRoom skips it
// when the observer's effects carry PWR_OPERATE_OBSERVER with ticks
// remaining. The intent itself carries only the room name, the processor
// copies it onto the observer unchecked (engine processor.js, the observer
// branch) and the driver grants the vision, so a borrowed effect sees any
// room on the map. Confirmed live, Oct 2026. effects is a plain own property
// set by the RoomObject constructor (undefined on an unboosted structure),
// so it can be swapped for the call and put back.
//
//   TStruct.make(observer).observeMax('W40S7')   // typed TObserver via Wrappers

// Ticks the borrowed effect claims; anything above 0 passes the check.
const kFakeTicks = 5;

// Both methods answer ERR_INVALID_TARGET when the observer itself is out of
// sight or gone (`s` null) rather than throwing.
@register
export class TObserver extends TStruct<StructureObserver> {
    // Under PWR_OPERATE_OBSERVER this tick: observeRoom reaches any room.
    get powered(): boolean {
        return (this.s?.effectTTL(PWR_OPERATE_OBSERVER) ?? 0) > 0;
    }

    // observeRoom as the API has it: ownership, name, RCL and range checks.
    observeRoom(roomName: string): ScreepsReturnCode {
        const ob = this.s;
        if (!ob) return ERR_INVALID_TARGET;
        return ob.observeRoom(roomName);
    }

    // observeRoom without the range limit: the ownership, name and RCL
    // checks still apply and the return code is observeRoom's own.
    observeMax(roomName: string): ScreepsReturnCode {
        const ob = this.s;
        if (!ob) return ERR_INVALID_TARGET;
        const saved = ob.effects;
        ob.effects = [{ power: PWR_OPERATE_OBSERVER, level: 1, ticksRemaining: kFakeTicks } as RoomObjectEffect];
        try {
            return ob.observeRoom(roomName);
        } finally {
            ob.effects = saved;
        }
    }
}

declare module "tstruct" {
    interface Wrappers {
        observer: TObserver
    }
}
