import * as debug from 'debug';
const Role = require('role')

module.exports = class Legacy extends Role {
  get role () {
    return Role.calcRole(this.name)
  }

  run () {
    if (this.spawning) {
      debug.log(this, "shouldn't be spawning")
      return 'spawning'
    }

    const role = _.camelCase('role ' + this.role.role)
    const roleFunc = this[role] || this.roleUndefined
    const what = roleFunc.apply(this)

    if (this.memory.task) {
      const first = this.memory.task.first
      if (first && first.roomName === this.room.name) {
        this.room.visual.line(this.pos, first)
      }
      delete this.memory.task.first
    }
    return what
  }

  after () {
    if (!this.intents) {
      debug.log(this, 'missing intents!')
    }
    const after = _.camelCase('after ' + this.role.role)
    const afterFunc = this[after] || this.afterUndefined
    if (_.isFunction(afterFunc)) afterFunc.apply(this)
  }
}
