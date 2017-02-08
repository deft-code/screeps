
function markDebug(obj, time=500) {
  this.debug = false;
  const mem = this.memory;
  if(!mem) return;
  const mdebug = memory.debug;
  if(mdebug === true) {
    mdebug = this.memory.debug = Game.time + time;
  }
  if(!mdebug || mdebug < Game.time) {
    delete this.memory.debug;
    return;
  }
  this.debug = true;
}

function sprint(...args) {
  let sargs = args.map(a => who(a));
  return sargs.join(' ');
}

function errString(err) {
  switch (err) {
    case OK:
      return 'OK';
    case ERR_NOT_IN_RANGE:
      return 'ERR_NOT_IN_RANGE';
    case ERR_BUSY:
      return 'ERR_BUSY';
    case ERR_INVALID_TARGET:
      return 'ERR_INVALID_TARGET';
  }
  return 'err' + err;
}

function structNote(type, pos) {
  switch (type) {
    case STRUCTURE_WALL:
      type = 'wall';
      break;
    case STRUCTURE_EXTENSION:
      type = 'extn';
      break;
    case STRUCTURE_STORAGE:
      type = 'store';
      break;
    case STRUCTURE_TERMINAL:
      type = 'term';
      break;
    case STRUCTURE_CONTAINER:
      type = 'contnr';
      break;
  }

  const xy = '' + pos.x + pos.y;
  return type.slice(0, 10 - xy.length) + xy;
}

const parts = [TOUGH, CARRY, WORK, ATTACK, RANGED_ATTACK, MOVE, CLAIM, HEAL];

const partPriority = (part) => _.indexOf(parts, part) || -1;

function optimizeBody(body) {
  return body.slice().sort((l, r) => partPriority(l) - partPriority(r));
}

let who = function(obj) {
  let parts;
  if (obj instanceof RoomPosition) {
    parts = [obj.x, obj.y];
  } else if (obj instanceof Creep) {
    const task = obj.memory.task || {};
    parts = [obj.name, obj.memory.role, task.task, task.note];
  } else if (obj instanceof Resource) {
    parts = [obj.resourceType, who(obj.pos)];
  } else if (obj instanceof Source) {
    parts = ['src', who(obj.pos)];
  } else if (obj instanceof Structure) {
    parts = [obj.structureType, obj.name, who(obj.pos)];
  } else if (obj instanceof ConstructionSite) {
    parts = ['site', who(obj.pos)];
  } else if (obj instanceof Room) {
    parts = [obj.name];
  } else if (obj == null) {
    parts = ['null'];
  } else if (typeof obj == 'number') {
    parts = [errString(obj)];
  } else if (obj.id) {
    parts = [obj.id.slice(-4)];
  } else {
    parts = [String(obj)];
  }
  return '(' + _.compact(parts).join() + ')';
};

function cachedProp(klass, prop, func) {
	Object.defineProperty(klass.prototype, prop, {
		get: function() { 
			if(this === klass.prototype || this == undefined)
				return;
			let result = func.call(this,this);
			Object.defineProperty(this, prop, {
				value: result,
				configurable: true,
				enumerable: false
			});
			return result;
		},
		configurable: true,
		enumerable: false
	});
} 

function roProp(klass, prop, func) {
	Object.defineProperty(klass.prototype, prop, {
		get: function() { 
			if(this === klass.prototype || this == undefined)
				return;
			return func.call(this,this);
		},
		configurable: false,
		enumerable: false
	});
} 

function randomResource(resources) {
  let r = {};
  Object.assign(r, resources);
  if (r.energy == 0) {
    delete r.energy;
  }
  return _.sample(_.keys(r));
}

module.exports = {
  markDebug: markDebug,
  who: who,
  cachedProp: cachedProp,
  roProp: roProp,
  sprint: sprint,
  randomResource: randomResource,
  structNote: structNote,
  optimizeBody: optimizeBody,
};
