var modrole = require('mod.role');

Creep.prototype.roleManual = function() {
  let f = Game.flags.manual;
  if (f && !this.pos.isEqualTo(f.pos)) {
    let err = this.moveTo(f);
    return modutil.sprint('moving', err, f.pos);
  }
  return false;
};
