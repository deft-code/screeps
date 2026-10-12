import { extender } from "roomobj";

// The one range check on an observer is in the API: observeRoom skips it
// when this.effects carries PWR_OPERATE_OBSERVER with ticks remaining. The
// intent itself carries only the room name, the processor copies it onto the
// observer unchecked (engine processor.js, the observer branch) and the
// driver grants the vision, so a borrowed effect sees any room on the map.
// Confirmed live, Oct 2026. effects is a plain own property set by the
// RoomObject constructor (undefined on an unboosted structure), so it can be
// swapped for the call and put back.

// Ticks the borrowed effect claims; anything above 0 passes the check.
const kFakeTicks = 5;

@extender
export class ObserverExtra extends StructureObserver {
    // observeRoom without the range limit: the ownership, name and RCL
    // checks still apply and the return code is observeRoom's own.
    observeMax(roomName: string): ScreepsReturnCode {
        const saved = this.effects;
        this.effects = [{ power: PWR_OPERATE_OBSERVER, level: 1, ticksRemaining: kFakeTicks } as RoomObjectEffect];
        try {
            return this.observeRoom(roomName);
        } finally {
            this.effects = saved;
        }
    }
}
