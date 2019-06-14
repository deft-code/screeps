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
    case Mode.src:
    case Mode.hub:
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
  const links = room.findStructs(STRUCTURE_LINK) as Link[];

  const cache: Cache = {
    nlinks: links.length,
    modes: new Map<number, Mode>(),
    lock: Game.time
  };

  for (const src of room.find(FIND_SOURCES)) {
    const l = _.find(links, l => src.pos.inRangeTo(l, 2));
    if (!l) continue;
    cache.modes.set(l.pos.xy, Mode.src);
    _.remove(links, other => other.id === l.id);
  }

  const s = room.storage;
  if (s) {
    const l = _.find(links, l => s.pos.inRangeTo(l, 2))
    if (l) {
      cache.modes.set(l.pos.xy, Mode.hub);
      cache.store = l.id;
      _.remove(links, other => other.id === l.id);
    }
  }

  const t = room.terminal;
  if (t) {
    const l = _.find(links, l => t.pos.inRangeTo(l, 2))
    if (l) {
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
    const e = Math.floor(target.energyFree / 2)
    return this.xferRaw(target, e)
  }

  xfer(target: Link, mod = 33) {
    // sad trombone
    // let e = Math.min(this.energy, Math.ceil(target.energyFree * (1 + LINK_LOSS_RATIO)));
    let e = Math.min(this.energy, target.energyFree)
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
  return _.max(_.map(room.findStructs(STRUCTURE_TERMINAL) as Link[],
    l => {
      if (l.mode !== Mode.sink) return 0;
      return l.energyFree;
    }));
}

export function balanceSplit(room: Room) {
  const links = room.findStructs(STRUCTURE_LINK) as Link[];
  if (links.length < 2) return

  let cache = getCache(room);
  const store = Game.getObjectById<Link>(cache.store)
  const term = Game.getObjectById<Link>(cache.term)

  if (!term) return
  if (!store) return
  if (cache.lock > Game.time) return
  cache.lock = Game.time + 100;

  term.mode = Mode.hub;
  store.mode = Mode.hub;

  room.dlog('term', term.mode)
  room.dlog('store', store.mode)

  if (!room.terminal || !room.storage) return
  const te = room.terminal.store.energy
  const se = room.storage.store.energy

  if ((te > 20000 && se < 150000) || (te > 50000 && se < 950000)) {
    store.mode = Mode.sink;
    return
  }

  if (te < 40000 && se > 200000) {
    term.mode = Mode.sink;
  }
}

export function runLinks(room: Room) {
  const links = _.shuffle(room.findStructs(STRUCTURE_LINK) as Link[]);

  links.forEach(link => {
    room.visual.text(link.mode, link.pos.x, link.pos.y + 0.23)
  });

  const hubs = _.filter(links, link => link.mode === Mode.hub);
  const sinks = _.filter(links, link => link.mode === Mode.sink && link.energyFree > 0);
  // order matters prefer sinks over hubs
  const both = sinks.concat(hubs.filter(hub => hub.energyFree > 0))
  for (const link of links) {
    if (link.cooldown) continue;
    if (link.mode === Mode.sink) continue;
    if (link.mode === Mode.pause) continue;
    if (!link.energy) continue;

    if (link.mode === Mode.dump) {
      const sink = both.find(sink => sink.energyFree >= link.energy) ||
        _.max(both, sink => sink.energyFree);
      if (!sink) continue;
      // Wasteful send but dumps need to be empty more than efficient
      return link.xferAll(sink);
    }

    // Normal hub an src operation
    if ((link.mode === Mode.hub || link.mode === Mode.src) && link.energy >= 33) {
      const sink = both.find(sink => sink.mode !== link.mode && sink.energyFree >= 33);
      if (sink) {
        return link.xfer(sink);
      }
    }

    // all the way full!
    if (link.mode === Mode.src && !link.energyFree) {
      // ignore waste just send it
      const sink = _.max(both.filter(l => l.energyFree > 2), sink => sink.energyFree);
      if (sink) {
        return link.xferAll(sink);
      }

      // just send it anywhere
      const slop = _.max(links.filter(l => l.energyFree >= 4), l => l.energyFree);
      if (!slop) continue;
      return link.xferHalf(slop);
    }
  }
  return false;
}


Room.prototype.runLinks = function () {
  runLinks(this);
  balanceSplit(this);
}