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

const AIDefault = require('ai.default')

function calcAI (room) {
  return room.memory.ai || room.memory.autoAI || 'default'
}

function makeAI (room) {
  const aitype = calcAI(room)
  try {
    const Klass = require(`ai.${aitype}`)
    return new Klass(room.name)
  } catch (err) {
    room.log(aitype, err, err.stack)
  }
  return new AIDefault(room.name)
}
