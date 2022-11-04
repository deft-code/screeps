import { findSpawns, buildBody } from "spawnold";
import { Task2Ret } from "mycreep";
import { JobCreep } from "job.creep";

export class JobRole extends JobCreep {
    localSpawn(spawns: StructureSpawn[], eggMem: any) {
        return this.stratSpawn(spawns, "local", eggMem);
    }
    closeSpawn(spawns: StructureSpawn[], eggMem: any) {
        return this.stratSpawn(spawns, "close", eggMem);
    }
    private stratSpawn(spawns: StructureSpawn[], spawnStrat: string, eggMem: any) {
        const stratEggMem = _.defaults({}, eggMem, { spawn: spawnStrat, body: this.role });
        //this.log("stratEggMem:", JSON.stringify(stratEggMem), "eggMem:", JSON.stringify(eggMem));
        const possibleSpawns = findSpawns(spawns, this.mission.roomName, stratEggMem) as StructureSpawn[];
        const maxRCL = Math.max(...possibleSpawns.map(s => s.room.controller!.level));
        return buildBody(possibleSpawns, stratEggMem, { maxRCL }) as [StructureSpawn | null, BodyPartConstant[]];
    }

    init(): boolean { return true }
    start(): Task2Ret {
        this.c.run();
        this.c.after();
        return "wait";
    }
    after() { }
}