export function isCreep(c: AnyCreep): c is PowerCreep {
    return !('className' in c);
}

export function isGenericStore(w: Withdrawable): w is GeneralStoreStruct | Tombstone;
export function isGenericStore(s: XferStruct): s is GeneralStoreStruct;
export function isGenericStore(s: any): s is any {
    return !!s.store && !_.contains([STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_LAB, STRUCTURE_LINK, STRUCTURE_SPAWN, STRUCTURE_POWER_SPAWN],  s.structureType);
}

//export function isStoreStruct(s: AnyStructure): s is AnyStoreStructure;
export function isStoreStruct(s: any): s is AnyStoreStructure {
    return !!(<AnyStoreStructure>s).store;
}

export function isGeneralStoreStruct(s: Structure): s is GeneralStoreStruct {
    return _.contains([STRUCTURE_FACTORY, STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_CONTAINER], s.structureType);
}

export function isSType<STYPE extends StructureConstant>(s: Structure, stype: STYPE): s is AllStructureTypes[STYPE] {
    return s.structureType === stype;
}

export function isOwnedStruct(s: Structure): s is OwnedStructure {
    return (s as OwnedStructure).my === true || (s as OwnedStructure).my === false;
}