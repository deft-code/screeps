
const hackingKey = Symbol();
let hijackedSize = 0;
let hijacked = null;
let hijackTick = 0;

export function reinject() {
    Object.defineProperty(Object.prototype, hackingKey,
        {
            configurable: true,
            enumerable: false,
            get() {
                const n = _.size(this);
                if (n > hijackedSize) {
                    hijacked = this;
                    hijackedSize = n;
                }
                return false;
            },
        }
    );
}

export function clean() {
    delete Object.prototype[key];
}

export function getRawMarket() {
    if (Game.time !== hijackTick) {
        hijackTick = Game.time;
        hijacked = null;
        hijackedSize = 0;
        Game.market.getOrderById(hackingKey);
    }
    return hijacked;
}