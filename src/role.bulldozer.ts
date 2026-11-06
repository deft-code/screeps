import { injecter } from 'roomobj';
import { CreepHeal } from 'creep.heal';
import { LegacyRet } from 'Tasker';

// Flag-team wrecker (also `opener`); job.bulldozer.ts replaced it. Its
// taskRaze/taskStompAll/taskDismantle* are shared by ram, cleaner, scout
// and stomper.

declare global {
  interface Creep {
    taskRaze(...stypes: StructureConstant[]): LegacyRet
    taskStompAll(): LegacyRet
    taskStomp(site?: ConstructionSite | null): LegacyRet
    taskDismantleAt(obj: _HasRoomPosition): LegacyRet
    taskDismantleHostiles(): LegacyRet
    taskDismantleHostile(...stypes: StructureConstant[]): LegacyRet
  }
}

@injecter(Creep)
export class CreepBulldozer extends CreepHeal {
  roleOpener () {
    return this.idleRetreat(WORK) || this.taskTask() ||
        this.taskMoveFlag(this.team, {allowHostile: true}) ||
        this.taskDismantleAt(this.team) ||
        this.taskDismantleHostile(STRUCTURE_RAMPART)
  }

  roleBulldozer () {
    return this.idleRetreat(WORK) || this.taskTask() ||
        this.taskMoveFlag(this.team, {allowHostile: true}) ||
        this.taskDismantleAt(this.team) ||
        this.taskDismantleHostile(STRUCTURE_TOWER) ||
        this.taskDismantleHostile(STRUCTURE_SPAWN) ||
        this.taskDismantleHostiles() ||
        this.taskStompAll() ||
        this.taskRaze(STRUCTURE_CONTAINER) ||
        this.taskRaze(STRUCTURE_ROAD) ||
        this.taskDismantleHostile(STRUCTURE_RAMPART) ||
        this.taskRaze(STRUCTURE_WALL)
  }

  afterBulldozer () {
    this.idleAttack()
  }

  taskDismantleEmpty () {
  }

  taskRazeWalls () {
  }

  taskRaze (...stypes: StructureConstant[]) {
    return this.taskDismantle(
        this.pos.findClosestByRange(this.room.find(FIND_STRUCTURES, {
          filter: s => s.hits &&
              (!stypes.length || _.any(stypes, stype => s.structureType === stype))
        })))
  }

  taskStompAll () {
    const sites = _.filter(this.room.find(FIND_HOSTILE_CONSTRUCTION_SITES),
      s => s.structureType !== STRUCTURE_EXTRACTOR)
    return this.taskStomp(this.pos.findClosestByRange(sites))
  }

  taskStomp (site?: ConstructionSite | null) {
    site = this.checkId('stomp', site)
    if (!site) return false
    return this.moveTarget(site, {range: 0, allowHostile: true, ignoreCreeps: false})
  }

  taskDismantleAt (obj: _HasRoomPosition) {
    const struct = _.sample(obj.pos.lookFor(LOOK_STRUCTURES))
    this.dlog('dismantling', struct)
    return this.taskDismantle(struct)
  }

  taskDismantleHostiles () {
    return this.taskDismantle(
        this.pos.findClosestByRange(this.room.find(FIND_HOSTILE_STRUCTURES, {
          filter: s => s.hits && s.structureType !== STRUCTURE_RAMPART
        })))
  }

  taskDismantleHostile (...stypes: StructureConstant[]) {
    return this.taskDismantle(
        this.pos.findClosestByRange(this.room.find(FIND_HOSTILE_STRUCTURES, {
          filter: s => s.hits &&
              (!stypes.length || _.any(stypes, stype => s.structureType === stype))
        })))
  }
}
