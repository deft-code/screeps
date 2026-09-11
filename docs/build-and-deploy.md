# Build & Deploy

Toolchain: gulp 5 + gulp-typescript 3 + TypeScript 3.8, pushed with gulp-screeps.
Config lives in `gulpfile.js`, `tsconfig.json`, `package.json`.

## Setup

- `npm install` (`package-lock.json` is committed).
- Copy `blank_credentials.js` to `credentials.js` (gitignored). Fill `token`
  (preferred) or `email`/`password`. `branch` defaults to `default`. One-off
  tasks also read `market_token` and `money_token`.
- `.gitmodules` declares `Traveler/` and `murmurhash-js/`, but neither is used by
  the build: `src/Traveler.js` is a vendored copy and murmurhash is never
  referenced. `git submodule update --init` is optional.

## Tasks

| Task | What it does |
|---|---|
| `npx gulp compile` | Compiles `src/**/*` (TS plus passthrough JS via `allowJs`) to `distjs/`, external sourcemaps to `sourcemaps/`. Dependency of every deploy task. Compile errors set `global.compileFailed` but do **not** abort the push. |
| `npx gulp season` | compile, then push `distjs/*.js` to the seasonal server (`path: /season`, branch `default`). **Current target: Season 11 on `shardSeason`.** |
| `npx gulp deploy` | compile, then push to `credentials.branch` on MMO (`shard2` is the only MMO shard the code accepts). |
| `npx gulp ptr` | compile, then push to PTR. |
| `npx gulp watch` / `watchSeason` / `watchPtr` / `watchCompile` | Re-run the matching task on any change under `src/`. |
| `npx gulp consoleLog` | Record live console output for `SCREEPS_CONSOLE_SECONDS` (default 60) from `SCREEPS_WORLD` (`season`/`ptr`/`mmo`, default `season`) into `logs/`. Screeps has no console history API, so this is the only way to capture output. |
| `npx gulp decodeStack --stack "process:60:50 job.hub:12:3"` | Map Screeps stack tokens (`module:line:col`) back to `.ts` locations using `sourcemaps/`. |
| `npx gulp sim` | Pushes raw `src/*.js` (no compile) to branch `sim`. Legacy: TS files are skipped, so it cannot run the current code. |
| `npx gulp swc` / `plus` | Push raw `src/*.js` to private servers with a hardcoded password. Legacy. |
| `npx gulp market` / `money` | One-off HTTP API dumps (market stats, money history). |
| `npx gulp fetch` | **Overwrites `src/*.js` with the server's live modules.** Do not run casually. |
| `npx gulp clean` | Deletes `dist/*` and `distjs/*`. |

## Source maps

`tsconfig.json` sets `inlineSourceMap`/`inlineSources`, but gulp-typescript 3.x
ignores all sourcemap options. Maps are produced explicitly with
`gulp-sourcemaps` in the `compile` task using `addComment: false`, so
`distjs/*.js` carries no map comments (Screeps enforces per-branch code size and
cannot use maps server-side). Use `decodeStack` to translate runtime errors.

## Module resolution in Screeps

`baseUrl: "src/"` lets code import bare module names (`import 'strat'`,
`require('role.hauler')`). Screeps flattens everything into a single namespace
of module names, so every file in `src/` must have a unique basename and there
are no subdirectories. `lodash` is provided by the runtime both as global `_`
(lodash 3) and as `require('lodash')`.

## TypeScript settings that matter

- `strict: true` but `strictPropertyInitialization: false`; many classes declare
  fields without initialisers.
- `experimentalDecorators: true`. Decorators are the registration mechanism for
  jobs, missions, metastructures, and prototype extension. See
  [conventions-and-styles.md](conventions-and-styles.md).
- `noImplicitReturns: true`.
- `src/types.d.ts` holds global augmentations that were never moved next to
  their implementations.

## Watch script

`watch.sh` is a Linux-only `inotifywait` loop that runs `standard --fix` and then
a gulp task. It does not work on Windows; use `gulp watchSeason` instead.
