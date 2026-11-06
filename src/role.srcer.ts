import * as lib from 'lib';
import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';

// The 2017 static harvester with its spawn/tower/link/store shunts.
// role.src.ts (asrc/bsrc) is the live one; this `srcer` role is only
// reachable by name.

declare global {
  interface Room {
    // Never set by anything; srcerShunt falls through to the containers.
    myStorage?: StructureStorage
  }
}

@injecter(Creep)
export class CreepSrcer extends CreepHeal {
  roleSrcer () {
    // Calc src
    let src = lib.byId<Source>(this.memory.src)
    if (!src) {
      const srcers = this.team.roleCreeps(this.role)
      const srcs = this.room.find(FIND_SOURCES)
      if (srcers.length < 2) {
        src = this.pos.findClosestByRange(srcs)
        if (!src) return false
        this.memory.src = src.id
      } else if (srcers.length <= srcs.length) {
        for (let s of srcs) {
          let taken = false
          for (let srcer of srcers) {
            if (srcer.name === this.name) {
              continue
            }
            if (srcer.memory.src === s.id) {
              taken = true
              break
            }
          }
          if (!taken) {
            src = s
          }
        }
        console.log('ERR', this.name, 'failed to find src in', this.pos.roomName)
        if (!src) return false
      } else {
        const srcers = this.team.roleCreeps(this.role)
        const creep = _.min(srcers, c => c.ticksToLive || 0)
        if (!this.moveNear(creep)) {
          console.log('ERR', this.name, 'too many srcers in', this.pos.roomName)
        }
        return false
      }
    }
    this.memory.src = src.id

    // Start Behavior
    const what = this.taskTask() || this.movePos({pos: src.bestSpot})
    if (what) return what

    const err = this.harvest(src)
    if (err === OK) {
      this.intents.setWork(src)
    }
    this.dlog(`harvest ${err}`)

    this.idleNom()

    if (!this.carryCapacity) return src.energy

    const shunted = this.srcerShunt(src)
    if (!shunted) {
      this.dlog(this, 'cleaning up srcer shunts')
      delete this.memory.spawn
      delete this.memory.tower
      delete this.memory.link
      delete this.memory.store
    }

    // Immortal Srcer
    const spawn = lib.byId<StructureSpawn>(this.memory.spawn)
    if (spawn && this.info.harvest > 10) {
      if (!this.room.energyFreeAvailable || this.ticksToLive < 100) {
        spawn.renewCreep(this)
      }
    }
    return false
  }

  srcerShunt (src: Source) {
    let link = lib.byId<StructureLink>(this.memory.link)
    if (!link) {
      link = _.find(this.room.findStructs(STRUCTURE_LINK), l => this.pos.isNearTo(l)) || null
    }
    // 'buffer' is no link mode (struct.link.ts Mode); the branch never fires.
    const buffer = link && (link.mode as string) === 'buffer'
    if (link && buffer && link.store.energy > 250) {
      if (this.store.getFreeCapacity() > this.info.harvest || !src.energy) {
        return this.goWithdraw(link, RESOURCE_ENERGY, false)
      }
    }

    if (this.store.getFreeCapacity() < this.info.harvest && !src.energy) return 'space'

    let deficit = false

    let tower = lib.byId<StructureTower>(this.memory.tower)
    if (!tower) {
      tower = _.find(this.room.findStructs(STRUCTURE_TOWER), t => this.pos.isNearTo(t)) || null
    }
    if (tower) {
      this.memory.tower = tower.id
      if (tower.store.getFreeCapacity(RESOURCE_ENERGY) > 10) {
        if (this.store.energy) {
          return this.goTransfer(tower, RESOURCE_ENERGY, false)
        }
        deficit = true
      }
    }

    let spawn = lib.byId<StructureSpawn>(this.memory.spawn)
    if (!spawn) {
      spawn = _.find(this.room.findStructs(STRUCTURE_SPAWN), s => this.pos.isNearTo(s)) || null
    }
    if (spawn) {
      this.memory.spawn = spawn.id
      if (spawn.store.getFreeCapacity(RESOURCE_ENERGY)) {
        if (this.store.energy) {
          return this.goTransfer(spawn, RESOURCE_ENERGY, false)
        }
        deficit = true
      }
    }

    if (link) {
      this.memory.link = link.id
      if (deficit) {
        if (link.store.energy) {
          return this.goWithdraw(link, RESOURCE_ENERGY, false)
        }
      } else if (buffer) {
        if (this.store.getFreeCapacity() && link.store.energy > 250) {
          return this.goWithdraw(link, RESOURCE_ENERGY, false)
        } else if (link.store.energy < 200) {
          if (this.store.energy) {
            return this.goTransfer(link, RESOURCE_ENERGY, false)
          }
          deficit = true
        }
      } else if (link.store.getFreeCapacity(RESOURCE_ENERGY)) {
        return this.goTransfer(link, RESOURCE_ENERGY, false)
      }
    }

    let store = lib.byId<AnyStoreStructure>(this.memory.store)
    if (!store) {
      store = this.room.myStorage || _.find(
          this.room.findStructs(STRUCTURE_CONTAINER),
          c => this.pos.isNearTo(c)) || null
    }
    if (store) {
      this.memory.store = store.id
      if (deficit) {
        if (this.store.getFreeCapacity()) {
          return this.goWithdraw(store, RESOURCE_ENERGY, false)
        }
      } else {
        if (this.store.energy) {
          return this.goTransfer(store, RESOURCE_ENERGY, false)
        }
      }
    }

    return 'nothing'
  }

  afterSrcer () {
    this.idleBuild() || this.idleRepairAny()
  }
}
