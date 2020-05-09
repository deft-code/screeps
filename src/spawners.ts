import * as routes from 'routes';

const gSpawners = new Map<string, Spawner>();

let gTick = 0;
let gSpawns = [] as StructureSpawn[];

// let gNullSpawner = new Spawner();

// export class NullSpawner extends Spawner {

// };

export class Spawner {
  static participateAll(room: Room) {
    if(gTick !== Game.time) {
      gTick = Game.time;
      gSpawns = [];
    }
    gSpawns.push(...room.findStructs(STRUCTURE_SPAWN));
  }

  static registerAs(role: string) {
    return (klass: Spawner) => this.register(role, klass);
  }
  static register(role: string, spawner: Spawner) {
    gSpawners.set(role, spawner);
  }
  static getSpawner(role: string) {
    const s = gSpawners.get(role);
    if(s) return s;
    return this;
  }

  constructor (public readonly creepName: string) {
  }

  get team () {
    return Game.flags[Memory.creeps[this.creepName].team]
  }

  get teamRoom () {
    return this.team.room
  }

}

// exports.LocalSpawner = class LocalSpawner extends Spawner {
//   findSpawns () {
//     let spawns = []
//     let dist = 11
//     for (const s of this.allSpawns) {
//       const room = s.pos.roomName
//       const d = routes.dist(this.team.name, room)
//       if (d < dist) {
//         dist = d
//         spawns = [s]
//       } else if (d === dist) {
//         spawns.push(s)
//       }
//     }
//     return spawns
//   }
// }

// exports.CloseSpawner = class CloseSpawner extends Spawner {
//   findSpawns () {
//     const mdist = _(this.allSpawns)
//       .map(s => routes.dist(this.team.name, s.pos.roomName))
//       .min()
//     return _.filter(this.allSpawns, s =>
//       routes.dist(this.team.name, s.pos.roomName) <= mdist + 1)
//   }
// }

// exports.RemoteSpawner = class RemoteSpawner extends Spawner {
//   findSpawns () {
//     const mdist = _(this.allSpawns)
//       .map(s => routes.dist(this.team.name, s.pos.roomName))
//       .filter(d => d > 0)
//       .min()
//     return _.filter(this.allSpawns, s => {
//       const d = routes.dist(this.team.name, s.room.name)
//       return d > 0 && d <= mdist
//     })
//   }
// }

// exports.MaxSpawner = class MaxSpawner extends Spawner {
//   findSpawns () {
//     const close = _.filter(this.allSpawns, s => routes.dist(this.team.name, s.pos.roomName) <= 10)
//     const mlvl = _.max(close.map(s => s.room.controller.level))
//     const lvl = _.filter(close, s => s.room.controller.level >= mlvl)
//     const mspawn = _.min(lvl, s => routes.dist(this.team.name, s.pos.roomName))
//     const mdist = routes.dist(this.team.name, mspawn.pos.roomName) + 1
//     return _.filter(lvl, s => routes.dist(this.team.name, s.pos.roomName) <= mdist)
//   }
// }
