const lib = require('lib')
const debug = require('debug')
const k = require('constants')

class LabExtra {
  mineralFill () {
    if (!this.planType) return false
    if (this.mineralType && this.planType !== this.mineralType) return false

    if (this.mineralAmount < 100) return true
    return lib.isBoost(this.planType) && this.mineralAmount < 2300
  }

  mineralDrain () {
    if (this.mineralAmount && this.planType !== this.mineralType) return true
    if (this.mineralAmount > 2900) return true
    return !lib.isBoost(this.planType) && this.mineralAmount > 700
  }

  get planType () {
    if (!this.memory.planType) return null

    return this.memory.planType
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

Room.prototype.runLabs = function () {
  if (!this.memory.labs) {
    this.memory.labs = {}
    console.log('Creating memory for labs in', this.name)
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
  for (let lab of this.findStructs(STRUCTURE_LAB)) {
    if (lab.run()) return
  }
}
