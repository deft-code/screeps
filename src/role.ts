import * as debug from 'debug';

// The 2018 class-based role experiment: one Role object per creep name,
// made from the module `role.<role>` and cached on the heap; role.legacy.ts
// is its bridge to the roleXxx/afterXxx methods. Orphan: nothing imports
// it, and importing it would replace Creep.prototype.role (creep.role.ts)
// with the lookup below.

const gRoles = new Map<string, Role>()

Object.defineProperty(Creep.prototype, 'role', {
  get (this: Creep) {
    return Role.find(this.name)
  }
})

export class Role extends debug.Debuggable {
  static calcRole (name: string): string {
    return _.first(_.words(name))
  }

  static find (name: string): Role | null {
    return gRoles.get(name) || this._make(name)
  }

  static _make (name: string): Role | null {
    const role = this.calcRole(name)
    try {
      const Klass = require(`role.${role}`)
      const r: Role = new Klass(name)
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

  static egg (_flag: Flag) {
  }

  static body (_spawns: StructureSpawn[]) {
  }

  cache?: { intents: {} }

  constructor (name: string) {
    super()
    this.name = name
  }

  // The creep's memory (Debuggable's `debug` reads it; the JS never
  // defined this and would have thrown on `dlog`).
  get memory(): CreepMemory {
    return Memory.creeps[this.name]
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
