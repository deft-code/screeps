# Build & Deploy

Toolchain: gulp 5 + gulp-typescript 3 + TypeScript 3.8, pushed with gulp-screeps.
Config lives in `gulpfile.js`, `tsconfig.json`, `package.json`; the console
tasks are implemented in `console-tools.js`.

## Setup

- `npm install` (`package-lock.json` is committed).
- Copy `blank_credentials.js` to `credentials.js` (gitignored). Fill `token`
  (preferred) or `email`/`password`. `branch` defaults to `default`. One-off
  tasks also read `market_token` and `money_token`.
- `.gitmodules` declares `murmurhash-js/`, but the build never references it.
  `git submodule update --init` is optional.
- Line endings are LF everywhere: `.gitattributes` (`* text=auto eol=lf`)
  normalises on commit and checkout regardless of `core.autocrlf`, and
  `.editorconfig` tells editors the same (VS Code needs the EditorConfig
  extension). Indent width is not pinned for TS/JS because the 2017 JavaScript
  uses 2 spaces and the 2022 TypeScript uses 4.

## Tasks

| Task | What it does |
|---|---|
| `npx gulp compile` | Compiles `src/**/*` (TS plus passthrough JS via `allowJs`) to `distjs/`, external sourcemaps to `sourcemaps/`. Dependency of every deploy task. Compile errors set `global.compileFailed` but do **not** abort the push. |
| `npx gulp cycles` | Walks the static `require("x")` calls in `distjs/*.js` and fails on any cycle, printing the chain (`a -> b -> a`). Runs as the second half of `compile`, so a cycle **does** abort the push. Needed because the Screeps loader throws `Circular reference to module` on any cycle that tsc and node both tolerate. Dynamic requires such as `require(importName)` in `process.ts` are ignored. |
| `npx gulp season` | compile, then push `distjs/*.js` to the seasonal server (`path: /season`, branch `default`). **Current target: Season 11 on `shardSeason`.** |
| `npx gulp deploy` | compile, then push to `credentials.branch` on MMO (`shard2` is the only MMO shard the code accepts). |
| `npx gulp ptr` | compile, then push to PTR. |
| `npx gulp watch` / `watchSeason` / `watchPtr` / `watchCompile` | Re-run the matching task on any change under `src/`. |
| `npx gulp console --cmd "<expr>"` | Send one expression to the game console (or pipe it on stdin) and print the console output of the tick that answers it: that tick's `console.log` lines, then the result as `< ...`. Exits 1 after `SCREEPS_CONSOLE_TIMEOUT` seconds (default 30) without a result. |
| `npx gulp consoleTail` | Stream live console output to stdout and append it to `logs/console-<world>.log` until Ctrl+C (or `SCREEPS_CONSOLE_SECONDS`). Rotates to `.1.log` ... `.<keep>.log` past `SCREEPS_LOG_MAX_BYTES` (default 5 MiB), keeping `SCREEPS_LOG_KEEP` (default 5) old files. Screeps has no console history API, so this is the only way to capture output. |
| `npx gulp consoleLog` | Legacy name for `consoleTail` with a 60 s default duration. |
| `npx gulp decodeStack --stack "process:60:50 job.hub:12:3"` | Map Screeps stack tokens (`module:line:col`) back to `.ts` locations using `sourcemaps/`. The console tasks do this on every line automatically, including the `module:line#func` prefix from `debug.ts`; `SCREEPS_CONSOLE_RAW=1` turns it (and HTML stripping) off. |

All console tasks read `SCREEPS_WORLD` (`season`/`ptr`/`mmo`, default `season`)
and `SCREEPS_SHARD` (default `shardSeason`/`shard0`/`shard2` per world) and
authenticate with `credentials.token`. Usage recipe for inspecting game state:
CLAUDE.md, "Console from the shell".
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
