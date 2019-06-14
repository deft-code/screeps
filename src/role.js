import * as debug from 'debug';

const gRoles = new Map()

Object.defineProperty(Creep.prototype, 'role', {
  get () {
    return Role.find(this.name)
  }
})

class Role extends debug.Debuggable {
  static calcRole (name) {
    return _.first(_.words(name))
  }

  static find (name) {
    return gRoles.get(name) || this._make(name)
  }

  static _make (name) {
    const role = this.calcRole(name)
    try {
      const Klass = require(`role.${role}`)
      const r = new Klass(name)
      gRoles.set(name, r)
      this._cleanup()
      return r
    } catch (err) {
      debug.log(name, role, err, err.stack)
    }
    return null
  }

  static _cleanup () {
    const nroles = gRoles.size
    const ncreeps = _.size(Game.creeps)
    let n = nroles - ncreeps
    for (const name of gRoles.keys()) {
      if (!Game.creeps[name]) {
        gRoles.delete(name)
        n--
        if (n <= 0) break
      }
    }
  }

  static egg (flag) {
  }

  static body (spawns) {
  }

  constructor (name) {
    super()
    this.name = name
  }

  get role () {
    return this.constructor.name.toLowerCase()
  }

  get creep () {
    return Game.creeps[this.name]
  }

  init () {
    this.cache = {
      intents: {}
    }
  }

  spawning () {
  }

  pre () {
  }

  again() {
  }

  run () {
  }

  after () {
  }
}
