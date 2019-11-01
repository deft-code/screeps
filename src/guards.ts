export function isCreep(c: Creep | PowerCreep): c is PowerCreep {
    return !('className' in c);
}

export function isStore(w: Withdrawable): w is GenericStoreStructure | Tombstone;
export function isStore(s: XferStruct): s is GenericStoreStructure;
export function isStore(s: any): s is any {
    return !!s.store && !_.contains([STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_LAB, STRUCTURE_LINK, STRUCTURE_SPAWN, STRUCTURE_POWER_SPAWN],  s.structureType);
}