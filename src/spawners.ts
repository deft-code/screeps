import * as routes from 'routes';
import * as debug from 'debug';

const gSpawners = new Map<string, Spawner>();

let gTick = 0;
let gPotentials = [] as potentialSpawn[];

interface potentialSpawn {
  spawn: StructureSpawn
  energy: number
}

interface CreepEggMem {
  // spawn algorithm or named spawn
  spawn: string
  team: string
}


function eggOrder(lname: string, rname: string): number {
  const lpriority = _.get(Memory.creeps, `[${lname}].egg.priority`, 10)
  const rpriority = _.get(Memory.creeps, `[${rname}].egg.priority`, 10)
  const lage = Game.time - Memory.creeps[lname].egg.laid;
  const rage = Game.time - Memory.creeps[rname].egg.laid;
  return lpriority - rpriority || rage - lage;
}

export function run() {
  const all = _.keys(Memory.creeps)
  const eggNames = _.filter(all,
    (cname) => _.isObject(Memory.creeps[cname].egg))

  eggNames.sort(eggOrder)

  const usedEnergy = new Map<string, number>();
  const usedSpawns = new Set<Id<StructureSpawn>>();

  const potentials = _.shuffle(gPotentials);
  for (let eggName of eggNames) {
    const eggMem = Memory.creeps[eggName].egg;
    const t = Game.flags[eggMem.team];
    if (!t || !_.contains(t.memory.creeps!, eggName)) {
      delete Memory.creeps[eggName];
      debug.log('UnOwned Egg!', eggName, JSON.stringify(eggMem));
      continue;
    }
    const [maxRcl, maxCap, selected] = findSpawns(potentials, eggMem);
    const adjusted = [];
    for (const { spawn, energy } of selected) {
      if(usedSpawns.has(spawn.id)) continue;
      const newE = energy - (usedEnergy.get(spawn.pos.roomName) || 0)
      if (newE > 0) {
        adjusted.push({ spawn, energy: newE });
      }
    }

    const maxE = Math.max(...adjusted.map(p => p.energy));

    const [spawn, body] = buildBody(adjusted, eggMem, {maxRcl, maxCap, maxE});
    if (!spawn) {
      continue;
    }
    const sr = spawn.room.name
    if (done[sr]) continue
    //debug.log(egg, spawn, JSON.stringify(_.countBy(body)))
    //debug.log("spawning", egg, spawn.room.strat.spawnEnergy(spawn.room));
    const err = spawn.spawnCreep(body, eggName, { energyStructures: spawn.room.strat.spawnEnergy(spawn.room) });
    if (err !== OK) {
      spawn.room.log(spawn, 'FAILED to spawn', eggName, err, JSON.stringify(eggMem))
      if (Game.time - eggMem.laid > 500) {
        spawn.room.log("Egg Too Old!", eggName, JSON.stringify(eggMem));
        delete Memory.creeps[eggName];
      }
    } else {
      done[sr] = true
      done[tr] = true
      delete Memory.creeps[eggName].egg
      Memory.creeps[eggName].home = sr
      Memory.creeps[eggName].start = Game.time
    }
  }
}

export function closeSpawns(potentials: potentialSpawn[], tname: string): potentialSpawn[] {
  const mdist = _(potentials)
    .map(p => routes.dist(tname, p.spawn.pos.roomName))
    .min()
  return _.filter(potentials, p =>
    routes.dist(tname, p.spawn.pos.roomName) <= mdist + 1)
}

export function remoteSpawns(potentials: potentialSpawn[], tname: string): potentialSpawn[] {
  const mdist = _(potentials)
    .map(p => routes.dist(tname, p.spawn.pos.roomName))
    .filter(d => d > 0)
    .min()
  return _.filter(potentials, p => {
    const d = routes.dist(tname, p.spawn.room.name)
    return d > 0 && d <= mdist
  })
}

export function maxSpawns(potentials: potentialSpawn[], tname: string): potentialSpawn[] {
  const close = _.filter(potentials, s => routes.dist(tname, s.spawn.pos.roomName) <= 10);
  const mlvl = _.max(close.map(s => s.spawn.room!.controller!.level));
  const lvl = _.filter(close, s => s.spawn.room!.controller!.level >= mlvl);
  const mpot = _.min(lvl, s => routes.dist(tname, s.spawn.pos.roomName));
  const mdist = routes.dist(tname, mpot.spawn.pos.roomName) + 1;
  return _.filter(lvl, s => routes.dist(tname, s.spawn.pos.roomName) <= mdist);
}

export function findSpawns(potentials: potentialSpawn[], eggMem: CreepEggMem): [number, number, potentialSpawn[]] {
  const tname = Game.flags[eggMem.team].pos.roomName;

  let selected = [] as potentialSpawn[]
  switch (eggMem.spawn) {
    case 'local':
      let dist = 11
      for (const potential of potentials) {
        const room = potential.spawn.pos.roomName
        const d = routes.dist(tname, room)
        if (d < dist) {
          dist = d
          selected = [potential]
        } else if (d === dist) {
          selected.push(potential)
        }
      }
      break
    case 'close':
      selected = closeSpawns(potentials, tname)
      break
    case 'max':
      selected = maxSpawns(potentials, tname)
      break
    case 'remote':
      selected = remoteSpawns(potentials, tname)
      break
    default:
      selected = _.filter(potentials, p => p.spawn.room.name === eggMem.spawn);
      if (!selected.length) {
        debug.log('Missing spawn algo', eggMem.spawn)
      }
      break
  }
  const maxRCL = Math.max(...selected.map(p => p.spawn.room!.controller!.level));
  const maxCap = Math.max(...selected.map(p => p.spawn.room!.energyCapacityAvailable));

  return [maxRCL, maxCap, _.filter(selected, p => !p.spawn.spawning)];
}

export class Spawner {
  static participateAll(room: Room) {
    if (gTick !== Game.time) {
      gTick = Game.time;
      gPotentials = [];
    }
    for (const spawn of room.findStructs(STRUCTURE_SPAWN)) {
      gPotentials.push({ spawn, energy: room.energyAvailable });
    }
  }

  static registerAs(role: string) {
    return (klass: Spawner) => this.register(role, klass);
  }
  static register(role: string, spawner: Spawner) {
    gSpawners.set(role, spawner);
  }
  static getSpawner(role: string) {
    const s = gSpawners.get(role);
    if (s) return s;
    return this;
  }

  constructor(public readonly creepName: string) {
  }

  get team() {
    return Game.flags[Memory.creeps[this.creepName].team]
  }

  get teamRoom() {
    return this.team.room
  }

}