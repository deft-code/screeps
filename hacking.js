// Variable to hold referent to runtime
let gRuntime = null;

// Keeps these so they can be restored after the snoop.
const oldBind = Function.prototype.bind;

// Hold on the first bound require to return when init tries to bind a new one.
const oldRequire = global.require;

// Hold on to the cache so we don't loose it when require is rebound.
const oldRequireCache = oldRequire.cache;

// The newly rebound require will be assigned a default cache, Make sure we don't loose our existing populated cache.
Object.defineProperty(oldRequire, 'cache', {
    get() { return oldRequireCache; },

    // Don't let the binding code overwrite the cache, but also don't throw an error.
    set(newCache) {},
});
  
function snoopBind(bindThis) {
    // The function binded to create require is named requireFn. Looking for
    // this name stops us from messing with any other bind calls.
    // Note I didn't actually see any when testing; This is just to be safe.
    if (this.name === 'requireFn') {
        // Snag the runtime. This only needs to be done once since the runtime
        // object is updated every tick rather than created again.
        gRuntime = bindThis;

        // Restore the old bind behavior
        Function.prototype.bind = oldBind;

        // Don't actually rebind require the second time. The first one still
        // works great and has all of the previous imports cached.
        return oldRequire;
    }

    // For any bind calls not for require just do the non-hack behavior.
    return oldBind.call(this, bindThis);
}
// Hijack the behavior of bind
Function.prototype.bind = snoopBind;

// Force the require function to be rebound next tick.
// This could be done by temporarily removing 'main' from the cache or
// main.loop. But timestamp is nice since rebinding restores it to the correct
// value.
oldRequire.timestamp = 0;

exports.setIntent = function (id, intent, intentData) {
    if (!gRuntime) return
    gRuntime.intents.set(id, intent, intentData);
}

exports.getIntentData = function (id, intent) {
    if (!gRuntime) return null;
    return gRuntime.intents.list[id][intent] || null;
}

exports.getIntents = function (id) {
    if (!gRuntime) return [];
    return _.keys(gRuntime.intents.list[id]);
}

Object.defineProperty(exports, 'runtime', { get() { return gRuntime } });

exports.getRuntimeData = function() {
    if(!gRuntime) return null;
    return gRuntime.runtimeData;
}