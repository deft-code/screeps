import * as debug from 'debug';
import { Role } from 'role';

// role.ts's bridge to the roleXxx/afterXxx methods (2018). It reads creep
// members (spawning, room, pos, intents) off the Role object, which never
// had them; the experiment stopped here. Orphan: nothing imports it.

export class Legacy extends Role {
  // Creep members the experiment expected on the role object; never set.
  room!: Room
  pos!: RoomPosition
  intents?: unknown
  roleUndefined?: () => unknown
  afterUndefined?: () => void

  get role () {
    return Role.calcRole(this.name)
  }

  run () {
    // (The JS tested this.spawning, Role's always-truthy method.)
    if (this.creep?.spawning) {
      debug.log(this, "shouldn't be spawning")
      return 'spawning'
    }

    const self = this as unknown as { [method: string]: (() => unknown) | undefined }
    const role = _.camelCase('role ' + this.role)
    const roleFunc = self[role] || this.roleUndefined
    const what = roleFunc && roleFunc.apply(this)

    if (this.memory.task) {
      const first = this.memory.task.first
      if (first && first.roomName === this.room.name) {
        this.room.visual.line(this.pos, first)
      }
      delete this.memory.task.first
    }
    return what
  }

  after () {
    if (!this.intents) {
      debug.log(this, 'missing intents!')
    }
    const self = this as unknown as { [method: string]: (() => void) | undefined }
    const after = _.camelCase('after ' + this.role)
    const afterFunc = self[after] || this.afterUndefined
    if (_.isFunction(afterFunc)) afterFunc.apply(this)
  }
}
