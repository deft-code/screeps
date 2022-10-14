

const gulp = require('gulp')
const credentials = require('./credentials.js')
const https = require('https')
const screeps = require('gulp-screeps')
const fs = require('fs')

const ts = require('gulp-typescript');
const tsProject = ts.createProject('tsconfig.json', { typescript: require('typescript') });

gulp.task('compile', [], function () {
    return tsProject.src()
      .pipe(tsProject())
      .on('error', (err) => global.compileFailed = true)
      .js.pipe(gulp.dest('distjs'));
  })

gulp.task('watchCompile', ['compile'], function() {
  return gulp.watch('src/*', ['compile']);
});

gulp.task('clean', function () {
  return gulp.src(['dist/*', 'distjs/*'], { read: false, allowEmpty: true })
    .pipe(clean());
});

gulp.task('deploy', ['compile'], function () {
  gulp.src('distjs/*.js').pipe(screeps(credentials))
})

gulp.task('watch', ['deploy'], function() {
  return gulp.watch('src/*', ['deploy']);
})

gulp.task('sim', function () {
  credentials.branch = 'sim'
  gulp.src('src/*.js').pipe(screeps(credentials))
})

gulp.task('ptr', ['compile'], function () {
  credentials.branch = 'default'
  credentials.ptr = true
  gulp.src('distjs/*.js').pipe(screeps(credentials))
})

gulp.task('watchPtr', ['ptr'], function() {
  return gulp.watch('src/*', ['ptr']);
})

gulp.task('season', ['compile'], function () {
  credentials.branch = 'default'
  credentials.ptr = true
  gulp.src('distjs/*.js').pipe(screeps(credentials))
})


gulp.task('swc', function () {
  credentials.branch = 'default'
  credentials.host = 'swc.screepspl.us'
  credentials.password = 'firsttime'
  gulp.src('src/*.js').pipe(screeps(credentials))
})

gulp.task('plus', function () {
  credentials.branch = 'default'
  credentials.host = 'server1.screepspl.us'
  credentials.password = 'firsttime'
  gulp.src('src/*.js').pipe(screeps(credentials))
})

gulp.task('market', () => {
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
    })
  })
  req.on('error', function (e) {
    console.error('request error:', e)
  })
  req.end()
})

gulp.task('money', () => {
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
    })
  })
  req.on('error', function (e) {
    console.error('request error:', e)
  })
  req.end()
})

gulp.task('fetch', () => {
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
    })
  })
  req.on('error', function (e) {
    console.error('request error:', e)
  })
  req.end()
})
