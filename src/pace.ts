// This module will automatically determine the tick rate.

let lastTimestamp = 0;
// Raw Rate. Default value is used for first tick.
let tickRate = 3000;
// Exponential Moving Average of tick Rate
let tickRateEMA = 0;

// First 5 tick rates used to get a reasonable starting value.
let rates: number[] = [];

declare const module: { __initGlobals(): void };
module.__initGlobals = tick;

function tick() {
    console.log("ticked");
    const next = (new Date()).getTime();

    if(lastTimestamp === 0) {
        lastTimestamp = next;
        return;
    }

    tickRate = next - lastTimestamp;
    lastTimestamp = next;

    if (tickRateEMA === 0) {
        rates.push(tickRate);
        if (rates.length === 5) {
            rates.sort((a, b) => a - b);
            // Use median tick rate as initial value for EMA.
            tickRateEMA = rates[2];
        }
        return
    }

    tickRateEMA = Math.round((tickRateEMA * 99 + tickRate) / 100);
}

// Milliseconds between the start of this tick and the last.
export function msPerTickRaw() {
    return tickRate;
}

// Average tick rate in milliseconds.
export function msPerTick() {
    if(tickRateEMA > 0) return tickRateEMA;

    if(rates.length === 0) return 3000;

    return Math.round(_.sum(rates) / rates.length);
}

// Convert ticks into a fuzzy human friendly time string.
export function humanize(ticks: number) {
    const epoc_s = Math.round(ticks * msPerTick() / 1000);
    const secs = epoc_s % 60;

    const epoc_m = Math.floor(epoc_s / 60);
    const mins = epoc_m % 60;

    const epoc_h = Math.floor(epoc_m / 60);
    const hours = epoc_h % 24;

    const days = Math.floor(epoc_h / 24);

    if (days > 0) {
        return `${days}d${hours}h`
    }

    if (hours > 0) {
        return `${hours}h${mins}m`
    }

    if (mins > 0) {
        return `${mins}m${secs}s`
    }

    return `${secs}s`;
}