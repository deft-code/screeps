import { daemon, Priority, Process } from "process";
import * as debug from "debug";
import { runGenesis } from "metastruct";
import { FlagExtra } from "flag";

@daemon
export class FlagService extends Process {
    bucket = 8000
    processed = new Set<string>();

    run(): Priority {
        _.forEach(Game.flags, f => this.handleFlag(f as FlagExtra));
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
        }
    }
}