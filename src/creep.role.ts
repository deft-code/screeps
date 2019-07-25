import * as debug from 'debug';
import { CreepExtra } from 'creep';

import { TaskRet } from 'Tasker';
import { injecter } from 'roomobj';

declare global {
  interface CreepTaskMem {
    first?: RoomPosition
    flag?: string
    id?: string
    task?: string
  }
  interface CreepMemory {
    home?: string
    team: string
    cpu: number
    task?: CreepTaskMem
    boosts?: ResourceConstant[]
  }
  interface Creep {
    moveNear(dest: RoomObject): TaskRet
  }
}

@injecter(Creep)
export class CreepRole extends CreepExtra {
  ticksToLive: number
  get intents(): any {
    if (!this.tick.intents) {
      return this.tick.intents = {};
    }
    return this.tick.intents;
  }
  get home() {
    if (!this.memory.home) {
      this.memory.home = this.pos.roomName
    }
    return Game.rooms[this.memory.home] || this.teamRoom || this.room
  }

  get team() {
    const t = Game.flags[this.memory.team]
    if (!t) {
      const team = _.last(this.name.split('_', 2));
      return Game.flags[team];
    }
    return t
  }

  get atTeam() {
    return this.room.name === this.team.pos.roomName
  }

  get atHome() {
    return this.room.name === this.memory.home
  }

  get teamRoom() {
    return this.team && this.team.room || this.room;
  }

  get role() {
    return _.first(_.words(this.name))
  }

  spawningRun() {
    if (!this.spawning) {
      debug.log(this, 'Not Spawning!')
      return
    }
    if (!this.memory.home) {
      this.memory.home = this.room.name
      this.memory.cpu = 0
    }
    this.doBoosts()
  }

  roleUndefined(): TaskRet {
    debug.log(`${this} Missing Role! "${this.role}" ${JSON.stringify(this.memory)}`)
    return false
  }

  run() {
    if (this.spawning) {
      debug.log(this, "shouldn't be spawning")
      return
    }

    const start = Game.cpu.getUsed()

    const role = _.camelCase('role ' + this.role) as "roleUndefined";
    const roleFunc = this[role] || this.roleUndefined
    const what = roleFunc.apply(this)
    if (what === 'done' || what === 'again') {
      this.log("BAD WHAT", what);
    }

    if (this.memory.task) {
      const first = this.memory.task.first
      if (first && first.roomName === this.room.name) {
        this.room.visual.line(this.pos, first)
      }
      delete this.memory.task.first
    }

    const total = Math.floor(1000 * (Game.cpu.getUsed() - start))
    this.memory.cpu += total

    let rate = this.memory.cpu;
    const age = CREEP_LIFE_TIME - this.ticksToLive!
    if (age > 0) {
      rate = Math.floor(rate / age)
    }

    this.dlog(`cpu ${total}:${rate} ${what}`)
  }

  after() {
    if (!this.intents) {
      debug.log(this, 'missing intents!')
    }
    const start = Game.cpu.getUsed()

    const after = _.camelCase('after ' + this.role) as "roleUndefined";
    const afterFunc = this[after];
    if (_.isFunction(afterFunc)) afterFunc.apply(this)

    const total = Math.floor(1000 * (Game.cpu.getUsed() - start))
    this.memory.cpu += total
  }


  checkMem(name: string) {
    let mem = this.memory.task
    if (mem && mem.task !== name) {
      delete this.memory.task
      mem = undefined
    }
    return mem
  }

  checkFlag(name: string, flag: Flag | string | null) {
    if (_.isString(flag)) flag = Game.flags[flag]

    if (flag) {
      this.memory.task = {
        task: name,
        flag: flag.name,
        first: flag.pos
      }
      return flag
    }

    const mem = this.checkMem(name)
    if (mem) {
      flag = Game.flags[this.memory.task!.flag!]
      if (!flag) return null;
      if (this.debug && this.pos.roomName === flag.pos.roomName) {
        this.room.visual.line(this.pos, flag.pos, { lineStyle: 'dotted' })
      }
      return flag
    }

    return null;
  }

  checkId<T extends RoomObject>(name: string, obj: T | string | undefined | null): T | null {
    if (_.isString(obj)) obj = Game.getObjectById(obj)

    if (obj) {
      obj = <T>obj;
      this.memory.task = {
        task: name,
        id: obj.id,
        first: obj.pos
      }
      this.dlog(`start ${name} ${obj}`)
      return obj
    }

    // This prevents accidental repeats.
    if (obj !== undefined) return null;

    const mem = this.checkMem(name)
    if (mem) {
      obj = Game.getObjectById<T>(this.memory.task!.id);
      if (!obj) return null;

      if (this.debug && this.pos.roomName === obj.pos.roomName) {
        this.room.visual.line(this.pos, obj.pos, { lineStyle: 'dotted' })
      }
      this.dlog(`again ${name} ${obj}`)
      return obj
    }

    return null;
  }

  taskTask() {
    const tmem = this.memory.task
    if (!tmem) return false

    const fname = _.camelCase('task ' + tmem.task)
    if (fname === 'taskTask') {
      debug.log('Task Recursion')
      Game.notify('Task Recursion')
      return false
    }
    this.roleUndefined
    const f = this[_.camelCase('task ' + tmem.task) as "roleUndefined"]
    if (!_.isFunction(f)) return false

    const what = f.apply(this)
    if (!what || what === 'success') {
      if (this.debug) {
        if (!what) {
          this.say('None!')
        } else {
          this.say('Done')
        }
      }
      delete this.memory.task
    }
    return what
  }

  doBoosts() {
    if (this.spawning || this.ticksToLive < 100) {
      if (this.memory.boosts) {
        this.room.requestBoosts(this.memory.boosts)
      }
    }
  }

  taskBoostOne() {
    if (!_.size(this.memory.boosts!)) return false
    const mineral = this.memory.boosts!.pop()
    const what = this.taskBoostMineral(mineral)
    if (!what) {
      this.log(`ERROR: unable to boost ${mineral}`)
    }
    return what
  }

  taskBoostMineral(mineral?: ResourceConstant) {
    return this.taskBoost(this.room.requestBoost(mineral))
  }

  taskBoost(lab: StructureLab | null) {
    this.doBoosts()
    lab = this.checkId('boost', lab);
    if (!lab) return false
    lab.room.requestBoost(lab.planType)

    if (lab.mineralAmount < LAB_BOOST_MINERAL) return false
    if (lab.energy < LAB_BOOST_ENERGY) return false

    const err = lab.boostCreep(this)
    if (err === ERR_NOT_IN_RANGE) {
      return this.moveNear(lab)
    }
    if (err !== OK) {
      this.log(`UNEXPECTED boost error: ${err}, ${lab}`)
      return false
    }
    return 'success'
  }
}

Room.prototype.spawningRun = function () {
  if (!this.controller) return
  if (!this.controller.my) return
  const spawns = _.shuffle(this.findStructs(STRUCTURE_SPAWN)) as StructureSpawn[];
  for (const spawn of spawns) {
    if (!spawn.spawning) break
    const c = Game.creeps[spawn.spawning.name]
    if (c) {
      (c as CreepRole).spawningRun()
    } else {
      this.log(`Missing creep '${spawn.spawning.name}' from '${spawn.name}', left ${spawn.spawning.remainingTime}`)
    }
  }
}