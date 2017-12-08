Flag.prototype.what = function() {
  return _.words(this.name)[0];
}

Flag.prototype.quantity = function() {
  return parseInt(_.words(this.name)[1]);
}

Flag.prototype.run = function() {
  switch(this.color) {
    case COLOR_BLUE:
      return this.runTeam();
    case COLOR_ORANGE:
      return require('planner')(this);
  }
}

Flag.prototype.darkRun = function() {
  if(this.flag.room) return;

  debug.log(this, "dark run");
}
