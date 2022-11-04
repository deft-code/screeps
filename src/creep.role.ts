import * as debug from 'debug';
import { CreepExtra } from 'creep';

import { TaskRet } from 'Tasker';
import { injecter } from 'roomobj';
import { getMyCreep, MyCreep } from 'mycreep';
import { JobCreep } from 'job.creep';

declare global {
  interface CreepTaskMem {
    first?: RoomPosition
    flag?: string
    id?: string
    task?: string
  }
  interface CreepMemory {
    home?: string
    team?: string
    cpu: number
    task?: CreepTaskMem
    boosts?: MineralBoostConstant[]
    spawnid?: Id<StructureSpawn>
    start?: number
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

  get team(): Flag {
    return new Flag(this.memory.mission, COLOR_WHITE, COLOR_WHITE, this.mycreep.mission.roomName, 25, 25);
  }

  // get teamOld(): Flag {}
  //   const t = Game.flags[this.memory.mission]
  //   if (t) return t;

  //   const teamName = _.last(this.name.split('_', 2));
  //   const team = Game.flags[teamName];
  //   if (team) return team;

  //   const local = _.find(this.room.find(FIND_FLAGS), f => f.color === COLOR_BLUE);
  //   if(local) return local;

  //   this.log("lost creep!");
  //   return Game.flags.Home;
  // }

  get mycreep(): JobCreep {
    return getMyCreep(this.name) as JobCreep;
  }

  get atTeam() {
    return this.room.name === this.mycreep.mission.roomName
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

    const where = debug.where(2).func;
    if(_.camelCase('task ' + name) !== where) {
      this.log("mismatched tasks", name, 'vs', where);
    }


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
      const target = Game.getObjectById<T>(this.memory.task!.id!);
      if (!target) return null;

      if (this.debug && this.pos.roomName === target.pos.roomName) {
        this.room.visual.line(this.pos, target.pos, { lineStyle: 'dotted' })
      }
      this.dlog(`again ${name} ${target}`)
      return target
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
          this.log("what", what);
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
    if (this.spawning || this.ticksToLive > CREEP_LIFE_TIME - 100) {
      if (this.memory.boosts) {
        this.log("boosting", this.memory.boosts);
        this.room.requestBoosts(this.memory.boosts);
      }
    }
  }

  isBoosted(boost: MineralBoostConstant) {
    return _.any(this.body, b => b.boost === boost);
  }

  taskNeedBoost(): TaskRet {
    if (this.ticksToLive < CREEP_LIFE_TIME - 100) {
      return this.taskBoostOne();
    }
    const first = [
      RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
      RESOURCE_ZYNTHIUM_ALKALIDE,
      RESOURCE_ZYNTHIUM_OXIDE,
    ];

    const boost = _.find(this.memory.boosts!, b => _.contains(first, b)) ||
      _.sample(this.memory.boosts!);
    if (!boost) return false;
    if (this.isBoosted(boost)) {
      this.log("done boosting", boost);
      _.remove(this.memory.boosts!, boost);
      return this.taskNeedBoost();
    }
    return this.taskBoostMineral(boost);
  }

  taskBoostOne() {
    if (!_.size(this.memory.boosts!)) return false;
    const mineral = this.memory.boosts!.pop()
    const what = this.taskBoostMineral(mineral)
    if (!what) {
      this.log(`ERROR: unable to boost ${mineral}`)
    }
    return what
  }

  taskBoostMineral(mineral?: MineralBoostConstant) {
    if(!mineral) {
      mineral = _.sample(this.memory.boosts!);
    }
    if(!mineral) return false;
    return this.taskBoost(this.room.requestBoost(mineral));
  }

  taskBoost(lab: StructureLab | null) {
    this.doBoosts();
    lab = this.checkId('boost', lab);
    if (!lab) return false;
    const planType = lab.planType;
    lab.room.requestBoost(lab.planType);

    if (lab.mineralAmount < LAB_BOOST_MINERAL) return false;
    if (lab.store.energy < LAB_BOOST_ENERGY) return false;

    const err = lab.boostCreep(this);
    if (err === ERR_NOT_IN_RANGE) {
      return this.moveNear(lab);
    }
    if (err !== OK) {
      this.errlog(err, `UNEXPECTED boost err @ ${lab}`);
      _.remove(this.memory.boosts!, b => b === planType);
      return false;
    }
    return 'success';
  }

  nearSpawn(): StructureSpawn | null {
    let s = Game.getObjectById(this.memory.spawnid);
    if (s && this.pos.isNearTo(s)) return s;

    s = _.find(this.room.findStructs(STRUCTURE_SPAWN) as StructureSpawn[],
      ss => this.pos.isNearTo(ss)) || null;
    if (s) {
      this.memory.spawnid = s.id
    }
    return s
  }

  idleImmortal() {
    if (this.room.energyFreeAvailable !== 0) return;
    if (this.ticksToLive >= (CREEP_LIFE_TIME - (600 / this.body.length))) {
      this.dlog("too young to renew", this.ticksToLive);
      return
    }
    const s = this.nearSpawn();
    if (!s) return;
    if (s.tick.renew) {
      this.log('Double Renew', s, s.tick.renew);
      const other = Game.creeps[s.tick.renew];
      if ((other?.ticksToLive || 0) < this.ticksToLive) return;
    }
    if (s.renewCreep(this) === OK) {
      s.tick.renew = this.name;
    }
  }
}

export function spawningRun(room: Room) {
  if (!room.controller) return
  if (!room.controller.my) return
  const spawns = _.shuffle(room.findStructs(STRUCTURE_SPAWN)) as StructureSpawn[];
  for (const spawn of spawns) {
    if (!spawn.spawning) break
    const c = Game.creeps[spawn.spawning.name]
    if (c) {
      (c as CreepRole).spawningRun()
    } else {
      room.log(`Missing creep '${spawn.spawning.name}' from '${spawn.name}', left ${spawn.spawning.remainingTime}`)
    }
  }
}