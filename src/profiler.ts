// let gEnabled = false;

// export function enable(enable=true) {
//     gEnabled = enable;
// }


// declare const module: { __initGlobals(): void };
// module.__initGlobals = tick;
// function tick() {
//     if(!gEnabled) return;
//     manualSample('premain');
// }

// let gPostProfileTick = 0;
// const postProfile = {
//     toJSON() {
//         manualSample('postProfile')
//         return Math.round(10*Game.cpu.getUsed());
//     }
// }

// function checkPostProfile() {
//     if(gPostProfileTick == Game.time) return;
//     gPostProfileTick = Game.time;
//     delete Memory.zPostProfile;
//     Memory.zProfileAccumulator = postProfile;
// }

// function recordSample(path) {

// }

// function stackSample() {
//     const now = Game.cpu.getUsed();
// }