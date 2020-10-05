
declare global {
    interface RoomObject {
        id: string
        effectTTL(pe: PowerConstant | EffectConstant): number
        effectLvl(pwr: PowerConstant): number
    }
}

function mergePrototypes(klassProto: any, extraProto: any) {
    const descs = Object.getOwnPropertyDescriptors(extraProto);
    delete descs.constructor;
    Object.defineProperties(klassProto, descs);
}

interface extendable {
    readonly prototype: {};
}

function merge(klass: extendable, extra: extendable) {
    mergePrototypes(klass.prototype, extra.prototype);
}

export function injecter(klass: extendable) {
    return function (extra: extendable) {
        merge(klass, extra);
    }
}

export function extender(extra: extendable) {
    mergePrototypes(Object.getPrototypeOf(extra.prototype), extra.prototype);
}

@extender
class RoomObjExtra extends RoomObject {
    effectTTL(effect: PowerConstant | EffectConstant): number {
        const active = _.find(this.effects, pe => pe.effect === effect);
        if (!active) return 0;
        return active.ticksRemaining
    }
    effectLvl(pwr: PowerConstant): number {
        const p = _.find(this.effects, e => e.effect === pwr);
        if (!p) return 0;
        return _.get(p, 'level', 0);
    }
}

