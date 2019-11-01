global.lup = x => Game.getObjectById(x)

global.busyCreeps = (n) => {
  const x = _.sortBy(Game.creeps, c => c.memory.cpu / (Game.time - c.memory.birth)).reverse()
  for (let i = 0; i < n; i++) {
    const c = x[i]
    console.log(c, c.memory.role, c.memory.team, c.memory.cpu, Game.time - c.memory.birth)
  }
}

global.purgeWalls = (room, dry = true) => {
  let n = 0
  const delta = 5
  for (const wall of room.findStructs(STRUCTURE_WALL)) {
    const p = wall.pos
    if (p.x < delta) continue
    if (p.y < delta) continue
    if (p.x > 49 - delta) continue
    if (p.y > 49 - delta) continue

    n++
    if (dry) {
      room.visual.circle(p, { radius: 0.5, fill: 'red' })
    } else {
      wall.destroy()
    }
  }
  return n
}

global.worldWipe = (keep) => {
  const flags = _.keys(Game.flags)
  for (const fname of flags) {
    const f = Game.flags[fname]
    if (f.pos.roomName !== keep) {
      if (f.room) {
        global.wipe(f.room)
      } else {
        f.remove()
      }
    }
  }
}

global.wipe = (room) => {
  const creeps = room.find(FIND_MY_CREEPS)
  for (const c of creeps) {
    c.suicide()
  }

  const flags = room.find(FIND_FLAGS)
  for (const f of flags) {
    f.remove()
  }

  const structs = room.find(FIND_STRUCTURES)
  for (const s of structs) {
    if(s.structureType === STRUCTURE_EXTRACTOR) continue;
    s.destroy();
  }

  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  for (const s of sites) {
    s.remove();
  }
}

global.scalp = function (shard = 'none', ptr = true) {
  _.map(Game.rooms, r => {
    if (r.name.endsWith('N21') || r.name.endsWith('N22') || r.name.endsWith('N23') || r.name.endsWith('N24')) {
      if (Game.shard.name === shard && Game.shard.ptr === ptr) {
        wipe(r);
      } else {
        console.log("killing", r.name);
      }
    }
  });
}
