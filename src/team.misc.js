Flag.prototype.teamTest = function() {
  const def = {
    role:'scout',
    body:'attack',
    boosts: [RESOURCE_GHODIUM_OXIDE],
    max:1
  };
  return this.upkeepRole(1, def, 4, this.closeSpawn(300));
};

Flag.prototype.teamPuppy = function() {
  let nmedic = 0;
  if(this.room) {
    if(this.room.memory.thostiles) {
      nmedic = 1;
    }
  }
  return this.teamSuppress(800) ||
    this.upkeepRole(nmedic, {role:'medic', body:'heal'}, 3, this.closeSpawn(1700)) ||
    this.upkeepRole(1, {role:'bulldozer', body:'dismantleslow'}, 3, this.closeSpawn());
};

Flag.prototype.teamAssault = function() {
  const heal = {
    role: 'medic',
    body: 'heal',
    boosts: [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE],
  };
  const tank = {
    role: 'bulldozer',
    body: 'dismantleslow',
  };

  return this.ensureRole(2, heal, 4, this.closeSpawn(5000)) ||
    this.ensureRole(2, tank, 4, this.closeSpawn(5000));
};
