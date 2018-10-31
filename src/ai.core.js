const AI = require('ai')

module.exports = class AICore extends AI {
  init () {
    super.init()
    this.log('core')
  }

  run () {
  }

  after () {
  }

  optional () {
  }

  spawningRun () {
    const spawns = _.shuffle(this.findStructs(STRUCTURE_SPAWN))
    for (const spawn of spawns) {
      if (!spawn.spawning) break
      const c = Game.creeps[spawn.spawning.name]
      if (!c) {
        this.log(`Missing creep '${spawn.spawning.name}' from '${spawn.name}', left ${spawn.spawning.remainingTime}`)
        continue
      }
      if (!c.memory.home) {
        c.memory.home = this.name
        c.memory.cpu = 0
      }
      this.requestBoosts(c.memory.boosts)
    }
  }

  requestBoosts (boosts) {
  }
}
