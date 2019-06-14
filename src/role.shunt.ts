import { extender } from "roomobj";
import { Mode, isLink } from "struct.link";

declare global {
  interface CreepMemory {
    spawn?: string
    spot?: string
  }
}

@extender
class CreepShunt extends Creep {
  roleAux() { return this.roleCore() }
  afterAux() { return this.afterCore() }

  roleCore() {
    if (this.moveSpot()) return 'moved'

    const spots = this.room.lookForAtRange(LOOK_STRUCTURES, this.pos, 1, true)
    const structs = _.shuffle(_.map(spots, s => s[LOOK_STRUCTURES])) as AnyOwnedStructure[];

    let store: StructureStorage | StructureTerminal;
    let link: StructureLink;
    let estruct
    for (const struct of structs) {
      switch (struct.structureType) {
        case STRUCTURE_TOWER:
          if (estruct) break
          if (struct.energyFree >= 200) estruct = struct
          break
        case STRUCTURE_SPAWN:
          if (struct.energyFree) estruct = struct
          break
        case STRUCTURE_LINK:
          link = struct
          break
        case STRUCTURE_STORAGE:
        case STRUCTURE_TERMINAL:
          store = struct
          break
      }
    }

    if (estruct) {
      return this.goTransfer(estruct, RESOURCE_ENERGY, false) ||
        this.goWithdraw(link!, RESOURCE_ENERGY, false) ||
        this.goWithdraw(store!, RESOURCE_ENERGY, false)
    }

    if (isLink(link)) {
      if (link.mode === Mode.src) {
        return this.goTransfer(link, RESOURCE_ENERGY, false) ||
          this.goWithdraw(store, RESOURCE_ENERGY, false)
      }
      return this.goWithdraw(link, RESOURCE_ENERGY, false) ||
        this.goTransfer(store, RESOURCE_ENERGY, false)
    }
    return 'finish'
  }

  afterCore() {
    this.idleNom()
    this.structAtSpot(STRUCTURE_RAMPART)

    const p = this.teamRoom.getSpot(this.role)
    if (p && this.pos.isEqualTo(p)) {
      this.idleImmortal()
    }
  }

  moveSpot() {
    const where = this.memory.spot || this.role
    const p = this.teamRoom.getSpot(where)
    if (!p) return false;
    if (!this.pos.isEqualTo(p)) {
      this.log("moving to", p);
      return this.movePos(p)
    }
    return false
  }

  structAtSpot(stype: BuildableStructureConstant) {
    const p = this.teamRoom.getSpot(this.role)
    if (!p) return
    const struct = _.find(p.lookFor(LOOK_STRUCTURES),
      s => s.structureType === stype)
    if (struct) return
    const err = p.createConstructionSite(stype)
    if (err !== OK) {
      this.dlog('BAD ctor', stype, err)
    }
  }

  nearSpawn(): StructureSpawn | null {
    let s = Game.getObjectById<StructureSpawn>(this.memory.spawn)
    if (s && this.pos.isNearTo(s)) return s

    s = _.find(this.room.findStructs(STRUCTURE_SPAWN) as StructureSpawn[],
      ss => this.pos.isNearTo(ss)) || null;
    if (s) {
      this.memory.spawn = s.id
    }
    return s
  }

  idleImmortal() {
    if (this.room.energyFreeAvailable === 0 || this.ticksToLive! < 200) {
      const s = this.nearSpawn()
      if (!s) return
      if (s._renew) {
        this.dlog('Double Renew', s, s._renew)
        return
      }
      if (s.renewCreep(this) === OK) {
        s._renew = this.name
      }
    }
  }
}
