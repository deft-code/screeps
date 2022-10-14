
import { CreepRepair } from "creep.repair";
import { isStoreStruct, isSType } from "guards";
import { TaskRet } from "Tasker";
import { injecter } from "roomobj";
import { Mode } from "struct.link";

declare global {
    interface CreepMemory {
        srcid?: Id<Source>
        contid?: Id<StructureContainer>
        linkid?: Id<StructureLink>
    }
}

@injecter(Creep)
class SrcerExtra extends CreepRepair {
    afterBsrc() { this.afterAsrc(); }
    afterAsrc() {
        this.idleBuild() || this.idleRepairAny()
    }

    roleBsrc(): TaskRet { return this.roleAsrc(); }
    roleAsrc(): TaskRet {
        let what = this.moveSpot() as TaskRet;
        if (what) return what;

        let src = Game.getObjectById(this.memory.srcid);
        if (!src) {
            const meta = this.teamRoom.meta.getMeta(this.role);
            if (!meta) return false;
            const p = this.room.unpackPos(meta.mem.xy);
            src = _.first(p.lookFor(LOOK_SOURCES));
            if (!src) return false;
            this.memory.srcid = src.id;
        }

        what = this.goHarvest(src);
        if (!this.store.getCapacity()) {
            return what;
        }

        const cont = this.mycont();
        const rcl = cont?.room.controller?.level;
        let reserve = 250;
        if (rcl === 7) reserve = 500;
        if (rcl === 8) reserve = 1000;

        const contLow = !!cont && cont.store.energy < reserve;
        const filled = this.idleFillExtns(contLow);
        const recharging = filled === STRUCTURE_EXTENSION || filled === STRUCTURE_SPAWN;

        // Switch to dump mode if there is wasted energy on the ground.
        const link = this.mylink();
        if (link) {
            if (recharging || contLow) {
                link.mode = Mode.pause
            } else {
                link.mode = Mode.src;
                if (_.any(this.pos.lookFor(LOOK_RESOURCES), r => r.resourceType === RESOURCE_ENERGY)) {
                    link.mode = Mode.dump;
                }
            }
        }

        if (this.store.getFreeCapacity()) {
            this.idleNom() ||
                this.idleSipCont(this.mycont(), recharging ? -CONTAINER_CAPACITY : reserve) ||
                (recharging && this.idleSipLink(this.mylink()));
        }
        return what;
    }

    idleSipLink(link: StructureLink | null) {
        if (!link) return false;
        if (!link.store.energy) return false;
        if (!this.store.getFreeCapacity()) return false;
        return this.goWithdraw(link, RESOURCE_ENERGY, false);
    }

    idleSipCont(cont: StructureContainer | null, reserve: number) {
        if (!cont) return false;
        const free = this.store.getFreeCapacity();
        if (!free) return false;
        if (cont.store.energy < reserve + free) return false;
        return this.goWithdraw(cont, RESOURCE_ENERGY, false);
    }

    idleFillExtns(limited: boolean) {
        const looks = _.shuffle(this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true));
        for (const look of looks) {
            const struct = look[LOOK_STRUCTURES];
            if (!isSType(struct, STRUCTURE_EXTENSION) && !isSType(struct, STRUCTURE_SPAWN)) continue;
            if (!struct.store.getFreeCapacity(RESOURCE_ENERGY)) continue;
            this.goTransfer(struct, RESOURCE_ENERGY, false);
            return struct.structureType;
        }
        if (limited) return false;
        const overfull = this.info.repair > this.store.getFreeCapacity();
        for (const look of looks) {
            const struct = look[LOOK_STRUCTURES];
            if (!isStoreStruct(struct)) continue;

            // Skip the drop container
            if (struct.pos.isEqualTo(this.pos)) continue;

            const free = (<GenericStore>struct.store).getFreeCapacity(RESOURCE_ENERGY) || 0;
            if (free <= 0) continue;
            // Minimize transfers to fill a struct
            // Only fill when we need to or if the we'll top off the target
            if (!overfull && this.store.energy < free) continue;

            this.goTransfer(struct, RESOURCE_ENERGY, false);
            return struct.structureType;
        }
        return false;
    }

    mylink(): StructureLink | null {
        let link = Game.getObjectById(this.memory.linkid);
        if (link && link.pos.inRangeTo(this.pos, 1)) return link;
        const looks = this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true);
        for (const look of looks) {
            const s = look.structure;
            if (isSType(s, STRUCTURE_LINK)) {
                this.memory.linkid = s.id;
                return s;
            }
        }
        return null;
    }

    mycont(): StructureContainer | null {
        let cont = Game.getObjectById<StructureContainer>(this.memory.contid);
        if (cont) return cont;
        for (const struct of this.pos.lookFor(LOOK_STRUCTURES)) {
            if (isSType(struct, STRUCTURE_CONTAINER)) {
                this.memory.contid = struct.id;
                return struct;
            }
        }
        return null;
    }
}