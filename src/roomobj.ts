function mergePrototypes(klassProto: any, extraProto: any) {
        const descs = Object.getOwnPropertyDescriptors(extraProto);
        delete descs.constructor;
        Object.defineProperties(klassProto, descs);
}

function merge(klass: any, extra: any) {
    mergePrototypes(klass.prototype, extra.prototype);
}

function injecter(klass: any) {
    return function (extra: any) {
        merge(klass, extra);
    }
}

export function extender(extra: any) {
    mergePrototypes(Object.getPrototypeOf(extra.prototype), extra.prototype);
}

@extender
class RoomObjExtra extends RoomObject {
    effectTTL(pwr: PowerType): number{
        const p = _.find(this.effects, e => e.power === pwr);
        if(!p) return 0;
        return p.ticksRemaining
    }
}