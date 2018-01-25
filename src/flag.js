Flag.prototype.what = function () {
  return _.words(this.name)[0]
}

Flag.prototype.quantity = function () {
  return parseInt(_.words(this.name)[1])
}

Flag.prototype.run = function () {
  switch (this.color) {
    case COLOR_BLUE:
      return this.runTeam()
    case COLOR_ORANGE:
      return require('planner')(this)
  }
}

Flag.prototype.darkRun = function () {
  if (this.room) return
  if (this.color === COLOR_BLUE) {
    this.darkTeam()
  }
}

Flag.prototype.temp = function () {
  if (this.memory.room !== this.pos.roomName) {
    this.memory.room = this.pos.roomName
    this.memory.born = Game.time
  }

  if (Game.time > 1500 + this.memory.born) {
    this.remove()
  }
}
