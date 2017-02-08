const keys = (obj) => {
  const poskey = `at_${obj.pos.x}_${obj.pos.y}`;
  if(this instanceof Structure) {
    return [this.structureType, poskey];
  }

  const subklass = _.find([Source, Mineral], k => this instanceof k);
  if(subklass) {
    return [subklass.name, poskey];
  }

  return ['object', obj.id];
};

exports.addRoomMemory = (klass, opts) => {
  opts = _.defaults(opts, {
    submem: 'submem',
  });

  Object.defineProperty(klass.prototype, 'memory', {
    get: function() {
      // A work around for screeps-profiler prototype mangling.
      if (this === klass.prototype || this === undefined) return;

      const submem = this.room.memory[opts.submem];
      if (!submem) {
        return undefined;
      }

      const [key, subkey] = keys(this);

      const keymem = submem[key];
      if(!keymem) {
        return undefined;
      }

      return keymem[subkey];
    },

    set: function(value) {
      // A work around for screeps-profiler prototype mangling.
      if (this === klass.prototype || this == undefined) return;

      if (!_.isObject(value)) {
        throw new Error('Memory can only be set to an object');
      }

      const del = _.isEmpty(value);

      const [key, subkey] = keys(this);

      let submem = this.room.memory[opts.submem];
      if (!submem) {
        if(del)  return undefined;
        submem = this.room.memory[opts.submem] = {}
      }

      let keymem = submem[key];
      if(!keymem) {
        if(del) return undefined;
        keymem = submem[key] = {};
      }

      if(del) {
        delete keymem[subkey];
        return undefined;
      }

      if(key === 'object') {
        keymem.gc = nextGC(keymem.gc, this);
      }

      return keymem[subkey] = value;
    },
  });
};

nextGC = (prevgc, obj) => {
  let next;
  if(this instanceof Resource) {
    delta = this.amount;
  } else if(this instanceof Nuke) {
    delta = this.timeToLand;
  } else if(this instanceof ConstructionSite) {
    delta = this.progressTotal - this.progress;
  }

  if(prevgc && prevgc < Game.time) {
    return Math.min(prevgc, next);
  }
  return next;
};

exports.gcRoomMemory = (room, opts={}) => {
  opts = _.defaults(opts, {
    submem: 'submem',
  });

  let collected = 0;

  const objmem = room.memory[opts.submem].object;
  if(objmem && objmem.gc < Game.time) {
    let gc;
    let found = false;
    let gcd = false;
    for(let id in objmem) {
      const obj = Game.getObjectById(id);
      if(!obj) {
        gcd = true;
        collected++;
        delete objmem[id];
      } else {
        found = true;
        gc = nextGC(gc, obj);
      }
    }
    if(!found) {
      delete room.memory[opts.submem].object;
    } else {
      let extra = objmem.extra || 0;
      if(gcd) {
        extra = Math.floor(extra/2); 
      } else {
        extra++;
      }
      objmem.extra = extra;
      objmem.gc = gc + extra;
    }
  } 

  const structsByType = _.groupBy(room.find(FIND_STRUCTURES), "structureType");
  const structTypes = [STRUCTURE_LINK];
  for(let stype of structTypes) {
    const structs = structsByType[sType];
    if(!structs) {
      delete room.memory[opts.submem][stype];
      continue;
    }
    const smem = this.memory.submem[stype];
    if(!smem) continue;

    const prevn = smem.n
    if(prevn > structs.length) {
      const nextmem = {};
      for(let struct in structs) {
        const mem = struct.memory;
        const [key, subkey] = keys(struct);
        if(!mem || _.isEmpty(mem)) {
          collected += smem[subkey]? 1: 0;
          continue;
        }
        nextmem[subkey] = smem;
      }
      if(_.isEmpty(nextmem)){
        delete room.memory[opts.submem][stype];
      } else {
        room.memory[opts.submem][struct] = nextmem;
      }
    }
  }

  return collected;
};

