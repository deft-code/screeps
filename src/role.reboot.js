module.exports = class CreepReboot {
  roleReboot() {
    return this.roleBootstrap();
  }

  afterReboot() {
    return this.afterBootstrap();
  }
}
