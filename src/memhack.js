let memHack = null;
module.__initGlobals = function() {
    Object.defineProperty(global, 'Memory', {
        configurable: true,
        enumerable: true,
        get() {
            if(memHack === null) {
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