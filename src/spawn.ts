import { getMyCreep } from "mycreep";
import * as debug from "debug";
import {daemon, Priority, Process} from "process";

declare global {
  interface CreepMemory {
    hibernate?: number
    nest: string
  }
}

@daemon
class SpawnDaemon extends Process {
  bucket = 2000;
  run(): Priority {
    runSpawns();
    return "late";
  }
}

function eggOrder(lname: string, rname: string): number {
  const lpriority = Memory.creeps[lname].egg || 0;
  const rpriority = Memory.creeps[rname].egg || 0;
  const lage = Game.time - Memory.creeps[lname].laid;
  const rage = Game.time - Memory.creeps[rname].laid;
  return lpriority - rpriority || rage - lage;
}

function bodyCost(body: BodyPartConstant[]): number {
  return _.sum(body, part => BODYPART_COST[part])
}

type DefPart = BodyPartConstant | 'premove';


const partsOrdered = [TOUGH, WORK, CARRY, 'premove', ATTACK, RANGED_ATTACK, MOVE, CLAIM, HEAL]
const partPriority = (part: DefPart) => _.indexOf(partsOrdered, part)
const orderParts = (l: DefPart, r: DefPart) => partPriority(l) - partPriority(r)

// const sortFromOrder = (items, order) => items.sort((l, r) => _.indexOf(order, l) - _.indexOf(order, r))

interface BodyDef {
  move: number,
  base?: BodyPartConstant[]
  per: BodyPartConstant[]
}

interface LevelBodyDef extends BodyDef {
  level: number
}


interface EnergyBodyDef extends BodyDef {
  max?: number
  energy: number
};

function defCost(def: LevelBodyDef) {
  let cost = 0;
  let max = 50;
  if (def.base) {
    max -= def.base.length;
    cost += _.sum(def.base, part => BODYPART_COST[part]);
  }
  cost += def.level * _.sum(def.per, part => BODYPART_COST[part]);
  const nparts = def.level * def.per.length;

  // short circuit 0 move definitions.
  const nmove = def.move && Math.ceil(nparts / def.move);
  if (nparts + nmove > max) {
    return Infinity;
  }
  return cost + BODYPART_COST[MOVE] * nmove;
}

function defBody(def: LevelBodyDef): BodyPartConstant[] {
  let parts: DefPart[] = [];
  for (let i = 0; i < def.level; i++) {
    parts = parts.concat(def.per);
  }
  const move = def.move && Math.ceil(parts.length / def.move);
  for (let i = 0; i < move; i++) {
    if (i < move / 2) {
      parts.push('premove');
    } else {
      parts.push(MOVE);
    }
  }

  if (def.base) {
    parts = parts.concat(def.base);
  }

  parts.sort(orderParts)
  parts = _.map(parts, part => {
    if (part === 'premove') return MOVE;
    return part;
  })
  return parts as BodyPartConstant[];
}

export function energyDef(def: EnergyBodyDef): BodyPartConstant[] {
  const ldef = def as unknown as LevelBodyDef;
  ldef.level = 2;
  let cost = defCost(ldef);
  const max = def.max || 50;
  while (cost <= def.energy && ldef.level <= max) {
    ldef.level++;
    cost = defCost(ldef);
  }
  ldef.level--;
  return defBody(ldef);
}


export function runSpawns() {
  const all = _.keys(Memory.creeps);
  const eggNames = _.shuffle(all.filter(
    cname => Memory.creeps[cname].nest === 'egg'));

  eggNames.sort(eggOrder);

  const usedEnergy = new Map<string, number>();
  const spawns = _.shuffle(Game.spawns);

  const start = Game.time;
  for (let eggName of eggNames) {
    const mycreep = getMyCreep(eggName);
    debug.log("trying to spawn", eggName, mycreep);
    if ((mycreep.memory.hibernate || 0) > Game.time) continue;

    let [spawn, body] = mycreep.spawn(spawns);

    debug.log(`spawn:${spawn}, body:${body}, type:${(mycreep as any).__proto__.constructor.name}`);

    if (!spawn) continue;

    const cost = bodyCost(body);
    const used = usedEnergy.get(spawn.room.name) || 0;
    usedEnergy.set(spawn.room.name, used + cost);

    if (spawn.spawning) continue;

    const energyAvailable = spawn.room.energyAvailable - used;
    if (cost <= energyAvailable) {
      const err = spawn.spawnCreep(body, eggName, { energyStructures: spawn.room.strat.spawnEnergy() });
      if (err !== OK) {
        spawn.room.log(spawn, 'FAILED to spawn', eggName, err, JSON.stringify(Memory.creeps[eggName]))
        if (Game.creeps[eggName]) {
          Game.creeps[eggName].log(`Egg[${eggName}] collides with existing creep!`);
          delete Memory.creeps[eggName].egg;
        } else if (Game.time - mycreep.memory.laid > 3000) {
          spawn.room.log(`Egg[${eggName}] Too Old!`);
          //TODO mycreep.abort();
          //delete Memory.creeps[eggName];
        }
      } else {
        mycreep.memory.nest = spawn.name;
        mycreep.memory.home = spawn.room.name;

      }
    } else {
      //spawn.room.log(`Not enough to spawn Egg[${eggName}]: ${cost} > ${energyAvailable}`);
    }
  }
  debug.log(`Ran ${eggNames.length} in `, Game.time - start);
}
