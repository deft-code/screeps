import { getMyCreep, MyCreep } from "mycreep";
import * as debug from "debug";
import {daemon, Priority, Process} from "process";
import { noteSpawned } from "spawnload";

declare global {
  interface CreepMemory {
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

function eggOrder(l: MyCreep, r: MyCreep): number {
  const lage = Math.floor((Game.time - Memory.creeps[l.name].laid)/500);
  const rage = Math.floor((Game.time - Memory.creeps[r.name].laid)/500);
  return r.priority - l.priority || rage - lage;
}

function eggOrderOld(lname: string, rname: string): number {
  const lpriority = Memory.creeps[lname].egg || 0;
  const rpriority = Memory.creeps[rname].egg || 0;
  const lage = Math.floor((Game.time - Memory.creeps[lname].laid)/500);
  const rage = Math.floor((Game.time - Memory.creeps[rname].laid)/500);
  return rpriority - lpriority || rage - lage;
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
  // Lay the MOVEs out between the `per` groups (CARRY, CARRY, MOVE, CARRY,
  // CARRY, MOVE, ...) instead of sorting them together: damage then strips
  // MOVEs and the parts they carry in step, so the creep stays at speed as
  // it loses weight. Non-MOVE `base` parts lead, MOVE `base` parts trail.
  interleave?: boolean
  // Sort every MOVE (base ones too) ahead of the weapons, right after TOUGH,
  // instead of only half: a fighter then keeps its speed until its weapons
  // are gone, since dead weapon parts still weigh (engine movement.js).
  movesFirst?: boolean
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

// Interleaved layout: after every `move` parts of `per` one MOVE, the last
// group's MOVE covering the remainder, so the MOVE count matches defCost.
function defBodyInterleaved(def: LevelBodyDef): BodyPartConstant[] {
  let per: BodyPartConstant[] = [];
  for (let i = 0; i < def.level; i++) {
    per = per.concat(def.per);
  }
  const body: BodyPartConstant[] = [];
  const base = def.base || [];
  body.push(...base.filter(part => part !== MOVE).sort(orderParts));
  per.forEach((part, i) => {
    body.push(part);
    if (def.move && ((i + 1) % def.move === 0 || i === per.length - 1)) body.push(MOVE);
  });
  body.push(...base.filter(part => part === MOVE));
  return body;
}

function defBody(def: LevelBodyDef): BodyPartConstant[] {
  if (def.interleave) return defBodyInterleaved(def);
  let parts: DefPart[] = [];
  for (let i = 0; i < def.level; i++) {
    parts = parts.concat(def.per);
  }
  const move = def.move && Math.ceil(parts.length / def.move);
  for (let i = 0; i < move; i++) {
    if (def.movesFirst || i < move / 2) {
      parts.push('premove');
    } else {
      parts.push(MOVE);
    }
  }

  if (def.base) {
    parts = parts.concat(def.movesFirst ? def.base.map(part => part === MOVE ? 'premove' : part) : def.base);
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

  const eggs = eggNames.map(getMyCreep);
  eggs.sort(eggOrder);


  const usedEnergy = new Map<string, number>();
  const spawns = _.shuffle(Game.spawns);

  const start = Game.time;
  for (let mycreep of eggs) {
    let [spawn, body] = mycreep.spawn(spawns);

    const parts = _.map(_.countBy(body), (n, part) => `${part}:${n}`).join(" ");
    debug.log(`spawn:${spawn}, body:${parts}, type:${(mycreep as any).__proto__.constructor.name}`);

    if (!spawn) continue;

    const cost = bodyCost(body);
    const used = usedEnergy.get(spawn.room.name) || 0;
    usedEnergy.set(spawn.room.name, used + cost);

    if (spawn.spawning) continue;

    const energyAvailable = spawn.room.energyAvailable - used;
    if (cost <= energyAvailable) {
      const err = spawn.spawnCreep(body, mycreep.name, { energyStructures: spawn.room.strat.spawnEnergy() });
      if (err !== OK) {
        spawn.room.log(spawn, 'FAILED to spawn', mycreep, err, JSON.stringify(mycreep.memory));
        if (Game.creeps[mycreep.name]) {
          Game.creeps[mycreep.name].log(`Egg[${mycreep.name}] collides with existing creep!`);
          mycreep.memory.nest = "not egg!!!";
        } else if (Game.time - mycreep.memory.laid > 3000) {
          spawn.room.log(`${mycreep} Too Old!`);
          //TODO mycreep.abort();
          //delete Memory.creeps[eggName];
        }
      } else {
        noteSpawned(spawn);
        mycreep.memory.nest = spawn.name;
        mycreep.memory.home = spawn.room.name;

      }
    } else {
      //spawn.room.log(`Not enough to spawn Egg[${eggName}]: ${cost} > ${energyAvailable}`);
    }
  }
  debug.log(`Ran ${eggNames} in `, Game.time - start);
}
