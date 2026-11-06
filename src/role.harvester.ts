import * as lib from 'lib';
import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';

// Flag-team remote harvester (also `harvestaga` for the second source)
// that builds and sits on its container; job.harvester.ts replaced it.
@injecter(Creep)
export class CreepHarvester extends CreepHeal {
  roleHarvestaga() {
    return this.roleHarvester(1)
  }

  afterHarvestaga() {
    return this.afterHarvester()
  }

  afterHarvester() {
    this.idleNom()
    this.idleBuild() || this.idleRepairAny()
  }

  roleHarvester(card = 0) {
    let what = this.taskTask()
    if (what) return what

    if (!this.team.room) {
      return this.moveRoom(this.team)
    }

    let src = lib.byId<Source>(this.memory.src)
    if (!src) {
      if (!this.moveRoom(this.team)) {
        const srcs = this.teamRoom.find(FIND_SOURCES)
        const ss = _.sortBy(srcs, 'xy')
        src = ss[card]
        if (src) {
          this.memory.src = src.id
        } else {
          return false
        }
      } else {
        return false
      }
    }

    if (!this.pos.isEqualTo(src.bestSpot)) return this.movePos({ pos: src.bestSpot })

    if (!this.memory.active) {
      this.memory.active = Game.time
    }

    const cont = this.makeCont()
    if (!cont) {
      const err = this.room.createConstructionSite(this.pos, STRUCTURE_CONTAINER)
      this.dlog('create site', err)
      return 'create'
    }

    if (cont instanceof ConstructionSite) {
      return this.taskBuild(cont) || this.taskHarvest(src)
    }

    if (this.store.energy && cont.hurts > cont.hits) {
      return this.taskRepair(cont)
    }

    if (src.energy && cont.store.getFreeCapacity() > this.info.harvest) {
      return this.goHarvest(src, false)
    }
    return this.taskRepair(cont) || this.goWithdraw(cont, RESOURCE_ENERGY, false) || 'waiting'
  }

  // The container (or its site) under the creep, remembered by id.
  makeCont(): StructureContainer | ConstructionSite | null {
    this.dlog("cont", this.memory.cont);
    let cont = lib.byId<StructureContainer | ConstructionSite>(this.memory.cont)
    if (cont) return cont

    const sites = this.pos.lookFor(LOOK_CONSTRUCTION_SITES);
    const structs = this.pos.lookFor(LOOK_STRUCTURES);
    const stuff: (ConstructionSite | Structure)[] = [...sites, ...structs];

    for (const s of stuff) {
      if (s.structureType === STRUCTURE_CONTAINER) {
        this.memory.cont = s.id as Id<StructureContainer>;
        return s as StructureContainer | ConstructionSite;
      }
    }
    return null
  }
}
