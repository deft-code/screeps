export function isCreep(c: AnyCreep): c is PowerCreep {
    return !('className' in c);
}

export function isGenericStore(w: Withdrawable): w is GenericStoreStructure | Tombstone;
export function isGenericStore(s: XferStruct): s is GenericStoreStructure;
export function isGenericStore(s: any): s is any {
    return !!s.store && !_.contains([STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_LAB, STRUCTURE_LINK, STRUCTURE_SPAWN, STRUCTURE_POWER_SPAWN],  s.structureType);
}

export function isStoreStruct(s: Structure): s is AnyStoreStructure {
    return !!(<AnyStoreStructure>s).store;
}