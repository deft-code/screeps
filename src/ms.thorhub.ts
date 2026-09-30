import { Hub } from "ms.hub";
import { register } from "process";
import { RCL2Energy } from "constants";
import { Priority } from "process";
import { setRoomStrat } from "strat";
import "strat.thor";

// Hub for a temporary room that exists to mine out its thorium (Thormine)
// and will be torn down afterwards, so nothing is spent growing it.
//
//   scheduleService('Thorhub W27S5')   // args[1]=owned room, as Hub
//
// Everything Hub does (Reboot, srcers or haulers, Worker, Ctrl, Hub creep,
// CtrlHauler, Chemist) except:
//   - Ctrl is always the RCL2-sized body (ctrlCap = RCL2Energy), enough to
//     keep the controller from downgrading, whatever the storage holds.
//   - No upgraders, neither for a storage surplus nor for a big pile.
//   - No ctrlhaulers: the small ctrl draws from storage or its container.
//   - The room runs the "thorclaimed" strat (strat.thor.ts: ramparts capped
//     at 1M hits) while the mission runs; windDown() puts the default back,
//     and the strat drops itself once the room is unclaimed.
// Swap a room over with windDown() on its Hub and scheduleService of this.
@register
export class Thorhub extends Hub {
    run(): Priority {
        if (!this.windingDown && this.room?.controller?.my) setRoomStrat(this.roomName, "thorclaimed");
        return super.run();
    }

    windDown() {
        setRoomStrat(this.roomName, null);
        super.windDown();
    }

    nUpgraders(room: Room): number {
        return 0;
    }

    nCtrlHaulers(): number {
        return 0;
    }

    ctrlCap(room: Room): number | null {
        return RCL2Energy;
    }

    status(): string {
        return super.status() + ` thorhub:small-ctrl,no-upgraders,no-ctrlhaulers strat:${Memory.rooms[this.roomName]?.strat || "default"}`;
    }
}
