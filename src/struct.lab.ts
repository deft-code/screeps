import * as lib from 'lib';
import * as k from 'constants';
import { extender } from 'roomobj';

// Lab bookkeeping of the 2017 base: a lab's plan (what it should hold) and
// boost claim live in the room's `labs` memory by lab id; orderedLabs sorts
// the room's labs by centrality so the two most central are the inputs;
// autoReactAll picks the room's reaction from mineralPlan (a room a LabPlan
// service manages is skipped); runLabs runs the reactions and draws the
// labels.

// What the room keeps for one lab (Memory.rooms[x].labs[id]).
interface LabMem {
  note?: string
  boost?: ResourceConstant
  boostTime?: number
  planType?: ResourceConstant
}

declare global {
  interface StructureLab {
    // planType, boost, mineralFill and mineralDrain: types.d.ts
    mineralFree: number
    memory: LabMem
  }
  interface StructureTerminal {
    setLabs(resource: ResourceConstant): void
    autoReact(mineral: ResourceConstant): ResourceConstant
    autoReactAll(override?: boolean): void
  }
  interface Room {
    // requestBoost(s): types.d.ts
    orderedLabs(): StructureLab[]
    runLabs(): void
    findBoostLab(boost: ResourceConstant, nearSpawn?: boolean): StructureLab | null
  }
}

@extender
class LabExtra extends StructureLab {
  mineralFill() {
    if (!this.planType) return false
    if (this.mineralType && this.planType !== this.mineralType) return false
    if (this.boost) {
      return this.mineralAmount < 1800
    }
    if (this.planType === this.room.memory.labs!.current) {
      return false
    }
    return this.mineralAmount < 400
  }

  mineralDrain() {
    if (this.mineralAmount && this.planType !== this.mineralType) return true
    if (this.boost) {
      return this.mineralAmount > 2400
    }
    if (this.planType === this.room.memory.labs!.current) {
      return this.mineralAmount >= 500
    }
    return this.mineralAmount >= 900
  }

  get boost(): ResourceConstant | null {
    if (!this.memory.boost) return null
    if (Game.time > this.memory.boostTime!) {
      delete this.memory.boost
      return null
    }
    return this.memory.boost
  }

  set boost(mineral: ResourceConstant | null) {
    if (!_.contains(RESOURCES_ALL, mineral as ResourceConstant)) {
      delete this.memory.boost
      return
    }
    this.memory.boost = mineral!
    this.memory.boostTime = Game.time + 15
  }

  get planType(): ResourceConstant | null {
    return this.boost || this.memory.planType || null
  }

  set planType(mineral: ResourceConstant | null) {
    if (!_.contains(RESOURCES_ALL, mineral as ResourceConstant)) {
      delete this.memory.planType
      return
    }
    this.memory.planType = mineral!
  }

  get mineralFree() {
    return this.mineralCapacity - this.mineralAmount
  }

  get memory(): LabMem {
    if (!this.my) return {}
    const labmem = this.room.memory.labs!
    let mem: LabMem = labmem[this.id]
    if (!mem) {
      mem = labmem[this.id] = {
        note: this.note
      }
      console.log('Creating lab memory for:', this.note)
    }
    return mem
  }
}

@extender
class LabTerminalExtra extends StructureTerminal {
  setLabs(resource: ResourceConstant) {
    const labmem = this.room.memory.labs!
    if (labmem.current === resource) {
      this.room.log('skip set', resource)
      return
    }

    labmem.current = resource

    const labs = this.room.orderedLabs()

    if (labs.length < 3) return

    labs[0].planType = k.Reactions[resource][0]
    labs[1].planType = k.Reactions[resource][1]

    for (let i = 2; i < labs.length; i++) {
      labs[i].planType = resource
    }
  }

  // The deepest input of `mineral`'s reaction chain the terminal is short of.
  autoReact(mineral: ResourceConstant): ResourceConstant {
    this.room.dlog('Mineral:', mineral)
    for (const part of k.Reactions[mineral]) {
      if (_.contains(k.CoreMinerals, part)) continue
      if (this.store[part] >= 2000) continue
      return this.autoReact(part)
    }
    return mineral
  }

  autoReactAll(override = false) {
    if (!override && (Game.time + this.pos.xy) % 500 !== 0) return;
    if (this.room.findStructs(STRUCTURE_LAB).length < 3) return;

    const plans = mineralPlan();

    for (const [boost, n] of plans) {
      this.room.dlog(boost, n);
      if (this.store[boost] > n) continue;
      this.setLabs(this.autoReact(boost));
      return;
    }
    this.setLabs(this.autoReact(RESOURCE_CATALYZED_GHODIUM_ACID));
  }
}

export function mineralPlan(): [ResourceConstant, number][] {
  if (Game.shard.name === 'swc') {
    return [
      [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, 20 * 30],
      [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, 20 * 30],
      [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, 25 * 30],
      [RESOURCE_CATALYZED_KEANIUM_ALKALIDE, 25 * 30],
      [RESOURCE_CATALYZED_UTRIUM_ACID, 500],
      [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, 5000],
      [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, 5000],
      [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, 5000]
    ]
  }

  return [
    // First make boosts for Mason. Turtle is still best defense.
    [RESOURCE_CATALYZED_LEMERGIUM_ACID, 1200],
    [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, 150],
    [RESOURCE_CATALYZED_KEANIUM_ACID, 150],

    [RESOURCE_CATALYZED_UTRIUM_ACID, 5000],
    [RESOURCE_CATALYZED_LEMERGIUM_ACID, 5000],
    // Autoreact fall back to this once all other boosts are at quota.
    //[RESOURCE_CATALYZED_GHODIUM_ACID, 5000],
    [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, 5000],
    [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, 5000],
    [RESOURCE_CATALYZED_ZYNTHIUM_ACID, 5000],
    [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, 5000],
    [RESOURCE_CATALYZED_KEANIUM_ALKALIDE, 5000],
    [RESOURCE_CATALYZED_KEANIUM_ACID, 5000],
    //[RESOURCE_GHODIUM, 5000],
    [RESOURCE_CATALYZED_LEMERGIUM_ACID, 5000]
  ]
}

@extender
class LabRoomExtra extends Room {
  // The room's labs sorted by the sum of their ranges to every other lab
  // (most central first), memoised in labs.order until the lab count changes.
  orderedLabs(): StructureLab[] {
    const labmem = this.memory.labs!
    const labIds = labmem.order || []
    const labs = this.findStructs(STRUCTURE_LAB)
    if (labIds.length !== labs.length) {
      const v = new Map<Id<StructureLab>, number>()
      for (const l1 of labs) {
        let sum = 0
        for (const l2 of labs) {
          sum += l1.pos.getRangeTo(l2)
        }
        v.set(l1.id, sum)
        this.visual.text(String(sum), l1.pos)
      }
      labs.sort((a, b) => v.get(a.id)! - v.get(b.id)!)
      delete labmem.current
      labmem.order = labs.map(l => l.id)
    }
    return _.map(labmem.order!, id => Game.structures[id] as StructureLab)
  }

  runLabs() {
    console.log("Don't runLabs this way anymore", this.name);
    return runLabs(this);
  }

  requestBoosts(boosts: ResourceConstant[] | undefined) {
    for (const boost of boosts || []) {
      this.requestBoost(boost)
    }
  }

  // Claim a lab for `boost` for 15 ticks (findBoostLab; the Chemist fills
  // it). `nearSpawn` asks for a free lab beside a spawn (a MOVE boost: the
  // hatchling crawls until it is on; Wickthree, 1 Nov 2026).
  requestBoost(boost: ResourceConstant | null | undefined, nearSpawn = false): StructureLab | null {
    // No boost (a lab without a plan, creep.role.ts taskBoost): nothing to
    // claim. The JS handed back a free lab with its claim cleared instead.
    if (!boost) return null
    const lab = this.findBoostLab(boost, nearSpawn)
    if (!lab) {
      this.log('Failed to boost:', boost)
      return null
    }
    lab.boost = boost
    return lab
  }

  // The lab for `boost`: one already claimed for it, else one whose plan
  // makes it, else a free one (no claim): the outermost by orderedLabs, or
  // with `nearSpawn` the one nearest any spawn of the room.
  findBoostLab(boost: ResourceConstant, nearSpawn = false): StructureLab | null {
    const labs = this.orderedLabs().slice().reverse()
    const have = _.find(labs, l => l.boost === boost) || _.find(labs, l => l.planType === boost)
    if (have) return have
    const free = labs.filter(l => !l.boost)
    if (!free.length) return null
    if (nearSpawn) {
      const spawns = this.find(FIND_MY_SPAWNS)
      if (spawns.length) return _.min(free, l => _.min(spawns.map(s => l.pos.getRangeTo(s))))
    }
    return free[0]
  }
}

function shortMineral(mineral: ResourceConstant): string {
  switch (mineral) {
    case RESOURCE_CATALYZED_GHODIUM_ACID:
    case RESOURCE_CATALYZED_KEANIUM_ACID:
    case RESOURCE_CATALYZED_LEMERGIUM_ACID:
    case RESOURCE_CATALYZED_UTRIUM_ACID:
    case RESOURCE_CATALYZED_ZYNTHIUM_ACID:
    case RESOURCE_GHODIUM_ACID:
    case RESOURCE_KEANIUM_ACID:
    case RESOURCE_LEMERGIUM_ACID:
    case RESOURCE_UTRIUM_ACID:
    case RESOURCE_ZYNTHIUM_ACID:
      return mineral.substr(0, 3)
    case RESOURCE_GHODIUM_ALKALIDE:
    case RESOURCE_KEANIUM_ALKALIDE:
    case RESOURCE_LEMERGIUM_ALKALIDE:
    case RESOURCE_UTRIUM_ALKALIDE:
    case RESOURCE_ZYNTHIUM_ALKALIDE:
      return mineral[0] + 'O2'
    case RESOURCE_CATALYZED_GHODIUM_ALKALIDE:
    case RESOURCE_CATALYZED_KEANIUM_ALKALIDE:
    case RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE:
    case RESOURCE_CATALYZED_UTRIUM_ALKALIDE:
    case RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE:
      return mineral.substr(0, 2) + 'O'
  }
  return mineral
}

export function runLabs(room: Room) {
  if (!room.controller || !room.controller.my) return
  if (!room.memory.labs) {
    room.memory.labs = {}
    room.log('Creating memory for labs')
  }
  const labmem = room.memory.labs
  // A LabPlan service (labplan.ts) chooses for a room it manages.
  if (room.terminal && room.terminal.my && !labmem.managed) {
    room.terminal.autoReactAll()
  }
  const labs = room.orderedLabs()
  for (let lab of labs) {
    if (lab.mineralType) {
      room.visual.text(shortMineral(lab.mineralType),
        lab.pos.x + 0.05, lab.pos.y + 0.1,
        { color: 'black', font: 0.4 })
    }
    if (lab.planType) {
      let color = 'cornflowerblue'
      if (lab.boost) color = 'yellow'
      room.visual.text(shortMineral(lab.planType),
        lab.pos.x, lab.pos.y + 0.1,
        { color, font: 0.4 })
    }
  }

  let reactions = 0
  for (let i = 2; i < labs.length; i++) {
    const lab = labs[i]
    if (lab.cooldown) continue
    const plan = lab.planType
    // A managed room's LabPlan idles the labs itself once a product is at
    // quota; the 10k ceiling is for autoReactAll rooms (27 Oct 2026: the
    // cap held W25S7's outputs idle at 10300 XLHO2 under a 20k quota).
    if (!labmem.managed && plan && (room.terminal?.store[plan] || 0) > 10000) continue
    if (!lab.mineralType && plan !== labmem.current) continue
    if (lab.mineralType && plan !== lab.mineralType) continue
    const err = lab.runReaction(labs[0], labs[1])
    if (err !== OK) {
      room.dlog(lib.errStr(err), 'lab', i, labs[0].mineralType, '+', labs[1].mineralType, '=', lab.mineralType)
    } else {
      reactions++
      if (reactions > 1) break
      if ((REACTION_TIME as { [res: string]: number })[plan!] >= 10) break;
    }
  }
}
