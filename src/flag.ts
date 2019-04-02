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
  what() {
    return _.words(this.name)[0]
  }

  quantity(): number {
    const words = _.words(this.name);
    if(words.length < 2) return 0;
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
    }
  }

  darkRun() {
    if (this.room) return
    if (this.color === COLOR_BLUE) {
      this.darkTeam()
    }
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