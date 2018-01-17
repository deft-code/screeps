const remote = (flag) => {
  if (!flag.room) return false
  if (flag.room.controller) {
    if (flag.room.controller.owner && !flag.room.controller.my) return false
    if (flag.room.controller.reservation && flag.room.controller.reservation.username !== 'deft-code') return false
  }

  const srcs = flag.room.find(FIND_SOURCES)
  const hcreeps = flag.roleCreeps('harvester')
  if (hcreeps.length >= srcs.length) return false

  let id
  if (hcreeps.length === 0) {
    id = srcs[0].id
  } else if (hcreeps.length === 1) {
    const taken = hcreeps[0].memory.job.src
    for (const src of srcs) {
      if (src.id === taken) continue
      id = src.id
      break
    }
  }

  if (id) {
    return flag.makeRole({
      role: 'harvester',
      body: 'harvester',
      job: {
        src: id
      }
    }, 2, flag.closeSpawn())
  }
  return false
}

const carts = (flag) => {
  if (!flag.room) return false

  const conts = flag.room.findStructs(STRUCTURE_CONTAINER)
  return flag.upkeepRole(conts.length, {role: 'cart', body: 'cart'}, 3, flag.closeSpawn(550))
}

Flag.prototype.teamRemote = function () {
  return this.teamSuppress() || remote(this) || carts(this) || this.teamReserve()
}
