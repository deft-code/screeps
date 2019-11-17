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