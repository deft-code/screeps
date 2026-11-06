// Server identity (2017): each global names itself after the entry in
// Memory.servers seen longest ago and stamps it every tick, to tell the
// runtime's servers apart. Orphan: nothing imports it.

declare global {
  interface Memory {
    servers: { [name: string]: { seen: number } }
  }
}

function findName (): string {
  let min = Game.time
  let me = 'nope'
  for (let s in Memory.servers) {
    const data = Memory.servers[s]
    if (data.seen < min) {
      min = data.seen
      me = s
    }
  }
  return me
}

// 'Mercury', 'Venus', 'Earth', 'Mars', 'Ceres', 'Jupiter', 'Saturn', 'Neptune', 'Uranus', 'Pluto'

class Server {
  name: string
  reload: number
  sig: number
  ticks: number

  constructor () {
    this.name = findName()
    this.reload = Game.time
    this.sig = Math.floor(Math.random() * 1000)
    this.ticks = 0
  }

  run () {
    Memory.servers[this.name].seen = Game.time
    this.ticks++
    return this.name
  }

  get uptime () {
    return Game.time - this.reload
  }
}

export default new Server()
