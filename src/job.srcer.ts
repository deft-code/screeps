import { JobRole } from "job.role";
import { registerAs } from "mycreep";

@registerAs("asrc")
@registerAs("bsrc")
class Srcer extends JobRole {
    spawn(spawns: StructureSpawn[]) {
        return this.localSpawn(spawns, {body: "srcer"});
    }
}