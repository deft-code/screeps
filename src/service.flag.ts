import { daemon, Priority, Process, Service } from "process";
import * as debug from "debug";
import { runGenesis } from "metastruct";
import { FlagExtra } from "flag";

// A purple flag's name is a service command with '_' for ' ':
// flag "Swipe_W4N3_W3N4" -> Service.spawn("Swipe W4N3 W3N4").
function flagCommand(flag: Flag): string {
    return flag.name.replace(/_/g, " ");
}

@daemon
export class FlagService extends Process {
    bucket = 8000
    processed = new Set<string>();
    // Commands this daemon spawned for purple flags. In-memory only: the
    // processes are transient (Service.spawn, never scheduled), so both the
    // set and the processes rebuild from the flags after a global reset.
    purple = new Set<string>();

    run(): Priority {
        _.forEach(Game.flags, f => this.handleFlag(f as FlagExtra));
        this.syncPurple();
        return "low";
    }

    handleFlag(flag: FlagExtra) {
        switch(flag.color) {
            case COLOR_ORANGE:
                runGenesis(flag);
                break;
            case COLOR_GREY:
                if(!flag.parent) flag.remove();
                break;
            case COLOR_PURPLE:
                this.spawnPurple(flag);
                break;
        }
    }

    // Start the flag's command unless it is already live. Only commands this
    // daemon started join the set, so a purple flag named after a scheduled
    // service (GlobalRespawn, a Hub) never gets that service killed later.
    // Missions are not purple-flag material (they own creeps and need a
    // scheduled wind-down); one that spawns is killed again at once and the
    // flag marked failed.
    spawnPurple(flag: Flag) {
        const cmd = flagCommand(flag);
        if (this.purple.has(cmd)) return;
        const live = Service.getType(cmd);
        if (live && !live.dead) return;
        const proc = Service.spawn(cmd) as (Service & { windDown?: () => void }) | null;
        if (!proc) {
            debug.log("purple flag", flag.name, "names no process type:", cmd);
            return this.failPurple(flag);
        }
        if (_.isFunction(proc.windDown)) {
            debug.log("purple flag", flag.name, "names a Mission, refusing:", cmd);
            proc.kill();
            const mem = Memory.missions[cmd];
            if (mem && !mem.creeps.length && !mem.eggs.length && !mem.hatch.length) delete Memory.missions[cmd];
            return this.failPurple(flag);
        }
        debug.log("purple flag", flag.name, "spawned", cmd);
        this.purple.add(cmd);
    }

    // Mark the failure on the flag itself (white/purple) so it stops retrying
    // and stands out; recolour it purple to try again.
    failPurple(flag: Flag) {
        flag.setColor(COLOR_WHITE, COLOR_PURPLE);
    }

    // Kill every process we spawned whose purple flag is gone.
    syncPurple() {
        if (!this.purple.size) return;
        const wanted = new Set<string>();
        _.forEach(Game.flags, f => {
            if (f.color === COLOR_PURPLE) wanted.add(flagCommand(f));
        });
        for (const cmd of Array.from(this.purple)) {
            if (wanted.has(cmd)) continue;
            this.purple.delete(cmd);
            const proc = Service.getType(cmd);
            if (!proc || proc.dead) continue;
            debug.log("purple flag for", cmd, "gone, killing");
            proc.kill();
        }
    }
}
