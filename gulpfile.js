
const gulp = require('gulp')
const credentials = require('./credentials.js')
const https = require('https')
const screeps = require('gulp-screeps')
const fs = require('fs')

gulp.task('deploy', function () {
  gulp.src('src/*.js').pipe(screeps(credentials))
})

gulp.task('sim', function () {
  credentials.branch = 'sim'
  gulp.src('src/*.js').pipe(screeps(credentials))
})

gulp.task('ptr', function () {
  credentials.branch = 'default'
  credentials.ptr = true
  gulp.src('src/*.js').pipe(screeps(credentials))
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
