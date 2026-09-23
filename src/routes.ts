import * as lib from 'lib';
import * as debug from 'debug';
import { RoomIntel } from 'intel';

export function isHostile(roomOrName: string | Room) {
  const name = lib.getRoomName(roomOrName)
  const intel = RoomIntel.get(name);
  if (!intel) return false;
  // if rcl is null, comparison will be false which is correct.
  return (intel.owner !== 'deft-code' && intel.rcl! > 2) || intel.coreLvl > 0;
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

export function dist(from: string, dest: string): number {
  if (from === dest) return 0
  let key = `${from}_${dest}`;
  if (dest < from) {
    key = `${dest}_${from}`;
  }
  if (dists.has(key)) {
    return dists.get(key)!;
  }
  // Sept 2026: shard2 had Memory.dists === "undefined" (the string), which
  // made `key in cache` throw and took the SpawnDaemon down every tick.
  if (typeof Memory.dists !== 'object' || Memory.dists === null) Memory.dists = {};
  const cache = Memory.dists;
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