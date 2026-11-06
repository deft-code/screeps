// A Memory parse hack (2019): on the first read of `Memory` in a global,
// parse RawMemory once and keep the object across ticks, skipping the
// engine's per-tick JSON.parse. Fully commented out and not imported
// (main.ts keeps the `//import 'memhack'` line); kept for the record.
//
// let memHack = null;
// const globalBorn = Game.time;
// let lastTick = Game.time - 1;
// module.__initGlobals = function () {
//     if (lastTick + 1 !== Game.time) {
//         console.log("DOUBLE GLOBAL!, this:", globalBorn, "is missing", Game.time - lastTick, "ticks. Last saw", lastTick);
//         memHack = null;
//     }
//     lastTick = Game.time;

//     Object.defineProperty(global, 'Memory', {
//         configurable: true,
//         enumerable: true,
//         get() {
//             if (memHack === null) {
//                 memHack = JSON.parse(RawMemory.get());
//             }
//             Object.defineProperty(global, 'Memory', {
//                 configurable: true,
//                 enumerable: true,
//                 value: memHack,
//             });
//             return RawMemory._parsed = memHack;
//         }
//     });
// }

export {};
