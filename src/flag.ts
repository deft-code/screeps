import { Targetable, Tasker, MemoryTask } from "Tasker";
import { merge } from "lib";

declare global {
  interface FlagMemory {
    room?: string
    born?: number
    task?: MemoryTask
  }
}

const missionTasker = new Tasker();

export class FlagExtra extends Flag {
  get id(): string {
    return 'flag_' + this.name;
  }

  get parent() {
    const i = this.name.indexOf('_');
    if (i < 0) return null;
    return this.name.substring(i + 1);
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
      case COLOR_GREEN:
        return this.runMission();
      case COLOR_BLUE:
        return this.runTeam()
      case COLOR_ORANGE:
        return require('planner')(this)
      case COLOR_CYAN:
        return this.runMeta();
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
      this.errlog(err);
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

merge(Flag, FlagExtra)