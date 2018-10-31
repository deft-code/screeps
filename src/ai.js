const debug = require('debug')
const stack = require('stack')

class AI extends debug.Debuggable {
  constructor (name) {
    super()
    this.name = name
  }

  get kind () {
    return stack.where().split('#')[0]
  }

  get memory () {
    return this.room.memory
  }

  get room () {
    return Game.rooms[this.name]
  }

  init () {
    this.cache = {}
    this.log('init')
  }

  run () {
  }

  after () {
  }

  optional () {
  }

  toString () {
    return `[${this.kind} ${this.name}]`
  }
}

module.exports = AI

const gAIs = new Map()

Object.defineProperty(Room.prototype, 'ai', {
  get () {
    const ai = gAIs.get(this.name)
    if (ai) return ai
    const newai = makeAI(this)
    gAIs.set(this.name, newai)
    return newai
  }
})

function calcAI (room) {
  return room.memory.ai || 'core'
}

function makeAI (room) {
  const aitype = calcAI(room)
  try {
    const Klass = require(`ai.${aitype}`)
    return new Klass(room.name)
  } catch (err) {
    room.log(aitype, err, err.stack)
  }
  return new AI(room.name)
}
