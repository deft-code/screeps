global.injectAbuse = function () {
    function onclick() {
        (function () {
            console.log('start client abuse', window.clientAbuse);
            if(!window.clientAbuse) window.clientAbuse = Object.create(null, {});

            let room = angular.element(document.getElementsByClassName('room ng-scope')).scope().Room;
            if(room.injected) return console.log('double injected!');
            room.injected = true;

            function ontick() {
                const i = angular.element(document.body).injector();
                let mem = { room: i.get('$routeParams') };
                let update = false;
                if(mem.room.room !== window.clientAbuse.room) update = true;
                window.clientAbuse.room = mem.room.room;

                if(window.clientAbuse.click) {
                    update = true;
                    mem.click = window.clientAbuse.click;
                    delete window.clientAbuse.click;
                }

                mem.selected = room.selectedObject && room.selectedObject._id;
                if(mem.selected !== window.clientAbuse.selected) window.clientAbuse.selected = mem.selected;

                if (!update) return;
                mem.time = room.gameTime;
                console.log('updated', mem);
                i.get('Connection').setMemoryByPath(null, 'client', mem);
            }

            angular.element(document.body).injector().get('Connection').onRoomUpdate(angular.element(document.getElementsByClassName('room ng-scope')).scope(), ontick);

            const oldCheckController = room.checkController;
            function checkController(...args) {
                return oldCheckController.apply(this, arguments) || { msg: 'HACK' };
            }
            room.checkController = checkController;

            const oldCursorPaint = room.cursorPaint;
            function cursorPaint(e) {
                if (e.type === 'mouseup' && this.cursorPos) {
                    window.clientAbuse.click = {
                        x: this.cursorPos.x,
                        y: this.cursorPos.y,
                        ctrl: e.ctrlKey,
                        shift: e.shiftKey,
                        button: e.button };
                }
                return oldCursorPaint.call(this, e);
            }
            room.cursorPaint = cursorPaint;
        })()
    }
    const script = ("" + onclick).split('\n').slice(1, -1).map(s => s.trim()).join('');
    console.log(`<input type="button" class="md-button md-raised primarymd-ink-ripple" value="inject abuse" onclick="${script}" />`);
}

global.clientAbuse = function () {
    function onclick() {
        (function () {
            console.log('start client abuse', window.clientAbuse);
            if(!window.clientAbuse) window.clientAbuse = Object.create(null, {});

            let room = angular.element(document.getElementsByClassName('room ng-scope')).scope().Room;
            if(room.injected) return console.log('double injected!');
            room.injected = true;

            function ontick() {
                const i = angular.element(document.body).injector();
                let mem = { room: i.get('$routeParams') };
                let update = false;
                if(mem.room.room !== window.clientAbuse.room) update = true;
                window.clientAbuse.room = mem.room.room;

                if(window.clientAbuse.click) {
                    update = true;
                    mem.click = window.clientAbuse.click;
                    delete window.clientAbuse.click;
                }

                mem.selected = room.selectedObject && room.selectedObject._id;
                if(mem.selected !== window.clientAbuse.selected) window.clientAbuse.selected = mem.selected;

                if (!update) return;
                mem.time = room.gameTime;
                console.log('updated', mem);
                i.get('Connection').setMemoryByPath(null, 'client', mem);
            }

            angular.element(document.body).injector().get('Connection').onRoomUpdate(angular.element(document.getElementsByClassName('room ng-scope')).scope(), ontick);

            const oldCheckController = room.checkController;
            function checkController(...args) {
                return oldCheckController.apply(this, arguments) || { msg: "HACK" };
            }
            room.checkController = checkController;

            const oldCursorPaint = room.cursorPaint;
            function cursorPaint(e) {
                if (e.type === 'mouseup' && this.cursorPos) {
                    window.clientAbuse.click = {
                        x: this.cursorPos.x,
                        y: this.cursorPos.y,
                        ctrl: e.ctrlKey,
                        shift: e.shiftKey,
                        button: e.button };
                }
                return oldCursorPaint.call(this, e);
            }
            room.cursorPaint = cursorPaint;
        })()
    }
    const script = ("" + onclick).split('\n').slice(1, -1).map(s => s.trim()).join('');
    console.log(`<span>abusing client</span><script>${script}</script>`);
}

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
