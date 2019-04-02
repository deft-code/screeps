export function isCreep(c: Creep | PowerCreep): c is PowerCreep {
    return !('className' in c);
}