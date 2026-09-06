

const gulp = require('gulp')
const credentials = require('./credentials.js')
const https = require('https')
const screeps = require('gulp-screeps')
const fs = require('fs')
const path = require('path')
const { ScreepsHttpClient } = require('screeps-api')
const del = require('del')

const ts = require('gulp-typescript');
const tsProject = ts.createProject('tsconfig.json', { typescript: require('typescript') });
const sourcemaps = require('gulp-sourcemaps');
const { SourceMapConsumer } = require('source-map');

gulp.task('compile', function () {
    return tsProject.src()
      .pipe(sourcemaps.init())
      .pipe(tsProject())
      .on('error', (err) => global.compileFailed = true)
      .js
      .pipe(sourcemaps.write('../sourcemaps', { addComment: false }))
      .pipe(gulp.dest('distjs'));
  })

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

// Screeps only streams console output live over a websocket (no history API),
// so this connects, records for a fixed window, then saves what it captured.
// Usage: npx gulp consoleLog
// Options (env vars): SCREEPS_CONSOLE_SECONDS=60 SCREEPS_WORLD=season|ptr|mmo
gulp.task('consoleLog', function () {
  const seconds = parseInt(process.env.SCREEPS_CONSOLE_SECONDS || '60', 10)
  const world = process.env.SCREEPS_WORLD || 'season'

  const serverConfig = {
    hostname: 'screeps.com',
    secure: true,
    token: credentials.token,
  }
  if (world === 'season') serverConfig.season = true
  if (world === 'ptr') serverConfig.ptr = true

  const api = new ScreepsHttpClient(serverConfig)

  const lines = []
  function record(line) {
    console.log(line)
    lines.push(line)
  }

  api.socket.subscribeUserConsole(({ data: { shard, error, messages } }) => {
    const tag = shard ? `[${shard}] ` : ''
    if (error) record(`${tag}ERROR: ${error}`)
    if (!messages) return
    messages.log.forEach(l => record(tag + l))
    messages.results.forEach(r => record(`${tag}< ${r}`))
  })

  return api.socket.connect()
    .then(() => {
      console.log(`Capturing console output from the ${world} world for ${seconds}s...`)
      return new Promise((resolve) => setTimeout(resolve, seconds * 1000))
    })
    .then(() => {
      api.socket.disconnect()
      const dir = path.join(__dirname, 'logs')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, `console-${world}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`)
      fs.writeFileSync(file, lines.join('\n') + '\n')
      console.log(`Saved ${lines.length} lines to ${file}`)
    })
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
