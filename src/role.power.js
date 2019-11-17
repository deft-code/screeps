module.exports = class CreepPower {
  rolePower () {
    const p = Game.rooms.W29N11.getPositionAt(41,24)
    if(!this.pos.isEqualTo(p)) {
        this.movePos(p)
    }
    const s = Game.getObjectById("5c574d80b8cfe8383392fb37")
    const t = Game.rooms.W29N11.terminal
    
    const sdelta = s.powerCapacity - s.power
    if (sdelta >= 50 && this.store.power > 0) {
        this.transfer(s, RESOURCE_POWER)
        return true
    }
    
    const edelta = s.store.getCapacity(RESOURCE_ENERGY) - s.store.energy
    if (edelta >= 150 && this.store.energy > 0) {
        this.transfer(s, RESOURCE_ENERGY)
        return true
    }
    
    if (sdelta >= 50 && t.store.power > 0) {
        this.withdraw(t, RESOURCE_POWER, Math.min(this.store.getFreeCapacity(), t.store.power, 50))
        return true
    }
    
    if (edelta >= 150 && t.store.energy > 100) {
        this.withdraw(t, RESOURCE_ENERGY, this.store.getFreeCapacity())
        return true
    }
    
    return false
  }
}
