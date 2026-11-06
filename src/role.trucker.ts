import * as lib from 'lib';
import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';
import { Path, PathMem } from "path";

// Flag-team remote hauler from a source container to the storage at the
// end of the team's path (also `truckaga` for the second source);
// job.trucker.ts replaced it.
@injecter(Creep)
export class Trucker extends CreepHeal {
  roleTruckaga () {
    return this.roleTrucker(1)
  }
  afterTruckaga () { return this.afterTrucker() }

  roleTrucker (which = 0) {
    const what = this.idleRetreat(CARRY) || this.taskTask()
    if (what) return what

    this.notifyWhenAttacked(false);

    if (this.store.getFreeCapacity() < this.store.getUsedCapacity()) {
      const drop = (this.memory.drop && Game.rooms[this.memory.drop]) || this.home
      return this.taskTransfer(drop.storage, RESOURCE_ENERGY) ||
        this.moveRoom(drop.controller || null) ||
        this.taskTransferResources() ||
        false
    }

    if (!this.team.room) {
      return this.moveRoom(this.team)
    }

    let cont = lib.byId<StructureContainer>(this.memory.cont)
    if (!cont) {
      const srcs = this.team.room.find(FIND_SOURCES)
      const ss = _.sortBy(srcs, 'xy')
      const src = ss[which]
      // The team flag keeps a path per source note (team.ts).
      const paths = this.team.memory as unknown as { [note: string]: PathMem }
      const p = new Path(paths[src.note])
      const pp = p.get(p.length - 1)
      if (!pp) return false
      this.memory.drop = pp.roomName
      const spots = this.team.room.lookForAtRange(LOOK_STRUCTURES, src.pos, 1, true)
      for (const spot of spots) {
        const struct = spot[LOOK_STRUCTURES]
        if (struct.structureType === STRUCTURE_CONTAINER) {
          cont = struct
          this.memory.cont = cont.id
          break
        }
      }
      if (!cont) {
        return this.moveRange(src)
      }
    }

    return this.taskWithdraw(cont, RESOURCE_ENERGY) ||
      this.moveNear(cont)
  }

  optRequestPaver () {
    if (this.room.find(FIND_FLAGS).length) return
    const site = _.sample(this.room.find(FIND_MY_CONSTRUCTION_SITES))
    if (!site) return

    const name = `Paver_${this.room.name}`
    const err = site.pos.createFlag(name, COLOR_BLUE, COLOR_WHITE)
    if (!_.isString(err)) {
      this.log('Bad flag', err, name, site.pos.xy)
    }
  }

  afterTrucker () {
    this.idleNom()
    this.optRequestPaver()
    const drop = (this.memory.drop && Game.rooms[this.memory.drop]) || this.home
    if (this.room.name === drop.name) {
      this.idleTransferAny()
    }
  }
}
