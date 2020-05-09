
function mergePrototypes(klassProto: any, extraProto: any) {
    const descs = Object.getOwnPropertyDescriptors(extraProto);
    delete descs.constructor;
    Object.defineProperties(klassProto, descs);
}

export type ScreepsClass = CreepConstructor | FlagConstructor;

function merge(klass: ScreepsClass, extra: any) {
    mergePrototypes(klass.prototype, extra.prototype);
}

export function injecter(klass: ScreepsClass) {
    return function (extra: any) {
        merge(klass, extra);
    }
}

export function extender(extra: any) {
    mergePrototypes(Object.getPrototypeOf(extra.prototype), extra.prototype);
}

@extender
class RoomObjExtra extends RoomObject {
    effectTTL(pwr: PowerConstant): number {
        const p = _.find(this.effects, e => e.effect === pwr);
        if (!p) return 0;
        return p.ticksRemaining
    }
    effectLvl(pwr: PowerConstant): number {
        const p = _.find(this.effects, e => e.effect === pwr);
        if (!p) return 0;
        return _.get(p, 'level', 0);
    }
}