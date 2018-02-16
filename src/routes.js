const lib = require('lib')
const debug = require('debug')

const kMinRouteAge = 1500

Memory.routes = Memory.routes || {}

exports.isHostile = (roomOrName) => {
  const name = lib.getRoomName(roomOrName)
  switch (name) {
    case 'W22N15':
    case 'W23N15':
    case 'W23N16':
    case 'W25N13':
    case 'W27N14':
    case 'W27N16':
      return true
  }
  return false
}

exports.dist = (fromRoom, destRoom) => {
  const from = lib.getRoomName(fromRoom)
  const dest = lib.getRoomName(destRoom)
  if (from === dest) return 0
  if (from < dest) {
    return lookup(from, dest).length
  }
  return lookup(dest, from).length
}

function lookup (from, dest) {
  const key = `${from}_${dest}`
  if (Memory.routes[key]) {
    return Memory.routes[key].route
  }
  const e = Memory.routes[key] = {
    born: Game.time,
    route: findRoute(from, dest)
  }
  debug.log('New Path', key, JSON.stringify(e))
  return e.route
}

function findRoute (from, dest) {
  return _.map(
    Game.map.findRoute(from, dest, {
      routeCallback: (roomName) => {
        if (lib.isHighway(roomName)) return 1
        if (exports.isHostile(roomName)) return 10
        return 2.5
      }}),
    entry => entry.room)
}

exports.upkeep = () => {
  const key = _.sample(_.keys(Memory.routes))
  const e = Memory.routes[key]
  if (Game.time - e.born < kMinRouteAge) return
  const [f, d] = key.split('_')
  e.born = Game.time
  e.route = findRoute(f, d)
  debug.log('refreshed route', f, d, e.route.length)
}
