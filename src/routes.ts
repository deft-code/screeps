import * as lib from 'lib';
import * as debug from 'debug';

export function isHostile(roomOrName: string | Room) {
  const name = lib.getRoomName(roomOrName)
  switch (name) {
    case 'W22N15':
    case 'W23N15':
    case 'W23N16':
    case 'W25N13':
    case 'W27N14':
    case 'W27N16':
      return true
  }
  return false
}

const dists = new Map<string, number>();

declare global {
  interface Memory {
    dists?: {
      [key: string]: number
    }
  }
}

let totalCPU = 0;

export function dist(from: string, dest: string) {
  if (from === dest) return 0
  let key = `${from}_${dest}`;
  if (dest < from) {
    key = `${dest}_${from}`;
  }
  if (dists.has(key)) {
    return dists.get(key);
  }
  const cache = Memory.dists = Memory.dists || {};
  if (key in cache) {
    return cache[key];
  }
  const before = Game.cpu.getUsed();
  const ret = Game.map.findRoute(from, dest);
  let n = 30;
  if (ret !== ERR_NO_PATH) n = ret.length;
  dists.set(key, n);
  if (n > 4) {
    cache[key] = n;
  }

  const d = Game.cpu.getUsed() - before;
  totalCPU += d;

  debug.dlog(`${from} => ${dest}: ${n}`, "cpu", d.toFixed(3), 'totalCPU', totalCPU.toFixed(1));
  return n;
}


export function upkeep() {
}