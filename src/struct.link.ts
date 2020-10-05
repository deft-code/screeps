import * as lib from 'lib';
import * as debug from 'debug';
import { extender } from 'roomobj';

declare global {
  interface RoomMemory {
    links?: {
      [id: string]: {
        mode: string
      }
    }
  }
  interface StructureLink {
    mode: Mode
  }
}

export function nullmax<T>(a: T[], f: (i: T) => number): T | null {
  const ret = _.max(a, f);
  if(ret as unknown === -Infinity) return null;
  return ret;
}

//type Mode = "src" | "sink" | "hub" | "pause";

export const enum Mode {
  dump = "^",
  src = "+",
  sink = "-",
  hub = "=",
  pause = "x",
}

function toMode(val: string): Mode {
  switch (val) {
    // TODO clean up old entries and remove these
    case "src": return Mode.src;
    case "sink": return Mode.sink;

    case Mode.dump:
    case Mode.hub:
    case Mode.sink:
    case Mode.src:
      return val;
  }
  return Mode.pause;
}

interface Cache {
  nlinks: number
  modes: Map<number, Mode>
  lock: number
  store?: string
  term?: string
}

const allcaches = new Map<string, Cache>();

function getMode(l: Link) {
  const cache = getCache(l.room);
  const mode = cache.modes.get(l.pos.xy);
  if (mode) return mode
  const newcache = makeCache(l.room);
  return newcache.modes.get(l.pos.xy) || Mode.pause;
}

function getCache(room: Room) {
  const cache = allcaches.get(room.name);
  if (cache) return cache;
  return makeCache(room);
}

function makeCache(room: Room) {
  room.dlog("setting links");

  const allLinks = room.findStructs(STRUCTURE_LINK);
  const cache: Cache = {
    nlinks: allLinks.length,
    modes: new Map<number, Mode>(),
    lock: Game.time
  };

  const links = [];
  for(const link of allLinks){
    const mode = room.meta.getLinkMode(link.pos.xy);
    if(mode !== Mode.pause) {
      cache.modes.set(link.pos.xy, mode);
    } else {
      links.push(link);
    }
  }

  for (const src of room.find(FIND_SOURCES)) {
    const l = _.find(links, l => src.pos.inRangeTo(l, 2));
    if (!l) continue;
    cache.modes.set(l.pos.xy, Mode.src);
    _.remove(links, other => other.id === l.id);
  }

  const s = room.storage;
  if (s) {
    const l = _.find(links, l => s.pos.inRangeTo(l, 2));
    if (l) {
      cache.modes.set(l.pos.xy, Mode.hub);
      cache.store = l.id;
      _.remove(links, other => other.id === l.id);
    }
  }

  const t = room.terminal;
  if (t) {
    const l = _.find(links, l => t.pos.inRangeTo(l, 2));
    if (l) {
      debug.log("setting hub for", l);
      cache.modes.set(l.pos.xy, Mode.hub);
      cache.term = l.id;
      _.remove(links, other => other.id === l.id);
    }
  }

  const ct = room.controller;
  if (ct) {
    const l = _.find(links, l => ct.pos.inRangeTo(l, 4))
    if (l) {
      cache.modes.set(l.pos.xy, Mode.sink);
      _.remove(links, other => other.id === l.id);
    }
  }

  for (const l of links) {
    if (l.pos.x < 4 || l.pos.x > 45 || l.pos.y < 4 || l.pos.y > 45) {
      cache.modes.set(l.pos.xy, Mode.dump);
    } else {
      cache.modes.set(l.pos.xy, Mode.sink);
    }
  }
  allcaches.set(room.name, cache);
  return cache
}

export function isLink(s: Structure | null | undefined): s is Link {
  return !!s && s.structureType === STRUCTURE_LINK;
}

@extender
export class Link extends StructureLink {
  set mode(val: Mode) {
    if (!this.my) return;
    if (!this.room.memory.links) {
      this.room.memory.links = {};
    }
    let mem = this.room.memory.links[this.pos.xy];
    if (!_.isObject(mem)) {
      this.room.memory.links[this.pos.xy] = { mode: val };
      return
    }
    mem.mode = val;
  }

  get mode() {
    if (!this.my) return Mode.pause;
    const linksmem = this.room.memory.links;
    if (linksmem) {
      const linkmem = linksmem[this.pos.xy];
      if (_.isObject(linkmem)) {
        const mode = linkmem.mode;
        if (mode) return toMode(mode);
      }
    }
    return getMode(this);
  }

  xferHalf(target: Link) {
    const e = Math.floor(target.store.getFreeCapacity(RESOURCE_ENERGY) / 2)
    return this.xferRaw(target, e)
  }

  xfer(target: Link, mod = 33) {
    // sad trombone
    let best = Math.min(this.store.energy, Math.ceil(target.store.getFreeCapacity(RESOURCE_ENERGY) * (1 + LINK_LOSS_RATIO)));

    let e = Math.min(this.store.energy, target.store.getFreeCapacity(RESOURCE_ENERGY))
    e -= (e % 100) % mod
    return this.xferRaw(target, e)
  }

  xferAll(target: Link) {
    return this.xfer(target, 1)
  }

  xferRaw(target: Link, energy: number) {
    const err = this.transferEnergy(target, energy)
    return err === OK
  }
}

export function hubNeed(room: Room): number {
  return _.max(_.map(room.findStructs(STRUCTURE_LINK) as Link[],
    l => {
      if (l.mode !== Mode.sink) return 0;
      return l.store.getFreeCapacity(RESOURCE_ENERGY);
    }));
}

type HubStore = StructureStorage | StructureTerminal;
function ratio(s: HubStore) {
  if (s.storeCapacity === 0) return 10;
  if (s.structureType === STRUCTURE_TERMINAL) {
    return s.store.energy * 3 / s.storeCapacity;
  }
  return s.store.energy / s.storeCapacity;
}

// Returns battery, sink, active balance 
export function storageBalance(s: StructureStorage | null, t: StructureTerminal | null): [HubStore | null, HubStore | null, boolean] {
  if (!t) return [s, s, false];
  if (!s) return [t, t, false];

  const srat = ratio(s);
  const trat = ratio(t);
  if (srat < trat) return [t, s, trat - srat > 0.1 && t.store.energy > 5000];
  return [s, t, srat - trat > 0.1 && s.store.energy > 150000];
}

export function balanceSplit(room: Room) {
  const links = room.findStructs(STRUCTURE_LINK) as Link[];
  if (links.length < 2) return;

  let cache = getCache(room);
  const store = Game.getObjectById(cache.store as Id<Link>);
  const term = Game.getObjectById(cache.term as Id<Link>);

  if (!term) return;
  if (!store) return;
  if (cache.lock > Game.time && !room.debug) return;
  cache.lock = Game.time + 10 + _.random(10);

  term.mode = Mode.hub;
  store.mode = Mode.hub;

  room.dlog('term', term.mode, 'store', store.mode);

  if (!room.terminal || !room.storage) return;

  const [batt, sink, activeBalance] = storageBalance(room.storage, room.terminal);
  room.dlog("batt", batt, "sink", sink, "active", activeBalance);
  if (activeBalance) {
    if (sink!.structureType === STRUCTURE_STORAGE) {
      store.mode = Mode.sink;
      term.mode = Mode.src;
    }
    if (sink!.structureType === STRUCTURE_TERMINAL) {
      term.mode = Mode.sink;
      store.mode = Mode.src;
    }
  }
}

function fibSeq(n: number) {
  if (n <= 1) return 1;
  if (n <= 3) return 2;
  if (n <= 6) return 3;
  if (n <= 10) return 4;
  if (n <= 15) return 5;
  if (n <= 21) return 6;
  if (n <= 28) return 7;
  return 8;
}

function drawCooldown(p: RoomPosition, cd: number) {
  if (cd < 2) return

  const segs = fibSeq(cd - 1);

  const v = new RoomVisual(p.roomName);
  const x = p.x;
  const y = p.y;
  const d = 0.5;
  const dd = 0.33;


  const points: [number, number][] = [[x, y + d], [x - dd, y + dd]];
  while (segs > 1) {
    points.push([x - d, y]);

    if (segs < 3) break;
    points.push([x - dd, y - dd]);

    if (segs < 4) break;
    points.push([x, y - d]);

    if (segs < 5) break;
    points.push([x + dd, y - dd]);

    if (segs < 6) break;
    points.push([x + d, y]);

    if (segs < 7) break;
    points.push([x + dd, y + dd]);

    if (segs < 8) break;
    points.push([x, y + d]);

    break;
  }

  v.poly(points);
}

export function runLinks(room: Room) {
  const links = _.shuffle(room.findStructs(STRUCTURE_LINK) as Link[]);
  // room.log("here", links.length, links.map(l => l.store));

  links.forEach(link => {
    room.visual.text(link.mode, link.pos.x, link.pos.y + 0.23, {color: "black"})
    drawCooldown(link.pos, link.cooldown);
  });

  const hubs = _.filter(links, link => link.mode === Mode.hub);
  const sinks = _.filter(links, link => link.mode === Mode.sink && link.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
  // order matters prefer sinks over hubs
  const both = sinks.concat(hubs.filter(hub => hub.store.getFreeCapacity(RESOURCE_ENERGY) > 0))
  for (const link of links) {
    if (link.cooldown) continue;
    if (link.mode === Mode.sink) continue;
    if (link.mode === Mode.pause) continue;
    if (!link.store.energy) continue;

    if (link.mode === Mode.dump) {
      const sink = both.find(sink => sink.store.getFreeCapacity(RESOURCE_ENERGY) >= link.store.energy) ||
        nullmax(both, sink => sink.store.getFreeCapacity(RESOURCE_ENERGY));
      if (!sink) continue;
      // A wasteful send but dump liks need to be empty more than efficient.
      return link.xferAll(sink);
    }

    // Normal hub and src operation
    if ((link.mode === Mode.hub || link.mode === Mode.src) && link.store.energy >= 33) {
      const sink = both.find(sink => sink.mode !== link.mode && sink.store.getFreeCapacity(RESOURCE_ENERGY) >= 33);
      if (sink) {
        return link.xfer(sink);
      }
    }

    // all the way full!
    if (link.mode === Mode.src && !link.store.getFreeCapacity(RESOURCE_ENERGY)) {
      // ignore waste just send it
      const sink = nullmax(both.filter(l => l.store.getFreeCapacity(RESOURCE_ENERGY) > 2), sink => sink.store.getFreeCapacity(RESOURCE_ENERGY));
      if (sink) {
        return link.xferAll(sink);
      }

      // just send it anywhere
      const slop = nullmax(links.filter(l => l.store.getFreeCapacity(RESOURCE_ENERGY) >= 4), l => l.store.getFreeCapacity(RESOURCE_ENERGY));
      if (!slop) continue;
      return link.xferHalf(slop);
    }
  }
  return false;
}