

const gulp = require('gulp')
const credentials = require('./credentials.js')
const https = require('https')
const screeps = require('gulp-screeps')
const fs = require('fs')
const path = require('path')
const consoleTools = require('./console-tools')
const del = require('del')

const ts = require('gulp-typescript');
const tsProject = ts.createProject('tsconfig.json', { typescript: require('typescript') });
const sourcemaps = require('gulp-sourcemaps');
const { SourceMapConsumer } = require('source-map');

gulp.task('compileTs', function () {
    return tsProject.src()
      .pipe(sourcemaps.init())
      .pipe(tsProject())
      .on('error', (err) => global.compileFailed = true)
      .js
      .pipe(sourcemaps.write('../sourcemaps', { addComment: false }))
      .pipe(gulp.dest('distjs'));
  })

// The Screeps loader throws "Circular reference to module" for any require
// cycle, while tsc and node both tolerate them. Walk the static requires in
// distjs/ and fail on the first back edge, before anything is pushed.
gulp.task('cycles', function (done) {
  const dir = 'distjs'
  const graph = {}
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8')
    const deps = new Set()
    for (const m of src.matchAll(/require\((["'])([^"']+)\1\)/g)) deps.add(m[2])
    graph[f.slice(0, -3)] = [...deps]
  }
  const state = {} // 1 = on stack, 2 = done
  const stack = []
  const cycles = []
  const visit = (mod) => {
    if (state[mod] === 2 || !graph[mod]) return
    if (state[mod] === 1) {
      cycles.push(stack.slice(stack.indexOf(mod)).concat(mod).join(' -> '))
      return
    }
    state[mod] = 1
    stack.push(mod)
    for (const dep of graph[mod]) visit(dep)
    stack.pop()
    state[mod] = 2
  }
  for (const mod of Object.keys(graph)) visit(mod)
  if (cycles.length) {
    for (const c of cycles) console.error('require cycle: ' + c)
    return done(new Error(cycles.length + ' require cycle(s) in distjs; Screeps will refuse to load them'))
  }
  done()
})

gulp.task('compile', gulp.series('compileTs', 'cycles'))

gulp.task('watchCompile', gulp.series('compile', function watchCompile() {
  return gulp.watch('src/*', gulp.series('compile'));
}));

gulp.task('clean', function () {
  return del(['dist/*', 'distjs/*']);
});

gulp.task('deploy', gulp.series('compile', function deploy() {
  return gulp.src('distjs/*.js').pipe(screeps(credentials))
}))

gulp.task('watch', gulp.series('deploy', function watch() {
  return gulp.watch('src/*', gulp.series('deploy'));
}))

gulp.task('sim', function (done) {
  credentials.branch = 'sim'
  gulp.src('src/*.js').pipe(screeps(credentials)).on('end', done).on('error', done)
})

gulp.task('ptr', gulp.series('compile', function ptr() {
  credentials.branch = 'default'
  credentials.ptr = true
  return gulp.src('distjs/*.js').pipe(screeps(credentials))
}))

gulp.task('watchPtr', gulp.series('ptr', function watchPtr() {
  return gulp.watch('src/*', gulp.series('ptr'));
}))

gulp.task('season', gulp.series('compile', function season() {
  credentials.branch = 'default'
  credentials.path = '/season'
  return gulp.src('distjs/*.js').pipe(screeps(credentials))
}))

gulp.task('watchSeason', gulp.series('season', function watchSeason() {
  return gulp.watch('src/*', gulp.series('season'));
}))


gulp.task('swc', function (done) {
  credentials.branch = 'default'
  credentials.host = 'swc.screepspl.us'
  credentials.password = 'firsttime'
  gulp.src('src/*.js').pipe(screeps(credentials)).on('end', done).on('error', done)
})

gulp.task('plus', function (done) {
  credentials.branch = 'default'
  credentials.host = 'server1.screepspl.us'
  credentials.password = 'firsttime'
  gulp.src('src/*.js').pipe(screeps(credentials)).on('end', done).on('error', done)
})

gulp.task('market', (done) => {
  const options = {
    hostname: 'screeps.com',
    port: '443',
    path: '/api/game/market/stats?resourceType=power&shard=shard1',
    method: 'GET',
    headers: {
      'X-Token': credentials.market_token,
    },
  }

  console.log("before request")

  const req = https.request(options, (res) => {
    res.on('data', (chunk) => {
      console.log("data:", chunk);
      console.log("data str:", new String(chunk));
      console.log("data json:", JSON.parse(chunk));
    })
    res.on('end', () => {
      console.log('end');
      done()
    })
  })
  req.on('error', function (e) {
    console.error('request error:', e)
    done(e)
  })
  req.end()
})

gulp.task('money', (done) => {
  const options = {
    hostname: 'screeps.com',
    port: '443',
    path: '/api/user/money-history?page=1',
    method: 'GET',
    headers: {
      'X-Token': credentials.money_token,
    },
  }

  console.log("before request")

  const req = https.request(options, (res) => {
    res.on('data', (chunk) => {
      console.log("data:", chunk);
      console.log("data str:", new String(chunk));
      console.log("data json:", JSON.stringify(JSON.parse(chunk), null, ' '));
    })
    res.on('end', () => {
      console.log('end');
      done()
    })
  })
  req.on('error', function (e) {
    console.error('request error:', e)
    done(e)
  })
  req.end()
})

gulp.task('fetch', (done) => {
  const options = {
    hostname: 'screeps.com',
    port: '443',
    path: '/api/user/code',
    method: 'GET',
    auth: credentials.email + ':' + credentials.password
  }

  console.log("before request")

  const req = https.request(options, (res) => {
    let raw = ''
    res.on('data', (chunk) => {
      raw += chunk
    })
    res.on('end', () => {
      try {
        var x = JSON.parse(raw)
        for (var mod in x.modules) {
          if (x.modules[mod] === null) {
            continue
          }
          var f = './src/' + mod + '.js'
          fs.writeFileSync(f, x.modules[mod])
        }
      } catch (err) {
        console.error('end error:', err)
        //console.error(raw)
      }
      done()
    })
  })
  req.on('error', function (e) {
    console.error('request error:', e)
    done(e)
  })
  req.end()
})

// Console access from the shell. Implementation in console-tools.js; usage in
// CLAUDE.md ("Console from the shell") and docs/build-and-deploy.md.
// Env for all three: SCREEPS_WORLD=season|ptr|mmo (default season),
// SCREEPS_SHARD (default per world), SCREEPS_CONSOLE_RAW=1 (no sourcemap/HTML rewrite).

// Stream the console to stdout and logs/console-<world>.log until Ctrl+C.
// SCREEPS_CONSOLE_SECONDS=N stops after N seconds. Rotation: SCREEPS_LOG_MAX_BYTES
// (default 5 MiB), SCREEPS_LOG_KEEP rotated files (default 5).
gulp.task('consoleTail', function () {
  return consoleTools.tail(credentials, { seconds: consoleTools.envInt('SCREEPS_CONSOLE_SECONDS', 0) })
})

// Legacy name: same as consoleTail but stops after 60s unless SCREEPS_CONSOLE_SECONDS is set.
gulp.task('consoleLog', function () {
  return consoleTools.tail(credentials, { seconds: consoleTools.envInt('SCREEPS_CONSOLE_SECONDS', 60) })
})

// Send one expression and print the console output of the tick that answers it.
// Usage: npx gulp console --cmd "Game.time"      or      echo "Game.time" | npx gulp console
// SCREEPS_CONSOLE_TIMEOUT seconds to wait for the result (default 30).
gulp.task('console', function () {
  const expression = consoleTools.expressionFromArgs()
  if (!expression) {
    console.error('Usage: npx gulp console --cmd "<expression>"   (or pipe the expression on stdin)')
    process.exitCode = 1
    return Promise.resolve()
  }
  return consoleTools.runCommand(credentials, expression, {
    timeoutMs: consoleTools.envInt('SCREEPS_CONSOLE_TIMEOUT', 30) * 1000,
    graceMs: consoleTools.envInt('SCREEPS_CONSOLE_GRACE_MS', 500),
  })
})

// Print every object in a room, vision or not (the web client's room-objects
// endpoint): creeps by owner with bodies, then owned and notable structures.
// Usage: npx gulp room --room W25S5        --json dumps the raw response.
// Same SCREEPS_WORLD / SCREEPS_SHARD selection as console.
gulp.task('room', function () {
  const room = consoleTools.roomFromArgs()
  if (!room) {
    console.error('Usage: npx gulp room --room <name> [--json]')
    process.exitCode = 1
    return Promise.resolve()
  }
  return consoleTools.roomObjects(credentials, room, { json: process.argv.includes('--json') })
})

// Decodes Screeps stack trace tokens (module:line:col) back to original TS source
// locations using the sourcemaps produced by `compile`.
// Usage: npx gulp decodeStack --stack "process:60:50 job.hub:12:3"
gulp.task('decodeStack', function () {
  const stackFlagIndex = process.argv.indexOf('--stack')
  const stackArg = stackFlagIndex !== -1 ? process.argv[stackFlagIndex + 1] : undefined
  if (!stackArg) {
    console.error('Usage: npx gulp decodeStack --stack "module:line:col ..."')
    return Promise.resolve()
  }

  const tokens = stackArg.match(/[^\s]+:\d+:\d+/g) || []
  if (tokens.length === 0) {
    console.error('No module:line:col tokens found in --trace')
    return Promise.resolve()
  }

  return Promise.all(tokens.map((token) => {
    const match = token.match(/^(.+):(\d+):(\d+)$/)
    const [, mod, lineStr, colStr] = match
    const mapFile = path.join(__dirname, 'sourcemaps', `${mod}.js.map`)

    if (!fs.existsSync(mapFile)) {
      console.log(`${token} -> no sourcemap found at sourcemaps/${mod}.js.map`)
      return
    }

    const rawMap = JSON.parse(fs.readFileSync(mapFile, 'utf8'))
    return SourceMapConsumer.with(rawMap, null, (consumer) => {
      const pos = consumer.originalPositionFor({
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
      })
      if (pos.source == null) {
        console.log(`${token} -> no matching original position`)
      } else {
        console.log(`${token} -> ${pos.source}:${pos.line}:${pos.column}`)
      }
    })
  }))
})
