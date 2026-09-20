import { Service, Priority} from "process";
import * as debug from "debug";
import { getMyCreep, MyCreep, unget } from "mycreep";


declare global {
    interface Memory {
        missions: {
            [key: string]: MissionMemory
        }
    }
}

export interface MissionMemory {
    creeps: string[]
    hatch: string[]
    eggs: string[]
    // Set by windDown(). The mission stops laying eggs and only shepherds
    // its remaining creeps until they and their tombstones are gone.
    windDown?: boolean
    // creep name -> tick its tombstone is expected to have decayed.
    tombs?: { [name: string]: number }
    // role -> tick its last paced egg was laid (paceCreeps).
    when?: { [role: string]: number }
    // Swipe: tick of the next sparkJoy look at the home stores.
    sparkjoy?: number
    // Bulldoze: tiles to clear as [xy, roomName], the first is the destination.
    doze?: [number, string][]
}

// Ensure missions is here on a clean memory first boot.
Memory.missions = Memory.missions || {};

// Ensure creeps is here on a clean memory first boot.
Memory.creeps = Memory.creeps || {};

// Fastest cadence paceCreeps will lay eggs at; faster rates are clamped here.
export const kMinPaceRate = 100;

export abstract class Mission extends Service {
    constructor(name: string) {
        super(name);
        Memory.missions[name] = Memory.missions[name] || {
            creeps: [],
            hatch: [],
            eggs: [],
        };
    }

    abstract get roomName(): string;

    get room(): Room | null {
        return this.getRoom(this.roomName);
    }

    getRoom(alias = ""): Room | null {
        return Game.rooms[this.getRoomName(alias)!] || null;
    }

    getRoomName(alias = ""): string | null {
        if(/^[WE]\d?\d[NS]\d?\d$/.test(alias)) return alias;
        if(alias === "") return this.roomName;
        return null;
    }

    get eggs() {
        return _.map(this.memory.eggs, c => getMyCreep(c));
    }

    get hatches() {
        return _.map(this.memory.hatch, c => getMyCreep(c));
    }

    get creeps() {
        return _.map(this.memory.creeps, c => getMyCreep(c));
    }

    get memory(): MissionMemory {
        return Memory.missions[this.name];
    }

    roleCreeps(role: string) {
        return this.creeps.filter(c => c.role === role);
    }

    roleHatches(role: string) {
        return this.hatches.filter(c => c.role === role);
    }

    roleEggs(role: string) {
        return this.eggs.filter(egg => egg.role === role);
    }

    // Hand every egg, hatch and creep of `ctor`'s role over to `other`. The
    // names move between the two missions' lists and each creep's memory is
    // repointed so job.creep's `mission` getter resolves to the new owner.
    // Returns the moved names.
    donate(ctor: typeof MyCreep, other: Mission): string[] {
        return this.donateRole(ctor.name.toLowerCase(), other);
    }

    donateRole(role: string, other: Mission): string[] {
        if (other === this) return [];
        const moved: string[] = [];
        for (const list of ["eggs", "hatch", "creeps"] as const) {
            const names = _.remove(this.memory[list], name => getMyCreep(name).role === role);
            for (const name of names) {
                Memory.creeps[name].mission = other.name;
                other.memory[list].push(name);
                moved.push(name);
            }
        }
        if (moved.length) debug.log(this.name, "donated", role, "to", other.name, moved.join(","));
        return moved;
    }

    // donateRole for every role this mission has an egg, hatch or creep of.
    // Returns the moved names.
    donateAll(other: Mission): string[] {
        const roles = _.uniq(_.map([...this.memory.eggs, ...this.memory.hatch, ...this.memory.creeps],
            name => getMyCreep(name).role));
        return _.flatten(roles.map(role => this.donateRole(role, other)));
    }

    // Replace this mission with `cmd`: schedule the new mission (or reuse it
    // if live), hand it every egg, hatch and creep of every role plus the
    // paceCreeps timers, then kill this one and drop its memory. Nothing is
    // purged or wound down, so no creep is lost. Use it to change a mission's
    // arguments, e.g. a Farm's home room once a nearer room is claimed:
    //   getService('Farm W25S8 W26S8').evolve('Farm W25S8 W25S7')
    // Subclass memory beyond the base lists (Remote's metas) is not carried;
    // subclasses with such state should override and handle it.
    evolve(cmd: string): Mission | null {
        if (cmd === this.name) return this;
        const other = Service.schedule(cmd) as Mission | null;
        if (!other || !(other instanceof Mission)) {
            debug.log(this.name, "evolve: no mission for", cmd);
            return null;
        }
        this.donateAll(other);
        if (this.memory.when) {
            other.memory.when = _.assign(other.memory.when || {}, this.memory.when);
        }
        debug.log(this.name, "evolved into", cmd);
        this.kill();
        delete Memory.missions[this.name];
        return other;
    }

    run(): Priority {
        if (this.windingDown) return this.runWindDown();
        this.hatchEggs();
        this.spawnHatches();
        this.runCreeps();
        return super.run();
    }

    get windingDown(): boolean {
        return !!this.memory.windDown;
    }

    status(): string {
        const mem = this.memory;
        let out = super.status();
        if (this.windingDown) out += ` windDown tombs:${_.size(mem.tombs || {})}`;
        return out + ` eggs:${mem.eggs.length} hatch:${mem.hatch.length} creeps:${mem.creeps.length}`;
    }

    // Stop laying eggs, purge the ones already laid, and keep running the
    // living creeps. When the last creep and its tombstone are gone the
    // mission kills itself, which also deschedules it.
    windDown() {
        this.memory.windDown = true;
        this.memory.tombs = this.memory.tombs || {};
        debug.log(this.name, "winding down");
    }

    runWindDown(): Priority {
        this.purgeEggs();
        this.spawnHatches();
        this.watchTombs();
        this.runCreeps();
        this.expireTombs();

        const mem = this.memory;
        if (!mem.eggs.length && !mem.hatch.length && !mem.creeps.length && _.isEmpty(mem.tombs)) {
            debug.log(this.name, "wound down, killing");
            this.kill();
            delete Memory.missions[this.name];
            return "kill";
        }
        return super.run();
    }

    // Subclasses may lay eggs before calling super.run(); drop anything that
    // has not spawned yet so the SpawnDaemon never sees it.
    purgeEggs() {
        for (const name of this.memory.eggs) {
            if (Game.creeps[name]) {
                // Already spawning; let it hatch and be shepherded to death.
                this.memory.hatch.push(name);
                continue;
            }
            debug.log(this.name, "purging egg", name);
            delete Memory.creeps[name];
            unget(name);
        }
        this.memory.eggs = [];
    }

    // Record when each living creep's tombstone would decay if it died now.
    watchTombs() {
        const tombs = this.memory.tombs = this.memory.tombs || {};
        for (const name of this.memory.creeps) {
            const c = Game.creeps[name];
            if (c) tombs[name] = Game.time + 1 + c.body.length * TOMBSTONE_DECAY_PER_PART;
        }
    }

    // Forget tombstones that have decayed. A visible tombstone extends its
    // own entry; an invisible one falls back to the recorded estimate.
    expireTombs() {
        const tombs = this.memory.tombs;
        if (!tombs) return;
        for (const name of _.keys(tombs)) {
            if (Game.creeps[name]) continue;
            const tomb = _.find(_.flatten(_.map(Game.rooms, r => r.find(FIND_TOMBSTONES))),
                t => t.creep.name === name);
            if (tomb) {
                tombs[name] = Game.time + tomb.ticksToDecay;
                continue;
            }
            if (Game.time >= tombs[name]) delete tombs[name];
        }
    }

    hatchEggs() {
        const done: string[] = [];
        for (const name of this.memory.eggs) {
            if (Game.creeps[name]) {
                debug.log("hatching", name);
                done.push(name);
                this.memory.hatch.push(name);
                continue;
            }
            if(Memory.creeps[name].nest !== "egg") {
                const mem = Memory.creeps[name];
                debug.log("Stuck egg", name, Game.time - mem.laid,  JSON.stringify(mem));
                mem.nest = "egg";
            }
            const mycreep = getMyCreep(name);
            mycreep.eggRun();
        }
        if (done.length) {
            _.remove(this.memory.eggs, egg => _.contains(done, egg));
        }
    }

    spawnHatches() {
        const done: string[] = [];
        for (const name of this.memory.hatch) {
            if (!Game.creeps[name]) {
                done.push(name);
                debug.log("Lost Hatch!", name);
            }
            if (!Game.creeps[name]?.spawning) {
                debug.log("Creep Spawned!", name);
                done.push(name);
                this.memory.creeps.push(name);
            }
        }
        if (done.length) {
            _.remove(this.memory.hatch, h => _.contains(done, h));
        }
    }

    runCreeps() {
        const done: string[] = [];
        for (const name of this.memory.creeps) {
            const c = getMyCreep(name)
            if (!c.run()) {
                done.push(name);
            }
        }
        for (const name of done) {
            debug.log("Creep Died!", name);
            this.creepDied(name);
            delete Memory.creeps[name];
            unget(name);
        }
        if (done.length) {
            _.remove(this.memory.creeps, c => _.contains(done, c));
        }
    }

    // Hook: a creep of this mission was found dead this tick. Runs before its
    // memory is dropped; the creep object itself is already gone.
    creepDied(name: string) { }

    hasEgg(role: string) {
        return _.any(this.memory.eggs, egg => getMyCreep(egg).role === role);
    }

    hasRole(role: string) {
        return _.any(this.memory.creeps, c => getMyCreep(c).role === role) ||
            _.any(this.memory.hatch, egg => getMyCreep(egg).role === role);
    }

    // `n` may be fractional: the target is really (n-1)*life ticks of remaining
    // TTL across the role, so 1.5 keeps one creep alive and lays the next once
    // the survivor drops under half life, averaging 1.5 creeps. Below 1 it
    // becomes a duty cycle through paceCreeps: 0.5 means one creep per two
    // lifetimes. 0 or less lays nothing.
    // There is never more than one unhatched egg of a role at a time.
    nJobs(ctor: typeof MyCreep, n: number, life: number = CREEP_LIFE_TIME) {
        return this.nCreeps(ctor.name.toLowerCase(), n, life);
    }

    // Create a new creep of the given role at most once per `rate` ticks.
    // There will only ever be one egg of that role at a time,
    paceJobs(ctor: typeof MyCreep, rate: number = CREEP_LIFE_TIME) {
        return this.paceCreeps(ctor.name.toLowerCase(), rate);
    }

    // paceJobs with the rate derived from a count: `n` creeps per `life`
    // ticks, so one egg every life / n ticks. `n` <= 0 lays nothing (paceCreeps
    // rejects the non-finite rate).
    paceNJobs(ctor: typeof MyCreep, n: number, life: number = CREEP_LIFE_TIME) {
        if (n <= 0) return null;
        return this.paceJobs(ctor, life / n);
    }

    // Port of team.ts paceRole: lay at most one egg per `rate` ticks, and never
    // while one is still unhatched. Unlike nCreeps it does not replace a creep
    // that dies early. Rates under kMinPaceRate are
    // clamped up to it; a non-positive or non-finite rate lays nothing.
    paceCreeps(role: string, rate: number) {
        if (!(rate > 0) || !isFinite(rate)){
            debug.log("Bad rate", role, rate);
            return null;
        }
        rate = Math.max(kMinPaceRate, rate);
        const when = this.memory.when = this.memory.when || {};
        const last = when[role];
        if (last && last + rate >= Game.time) return null;
        if (this.hasEgg(role)) return null;
        when[role] = Game.time + _.random(10);
        return this.layEgg(role);
    }

    nCreeps(role: string, n: number, life: number = CREEP_LIFE_TIME) {
        if (n <= 0) return null;
        const neededttl = (n - 1) * life;
        // a neededttl of 1500 creates 2 creeps
        // a neededttl of 0 spawns replacement as the first dies.
        // below 0 the target is a duty cycle, so pace instead: one egg per life/n ticks.
        if (neededttl < 0) return this.paceCreeps(role, life / n);

        const creeps = this.roleCreeps(role);
        const hatches = this.roleHatches(role);
        const spawnlag = _.max(Array.of(...creeps, ...hatches), c => c.spawnTime)?.spawnTime || 0;
        const total = _.sum(creeps, c => c.ticksToLive)
            + hatches.length * life
            + this.roleEggs(role).length * life;
        const buffer = _.random(10) + spawnlag;
        debug.dlog(`role:${role} total:${total} vs needed:${neededttl + buffer}`);
        if (total > neededttl + buffer) return null;
        // One unhatched egg per role at a time, as paceCreeps: the next is
        // laid once this one has hatched and its TTL counts for real.
        if (this.hasEgg(role)) return null;
        return this.layEgg(role);
    }

    layEgg(role: string) {
        const name = findName(role);
        this.memory.eggs.push(name);
        Memory.creeps[name] = {
            laid: Game.time,
            cpu: 0,
            mission: this.name,
            home: "egg",
            birth: Game.time,
            nest: "egg",
        };
        return getMyCreep(name);
    }
}

let lasti = 0
function findName(role: string): string {
    const n = _.size(Memory.creeps);
    const nn = n + 1

    for (let i = 0; i < nn; i++) {
        const ii = i + lasti % nn;
        const name = role + ii;
        if (!Memory.creeps[name]) {
            lasti = i
            return name
        }
    }
    debug.log('failed to find creep name', role, n)
    return role + Game.time
}

declare global {
    interface CreepMemory {
        mission: string
        birth: number
    }
}