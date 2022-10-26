import { Targetable, Tasker, MemoryTask } from "Tasker";
import { merge } from "lib";
import { extender } from "roomobj";
import { colorString } from "debug";

declare global {
  interface FlagMemory {
    room?: string
    born?: number
    task?: MemoryTask
  }
}

const missionTasker = new Tasker();

@extender
export class FlagExtra extends Flag {
  get id(): string {
    return 'flag_' + this.name;
  }


  toString() {
    const color1 = colorString(this.color)
    const color2 = colorString(this.secondaryColor)
    return `<span style=color:${color1}>&#127988;&#xFE0E;</span><a href="/a/#!/room/${Game.shard.name}/${this.pos.roomName}">${this.name}</a><span style=color:${color2}>&#127988;&#xFE0E;</span>`
  }

  get parentName() {
    const i = this.name.indexOf('_');
    if (i < 0) return null;
    return this.name.substring(i + 1);
  }

  get parent(): FlagExtra | null {
    const name = this.parentName;
    if (!name) return null;
    return Game.flags[name] as FlagExtra || null;
  }

  childName(prefix: string): string {
    return prefix + '_' + this.name;
  }

  getChild(prefix: string): this | null {
    const name = this.childName(prefix);
    return Game.flags[name] as this;
  }

  makeChild(prefix: string, pos: RoomPosition, color: ColorConstant) {
    return pos.createFlag(this.childName(prefix), COLOR_GREY, color);
  }

  get self() {
    const i = this.name.indexOf('_');
    if (i < 0) return this.name;
    return this.name.substring(0, i);
  }

  get role() {
    return this.what().toLowerCase();
  }

  what() {
    return _.words(this.self)[0]
  }

  quantity(): number {
    const words = _.words(this.self);
    if (words.length < 2) return 0;
    return parseInt(words[1]);
  }

  run() {
    switch (this.color) {
      // TODO remove
      // case COLOR_GREEN:
      //   return this.runMission();
      case COLOR_BLUE:
        return this.runTeam()
      // case COLOR_ORANGE:
      //   return require('planner')(this)
      // case COLOR_CYAN:
      //   return this.runMeta();
      case COLOR_GREY:
        return runChildFlag(this);
    }
  }

  darkRun() {
    if (this.room) return
    if (this.color === COLOR_BLUE) {
      this.darkTeam()
    }
  }

  dupe() {
    if (this.quantity() > 0) return true;
    for (let i = 1; i < 100; i++) {
      const next: string = this.name + 1
      const err = this.pos.createFlag(next, this.color, this.secondaryColor);
      if (err === ERR_NAME_EXISTS) continue;
      if (err < OK) {
        this.errlog(err as OK);
        return false;
      }
      this.remove();
      return false;
    }
    this.log("no dupes available", this.quantity());
    return false;
  }

  temp() {
    if (this.memory.room !== this.pos.roomName) {
      this.memory.room = this.pos.roomName
      this.memory.born = Game.time
    }

    if (Game.time > 1500 + (this.memory.born || 0)) {
      this.remove()
    }
  }
}

function runChildFlag(f: FlagExtra) {
  const p = f.parent;
  if (!p) {
    f.log("missing parent", f.remove());
  }
}