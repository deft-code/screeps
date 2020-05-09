// Variable to hold referent to runtime
let runtime = null;

// Keeps these so they can be restored after the snoop.
const oldBind = Function.prototype.bind;

// Hold on the first bound require to return when init tries to bind a new one.
const oldRequire = global.require;

// Hold on to the cache so we don't loose it when require is rebound.
const oldRequireCache = oldRequire.cache;

// Be prepared to undo the timestamp change to stop require from being rebound each tick.
const oldTimestamp = oldRequire.timestamp;

// The newly rebound require will be assigned a default cache, Make sure we don't loose our existing populated cache.
Object.defineProperty(oldRequire, 'cache', { value: oldRequireCache });

function snoopBind(bindThis) {
    // The function bound to create require is named requireFn. Looking for this name stops us from messing with any other bind calls.
    // Note I didn't actually see any when testing; This is just to be safe.
    if (this.name === 'requireFn') {
        // Snag the runtime
        runtime = bindThis;

        // Restore the old bind behavior
        Function.prototype.bind = oldBind;

        // Restore timestamp to prevent require from being rebound next tick.
        oldRequire.timestamp = oldTimestamp;

        // Don't actually rebind require the second time. The first one still works great.
        return oldRequire;
    }
    // For any bind calls not for require just do the non-hack behavior.
    return oldBind.call(this, bindThis);
}
// Hijack the behavior of bind
Function.prototype.bind = snoopBind;

// Force the require function to be rebound next tick.
oldRequire.timestamp = 0;

exports.setIntent = function (id, intent, intentData) {
    if (!runtime) return
    runtime.intents.set(id, intent, intentData);
}

exports.getIntentData = function (id, intent) {
    if (!runtime) return null;
    return runtime.intents.list[id][intent] || null;
}

exports.getIntents = function (id) {
    if (!runtime) return [];
    return _.keys(runtime.intents.list[id]);
}

Object.defineProperty(exports, 'runtime', { get() { return runtime } });

exports.getRuntimeData = () => runtime.runtimeData;