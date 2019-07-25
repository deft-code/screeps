type CacheRoot = { id: string } | Flag | Room;

export function inject(cache: TickCache | GlobalCache, prop: string, klass: { prototype: any }) {
    Object.defineProperty(klass.prototype, prop, {
        get() { return cache.getCache(this); },
        set(val: Object) { cache.setCache(this, val); },
        configurable: true,
    });
}

export class TickCache {
    lastTick = 0;
    cache = new Map<string, any>();

    getKey(obj: CacheRoot): string {
        return (obj as OwnedStructure).id || (obj as Flag).name
    }

    getCache(obj: CacheRoot): any {
        if (Game.time !== this.lastTick) {
            this.clear();
        }
        const key = this.getKey(obj);
        if (!key) return {}

        const cache = this.cache.get(key)
        if (cache) return cache;

        const newCache = {};
        this.cache.set(key, newCache);
        return newCache;
    }

    setCache(obj: CacheRoot, val: any) {
        this.cache.set(this.getKey(obj), val);
    }

    clear() {
        this.lastTick = 0;
        this.cache.clear();
    }

    inject(klass: { prototype: any }) {
        inject(this, 'tick', klass);
    }
}
export let theTick = new TickCache();

class GlobalCache {
    expireTick = 0;
    hotCache = new Map<string, any>();
    coldCache = new Map<string, any>();

    getKey(obj: CacheRoot): string {
        return (obj as OwnedStructure).id || (obj as Flag).name
    }

    getCache(obj: CacheRoot): any {
        if (Game.time > this.expireTick) {
            this.clear()
        }
        const key = this.getKey(obj);
        if (!key) return {}

        let cache = this.hotCache.get(key);
        if (cache) return cache;

        cache = this.coldCache.get(key);
        if (cache) {
            this.hotCache.set(key, cache);
            this.coldCache.delete(key);
            return cache;
        }

        const newCache = { birth: Game.time };
        this.hotCache.set(key, newCache);
        return newCache;
    }

    setCache(obj: CacheRoot, val: any) {
        const key = this.getKey(obj);
        this.hotCache.set(key, val);
        // prevent caches from holding different values.
        this.coldCache.delete(key);
    }

    clear() {
        this.expireTick = Game.time + _.random(20, 50);
        const dead = this.coldCache;
        this.coldCache = this.hotCache;
        this.hotCache = new Map();
        for (const [key, value] of dead) {
            const obj = Game.getObjectById(key) || Game.flags[key] || Game.rooms[key];
            if (!obj) continue
            this.hotCache.set(key, value);
        }
    }

    inject(klass: { prototype: any }) {
        inject(this, 'cache', klass);
    }
}

export let theCache = new GlobalCache();

export function injectAll() {
    theTick.inject(Room);
    theTick.inject(RoomObject);

    theCache.inject(Room);
    theCache.inject(RoomObject);
}

declare global {
    interface RoomObjectCache {
        birth: number
    }

    interface FlagTick {

    }
    interface FlagCache extends RoomObjectCache {

    }
    interface Flag {
        tick: FlagTick
        cache: FlagCache
    }

    interface CreepTick {

    }
    interface CreepCache extends RoomObjectCache {

    }
    interface Creep {
        tick: CreepTick
        cache: CreepCache
    }

    interface ExtensionTick {
    }
    interface ExtensionCache extends RoomObjectCache {

    }
    interface StructureExtension {
        tick: ExtensionTick
        cache: ExtensionCache
    }

    interface SpawnTick {
    }
    interface SpawnCache extends RoomObjectCache {
    }
    interface StructureSpawn {
        tick: SpawnTick
        cache: SpawnCache
    }
}