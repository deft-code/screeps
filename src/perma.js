import * as lib from 'lib';

class Perma {
  get o() {
    return this.obj()
  }

  static get(name) {
    if (!this.all) this.all = {}

    if (!this.all[name]) {
      this.all[name] = new this(name)
    }
    return this.all[name]
  }
}

class PRoom extends Perma {
  constructor(name) {
    super()
    this.name = name
  }

  obj() {
    return Game.rooms[this.name]
  }
}

class PPos extends Perma {
  get pos() {
    return this.o.pos
  }

  get room() {
    return PRoom.get(this.pos.roomName)
  }
}

class PFlag extends PPos {
  constructor(name) {
    super()
    this.name = name
  }

  obj() {
    return Game.flags[this.name]
  }
}

lib.roProp(Flag, 'p', f => PFlag.get(f.name))

// class PResource extends PRoomObj {
// }

// class PRoomObj extends Perma {
//  lookup () {
//    return Game.getObjectById(this.id)
//  }

//  get pos () {
//    return this.o.pos
//  }
// }

// class PSource extends PRoomObj {
// }

// class POwnedStructure extends PRoomObj {
//  lookup () {
//    return Game.structures[this.id] ||
//      Game.getObjectById(this.id)
//  }
// }

// class PMineral extends PRoomObj {
// }

// class PCreep extends PRoomObj {
//  get hits () {
//    return this.o.hits
//  }

//  get hurts () {
//    return this.o.hitsMax - this.o.hits
//  }
// }

// class PRoom extends Perma {
//  lookup () {
//    return Game.rooms[this.id]
//  }
// }
