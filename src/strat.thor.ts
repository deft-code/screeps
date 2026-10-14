import { ClaimedStrat, registerStrat, setRoomStrat } from "strat";
import * as debug from "debug";

// Rampart ceiling in a thorium room; the metas would ask for 1M at RCL6
// and more above. 1M until 14 Oct 2026: a room that gets torn down is not
// worth the energy.
const kRampartHits = 100000;

// ClaimedStrat for a temporary thorium room (Thorhub sets it with
// setRoomStrat(room, "thorclaimed")). Everything ClaimedStrat does, except
// that ramparts are repaired to at most kRampartHits. Once the room is no
// longer ours (Thormine's teardown unclaimed it) the override is deleted
// from room memory and the room goes back to the default strat.
export class ThorStrat extends ClaimedStrat {
    name = "thorstrat"

    evolve() {
        const room = this.room;
        if (room && !room.controller?.my && Memory.rooms[this.roomName]?.strat) {
            debug.log(this.name, this.roomName, "no longer ours; dropping strat override");
            setRoomStrat(this.roomName, null);
        }
        return super.evolve();
    }

    maxHits(stype: BuildableStructureConstant, xy: number): number {
        const max = super.maxHits(stype, xy);
        if (stype === STRUCTURE_RAMPART) return Math.min(max, kRampartHits);
        return max;
    }
}

registerStrat("thorclaimed", ThorStrat);
