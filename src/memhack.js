let memHack = null;
const globalBorn = Game.time;
let lastTick = Game.time - 1;
module.__initGlobals = function () {
    if (lastTick + 1 !== Game.time) {
        console.log("DOUBLE GLOBAL!, this:", globalBorn, "is missing", Game.time - lastTick, "ticks. Last saw", lastTick);
        memHack = null;
    }
    lastTick = Game.time;

    Object.defineProperty(global, 'Memory', {
        configurable: true,
        enumerable: true,
        get() {
            if (memHack === null) {
                memHack = JSON.parse(RawMemory.get());
            }
            Object.defineProperty(global, 'Memory', {
                configurable: true,
                enumerable: true,
                value: memHack,
            });
            return RawMemory._parsed = memHack;
        }
    });
}