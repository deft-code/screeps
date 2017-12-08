const util = require('util');
const lib = require('lib');
const tlib = require('Traveler');
const debug = require('debug');

class FlagTeam {
  localSpawn(energy) {
    return (spawn) => this.spawnDist(spawn) === 1 &&
        spawn.room.energyAvailable >= energy;
  }

  closeSpawn(energy) {
    return (spawn) => this.spawnDist(spawn) <= this.minSpawnDist() + 1 &&
        spawn.room.energyAvailable >= (energy || spawn.room.energyCapacityAvailable);
  }

  remoteSpawn() {
    return (spawn) => this.spawnDist(spawn) > 1 &&
        spawn.room.energyFreeAvailable === 0 &&
        //spawn.room.storage &&
        //spawn.room.storage.store.energy > 10000 &&
        spawn.room.energyCapacityAvailable > this.room.energyCapacityAvailable;
  }

  roleCreeps(role) {
    return this.creepsByRole[role] || [];
  }

  memOr(key, value) {
    const v = this.memory[key]; if (v === undefined) {
      return value;
    }
    return v;
  }

  ensureRole(n, mem, priority, filter) {
    n = this.memOr('n' + mem.role, n);
    if(!n) return false;

    const creeps = this.roleCreeps(mem.role);
    if (creeps.length < n) return this.makeRole(mem, priority, filter);

    if (creeps.length === n) {
      for(const creep of creeps) {
        if(!creep.ticksToLive) continue;
        const ctime = 3 * creep.body.length + 50;
        if(creep.ticksToLive < ctime) {
          return this.makeRole(mem, priority, filter);
        }
      }
    }
    return false;
  }

  upkeepRole(n, mem, priority, filter) {
    n = this.memOr('n' + mem.role, n);
    if(!n) return false;

    const r = this.roleCreeps(mem.role);
    if(r.length >= n) return false;

    const when = this.memory.when[mem.role];
    if(!when) return this.makeRole(mem, priority, filter);

    const delta = CREEP_LIFE_TIME / n;
    const elapsed = Game.time - when;
    if(elapsed > delta) return this.makeRole(mem, priority, filter);

    this.dlog(`Wait ${delta - elapsed}: ${JSON.stringify(mem)}`);

    return false;
  }

  makeRole(mem, priority, filter) {
    const spawn = this.findSpawn(priority, filter);
    this.dlog(`makeRole ${spawn}: ${JSON.stringify(mem)}`);
    this.makeRoleSpawn(mem, spawn);
  }

  makeRoleSpawn(mem, spawn) {
    if (!spawn) return false;

    mem.team = this.name;

    const who = spawn.maxCreep(10, mem);

    if(_.isString(who)) {
      this.memory.creeps.push(who);
      this.memory.when[mem.role] = Game.time;
    }

    debug.log(`${spawn} spawned ${who} ${JSON.stringify(mem)}`);

    return `${spawn}:${who}`;
  }

  findSpawn(priority, filter) {
    if (!this.memory.spawnDist) {
      this.memory.spawnDist = {};
    }
    return _(Game.spawns)
        .filter(spawn => this.spawnDist(spawn) <= 10)
        .sortBy(spawn => this.spawnDist(spawn))
        .filter(spawn => spawn.room.energyAvailable >= 300 && !spawn.spawning)
        .filter(spawn => !spawn.nextPriority || spawn.nextPriority < priority)
        .filter(filter)
        .first();
  }

  createRole(spawn, body, mem) {
    mem.team = this.name;
    this.dlog('spawning', spawn);
    const who = spawn.createRole(body, mem);
    if (_.isString(who)) {
      this.memory.creeps.push(who);
      return who;
    }
    return false;
  }

  minSpawnDist() {
    if (!this.memory.spawnDist) {
      this.memory.spawnDist = {}
    }
    return this.memory.spawnDist.min || 0;
  }

  spawnDist(spawn) {
    if (!spawn) return Infinity;

    
    const mem = this.memory = this.memory || {};
    let cache = mem.spawnDist;
    if (!cache || !this.pos.isEqualTo(lib.roomposFromMem(cache.pos))) {
      console.log(this, 'RESET CACHE!', JSON.stringify(cache));
      cache = mem.spawnDist = {pos: this.pos};
    }
    let dist = cache[spawn.name];
    if (dist === undefined) {
      debug.log(this, "spawnDist", spawn, JSON.stringify(cache));
      dist = cache[spawn.name] = tlib.Traveler.routeDistance(this.pos.roomName, spawn.room.name);
      if (cache.min === undefined) {
        cache.min = dist
      } else {
        cache.min = Math.min(cache.min, dist);
      }
    }
    return dist;
  }

  get creeps() {
    if(!this._creeps) {
      this._creeps = _.compact(_.map(this.memory.creeps, c => Game.creeps[c]));
    }
    return this._creeps;
  }

  get creepsByRole() {
    if(!this._creepsByRole) {
      this._creepsByRole = _.groupBy(this.creeps, c => c.memory.role);
    }
    return this._creepsByRole;
  }

  run() {
    if (this.color !== COLOR_BLUE) {
      return 'no team';
    }

    if (!this.memory) {
      this.memory = {
        debug: true,
        when: {},
      };
    }

    // TODO delete me.
    if(!this.memory.when) this.memory.when = {};
    if(!this.memory.spawnDist) {
      this.memory.spawnDist = {min: 0};
    }

    this.memory.creeps = _.map(this.creeps, 'name');

    this.dlog(
        'my creeps',
        JSON.stringify(
            _.mapValues(this.creepsByRole, creeps => _.map(creeps, 'name'))));

    if (!this.creeps.length) {
      this.memory.empty = this.memory.empty || Game.time;
      if(Game.time - this.memory.empty > 300) {
        this.memory.debug = this.memory.debug || true;
      }
    } else {
      delete this.memory.empty;
    }

    const customF = this['custom' + this.name];
    if (_.isFunction(customF)) {
      this.dlog('custom', this.name, customF.call(this));
    }
    switch (this.secondaryColor) {
      case COLOR_RED:
        return this.teamPuppy();
      case COLOR_BLUE:
        return this.teamBase();
      case COLOR_GREEN:
        return this.teamRemote();
      case COLOR_GREY:
        return this.teamRole();
      case COLOR_WHITE:
        return this.teamEnsure();
      case COLOR_CYAN:
        return this.teamOccupy();
      case COLOR_YELLOW:
        return this.teamFarm();
      case COLOR_PURPLE:
        const n = _.first(_.words(this.name)).toLowerCase();
        const fname = _.camelCase(`team ${n}`);
        const f = this[fname];
        if(!_.isFunction(f)) {
          console.log(`BAD TEAM: ${this}`);
          break;
        }
        return f.apply(this);
      case COLOR_BROWN:
        if (!this.creeps.length) {
          this.remove();
          console.log(this, 'Good Bye');
        }
        console.log(
            this, 'Good Bye', this.memory.creeps,
            Math.floor(_.sum(this.creeps, 'ticksToLive') / (this.memory.creeps.length || 1)));
        return 'Slow Delete';
    }
    return 'null';
  }
}

lib.merge(Flag, FlagTeam);
