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
    remoteSpawn(spawns: StructureSpawn[], eggMem: any) {
        return this.stratSpawn(spawns, "remote", eggMem);
    }
    private stratSpawn(spawns: StructureSpawn[], spawnStrat: string, eggMem: any) {
        const stratEggMem: any = _.defaults({}, eggMem, { spawn: spawnStrat, body: this.role });
        // A mission may pin its creeps to one room (Farm's args[3]); findSpawns
        // takes a room name in place of a strategy.
        const spawnRoom = this.mission.getRoomName("spawn");
        if (spawnRoom) stratEggMem.spawn = spawnRoom;
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