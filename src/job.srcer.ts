import { JobRole } from "job.role";
import { registerAs } from "mycreep";

@registerAs("asrc")
@registerAs("bsrc")
class Srcer extends JobRole {
    spawn(spawns: StructureSpawn[]) {
        this.log("spawning attempt");
        return this.localSpawn(spawns, {body: "srcer"});
    }
}