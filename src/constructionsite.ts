import { extender } from "roomobj";
import { stype6 } from "struct";

@extender
export class ConstructionSiteExtra extends ConstructionSite {
  get note() { return stype6(this.structureType) + 'Site' + this.pos.xy; }
  toString() {
    return `<a href="/a/#!/room/${Game.shard.name}/${this.pos.roomName}">${this.note}</a>`;
  }
}