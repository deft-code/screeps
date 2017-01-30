
function findName() {
    let min = Game.time;
    let me = "nope";
    for(let s in Memory.servers) {
        const data = Memory.servers[s];
        if(data.seen < min) {
            min = data.seen;
            me = s;
        }
    }
    return me;
}

const server = {
    name: findName(),
    reload: Game.time,
    sig: Math.floor(Math.random() * 1000),
    ticks: 0,
    run: function() {
        Memory.servers[this.name].seen = Game.time;
        this.ticks++;
        return this.name;
    }
}

Object.defineProperty(server, 'uptime', {
    get: function() {
        return Game.time - this.reload;
    }
});

module.exports = server;