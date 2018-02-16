const lib = require('lib')
const debug = require('debug')
const k = require('constants')

class LabExtra {
  mineralFill () {
    if (!this.planType) return false
    if (this.mineralType && this.planType !== this.mineralType) return false

    return this.mineralAmount < 100
  }

  mineralDrain () {
    if (this.mineralAmount && this.planType !== this.mineralType) return true
    return this.mineralAmount > 700
  }

  get boost () {
    if (!this.memory.boost) return null
    if (Game.time > this.memory.boostTime) {
      delete this.memory.boost
      return null
    }
    return this.memory.boost
  }

  set boost (mineral) {
    if (!_.contains(RESOURCES_ALL, mineral)) {
      delete this.memory.boost
      return null
    }
    this.memory.boost = mineral
    this.memory.boostTime = Game.time + 15
    return this.memory.boost
  }

  get planType () {
    return this.boost || this.memory.planType || null
  }

  set planType (mineral) {
    if (!_.contains(RESOURCES_ALL, mineral)) {
      delete this.memory.planType
      return null
    }
    this.memory.planType = mineral
    return this.memory.planType
  }

  get mineralFree () {
    return this.mineralCapacity - this.mineralAmount
  }

  get memory () {
    if (!this.my) return {}
    const labmem = this.room.memory.labs
    let mem = labmem[this.id]
    if (!mem) {
      mem = labmem[this.id] = {
        note: this.note
      }
      console.log('Creating lab memory for:', this.note)
    }
    return mem
  }

  run () {
    if (this.cooldown) return false
    if (this.mineralType && this.planType !== this.mineralType) return false
    if (this.mineralFree < LAB_REACTION_AMOUNT) return false

    let labs = []

    const parts = k.Reactions[this.planType]
    if (!parts) return false

    if (this.room.terminal.store[this.planType] > 10000) return false

    for (const react of parts) {
      for (const lab of this.room.findStructs(STRUCTURE_LAB)) {
        if (lab.mineralType !== react) continue
        if (lab.mineralAmount < LAB_REACTION_AMOUNT) continue
        if (!this.pos.inRangeTo(lab, 2)) continue

        labs.push(lab)
        break
      }
    }
    if (labs.length === 2) {
      const err = this.runReaction(labs[0], labs[1])
      if (err !== OK) {
        console.log(this, 'bad reaction', err, labs)
        return false
      }
      return true
    }
    return false
  }
}

lib.merge(StructureLab, LabExtra)

const splitLabs = (labs) => {
  if (labs.length < 7) {
    return [labs.slice(0, 2), labs.slice(2)]
  }

  let minY = Infinity
  let maxY = -Infinity
  let minX = Infinity
  let maxX = -Infinity
  for (const lab of labs) {
    const [x, y] = [lab.pos.x, lab.pos.y]
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (x < minX) minX = x
    if (x > maxX) maxX = x
  }
  labs = labs.slice()
  const a = _.remove(labs, l =>
    l.pos.x > minX &&
    l.pos.x < maxX &&
    l.pos.y > minY &&
    l.pos.y < maxY)
  return [a, labs]
}

Room.prototype.setLabs = function (resource) {
  if (this.memory.labs.current === resource) {
    this.log('skip set', resource)
    return
  }

  this.memory.labs.current = resource

  const [inner, outer] = splitLabs(this.findStructs(STRUCTURE_LAB))
  const parts = k.Reactions[resource]
  if (!parts) return
  for (let i = 0; i < inner.length; i++) {
    inner[i].planType = parts[i]
  }
  for (const lab of outer) {
    lab.planType = resource
  }
}

const autoSet = (flag, r) => {
  debug.log(flag, 'auto react', r)
  flag.room.setLabs(r)
  flag.memory.current = r
  flag.memory.time = Game.time
}

const autoReact = (flag) => {
  const t = flag.room.terminal
  if (!t || !t.my) return
  if (flag.room.findStructs(STRUCTURE_LAB).length < 3) return

  if (!flag.memory.target) {
    flag.memory.target = _.first(_.words(flag.name, /[GKHLOUXZ2]+/))
    autoSet(flag, flag.memory.target)
  }

  if (flag.memory.time + 500 > Game.time) {
    flag.dlog('skipping:', flag.memory.time + 500 - Game.time, flag)
    return
  }

  flag.dlog(flag, 'autoReact', JSON.stringify(flag.memory))
  for (let r of k.ReactionAll[flag.memory.target]) {
    flag.dlog(flag, 'checking', r, JSON.stringify(flag.memory))
    if (r === flag.memory.current) {
      if ((t.store[r] || 0) < 3000) return
    } else {
      if (!t.store[r]) {
        autoSet(flag, r)
        return
      }
    }
  }
  autoSet(flag, flag.memory.target)
}

const reactOrder = [
  RESOURCE_CATALYZED_UTRIUM_ACID,
  RESOURCE_CATALYZED_GHODIUM_ACID,
  RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
  RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
  RESOURCE_CATALYZED_ZYNTHIUM_ACID,
  RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
  RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
  RESOURCE_GHODIUM,
  RESOURCE_CATALYZED_LEMERGIUM_ACID
]

StructureTerminal.prototype.autoReact = function () {
  if ((Game.time + this.pos.xy) % 500 !== 0) return
  if (this.room.findStructs(STRUCTURE_LAB).length < 3) return

  this.room.log('Auto Reaction')
  for (const ar of reactOrder) {
    this.room.log('auto reacting', ar)
    if ((this.store[ar] || 0) > 9000) continue
    for (const r of k.ReactionAll[ar]) {
      if ((this.store[r] || 0) < 3000) {
        this.room.log('Setting Labs', ar, r)
        this.room.setLabs(r)
        return
      }
    }
  }
}

Room.prototype.runLabs = function () {
  if (!this.memory.labs) {
    this.memory.labs = {}
    this.log('Creating memory for labs')
  }
  for (const flag of this.find(FIND_FLAGS)) {
    if (flag.color !== COLOR_CYAN) continue
    switch (flag.secondaryColor) {
      case COLOR_GREEN:
        autoReact(flag)
        break
      case COLOR_RED:
        for (const lab of this.findStructs(STRUCTURE_LAB)) {
          lab.planType = null
        }
        flag.remove()
        break
      case COLOR_PURPLE:
        const lab = _.find(this.findStructs(STRUCTURE_LAB),
          l => flag.pos.isEqualTo(l.pos))
        if (lab) {
          lab.planType = flag.name
        }
        flag.remove()
        break
      case COLOR_BLUE:
        this.setLabs(flag.name)
        flag.remove()
        break
    }
  }
  if (this.terminal && this.terminal.my) {
    this.terminal.autoReact()
  }
  const labs = this.findStructs(STRUCTURE_LAB)
  for (let lab of labs) {
    if (lab.planType !== lab.mineralType && lab.mineralType) {
      this.visual.text(`${lab.planType}:${lab.mineralType}`, lab.pos, {color: '0xAAAAAA', font: 0.3})
    } else {
      this.visual.text(lab.planType, lab.pos, {color: '0xAAAAAA', font: 0.4})
    }
  }
  const i = Game.time % 10
  if (i < labs.length) {
    if (!labs[i].run()) {
      this.visual.circle(labs[i].pos, {fill: 'color'})
    }
  }
}
