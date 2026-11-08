import { getMyCreep, MyCreep } from "mycreep";
import * as debug from "debug";
import {daemon, Priority, Process} from "process";
import { noteSpawned } from "spawnload";
import { liveSpawns } from "spawnold";

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

// An egg that cares which tile it hatches onto (Wicktwo.spawnDirections:
// toward the lab holding its MOVE boost) says so; undefined means any.
interface Directed {
  spawnDirections?(spawn: StructureSpawn): DirectionConstant[] | undefined
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

// The fixed end of a combat carrier of at least `pairs` pairs, the first
// that fits: the last CARRY parts left ride with five MOVE each, full speed
// loaded on swamp (two MOVE per CARRY is already full speed on plains and
// roads). 13 pairs (1300 energy): 5 MOVE; 18 pairs (1800) and up: 5 MOVE,
// CARRY, 5 MOVE.
const kCombatCarrierTails: { pairs: number, tail: BodyPartConstant[] }[] = [
  { pairs: 18, tail: [MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE] },
  { pairs: 13, tail: [MOVE, MOVE, MOVE, MOVE, MOVE] },
];

// The combat carrier: n CARRY and n MOVE, ordered for a creep that gets shot
// on the way. Damage eats a body from the front, and each part ahead of the
// tail (kCombatCarrierTails) is laid so that the one lost is a MOVE when the
// whole creep keeps two MOVE per CARRY without it, else a CARRY: CARRY goes
// first until two MOVE stand per CARRY, then the rest holds that ratio or
// better to the last part, so a beaten carrier speeds up instead of
// crawling home. The tail's MOVE count toward the ratio, so the parts just
// ahead of it run out of MOVE and end in CARRY. Whole, it is one MOVE per
// CARRY (full speed loaded on plains). 550 energy: CCCMCMMCMM; 1300:
// CCCCCCCMCMMCMMCMMCMCCMMMMM. As many pairs as `energy` buys, at least one
// and at most `maxPairs` (25 pairs is the 50-part cap).
export function combatCarrier(energy: number, maxPairs = MAX_CREEP_SIZE / 2): BodyPartConstant[] {
  const pairCost = BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
  const n = Math.max(1, Math.min(maxPairs, Math.floor(energy / pairCost)));
  const tail = _.find(kCombatCarrierTails, t => n >= t.pairs)?.tail ?? [];
  const tailCarry = tail.filter(part => part === CARRY).length;
  const tailMove = tail.length - tailCarry;
  // The parts ahead of the tail still to lay, front first.
  let carry = n - tailCarry;
  let move = n - tailMove;
  const body: BodyPartConstant[] = [];
  while (carry + move > 0) {
    const c = carry + tailCarry;
    const m = move + tailMove;
    if (move > 0 && (m - 1 >= 2 * c || carry === 0)) {
      body.push(MOVE);
      move--;
    } else {
      body.push(CARRY);
      carry--;
    }
  }
  return body.concat(tail);
}


export function runSpawns() {
  const all = _.keys(Memory.creeps);
  const eggNames = _.shuffle(all.filter(
    cname => Memory.creeps[cname].nest === 'egg'));

  const eggs = eggNames.map(getMyCreep);
  eggs.sort(eggOrder);


  const usedEnergy = new Map<string, number>();
  // Only spawns in rooms we own: an unclaimed room's spawn lingers in
  // Game.spawns but cannot spawn (spawnold.liveSpawns).
  const spawns = _.shuffle(liveSpawns(_.values<StructureSpawn>(Game.spawns)));

  const start = Game.time;
  // Spawns given an egg this tick. spawn.spawning is a tick-start snapshot,
  // and a second spawnCreep on the same spawn in one tick replaces the first
  // intent while the API returns OK for both: the first egg never hatched
  // ("Stuck egg" pairs laid the same tick; trucker10 lost that race for 162
  // ticks behind W26S8's smaller eggs, 27 Oct 2026). It waits a tick instead.
  const taken = new Set<string>();
  for (let mycreep of eggs) {
    let [spawn, body] = mycreep.spawn(spawns);

    const parts = _.map(_.countBy(body), (n, part) => `${part}:${n}`).join(" ");
    debug.log(`spawn:${spawn}, body:${parts}, type:${(mycreep as any).__proto__.constructor.name}`);

    if (!spawn) continue;

    const cost = bodyCost(body);
    const used = usedEnergy.get(spawn.room.name) || 0;
    usedEnergy.set(spawn.room.name, used + cost);

    if (spawn.spawning || taken.has(spawn.id)) continue;

    const energyAvailable = spawn.room.energyAvailable - used;
    if (cost <= energyAvailable) {
      const opts: SpawnOptions = { energyStructures: spawn.room.strat.spawnEnergy() };
      const dirs = (mycreep as Directed).spawnDirections?.(spawn);
      if (dirs) opts.directions = dirs;
      const err = spawn.spawnCreep(body, mycreep.name, opts);
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
        taken.add(spawn.id);
        mycreep.memory.nest = spawn.name;
        mycreep.memory.home = spawn.room.name;

      }
    } else {
      //spawn.room.log(`Not enough to spawn Egg[${eggName}]: ${cost} > ${energyAvailable}`);
    }
  }
  debug.log(`Ran ${eggNames} in `, Game.time - start);
}
