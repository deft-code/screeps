export function isCreep(c: Creep | PowerCreep): c is PowerCreep {
    return !('className' in c);
}



export function isStore(w: Withdrawable): w is StoreStructure | Tombstone;
export function isStore(s: XferStruct): s is StoreStructure;
export function isStore(s: any): s is any {
    return !!s.store;
}