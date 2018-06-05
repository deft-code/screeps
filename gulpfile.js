
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

gulp.task('fetch', function () {
  const options = {
    hostname: 'screeps.com',
    port: '443',
    path: '/ptr/api/user/code',
    method: 'GET',
    auth: credentials.email + ':' + credentials.password
  }

  const req = https.request(options, function (res) {
    var raw = ''
    res.on('data', function (chunk) {
      raw += chunk
    })
    res.on('end', function () {
      try {
        var x = JSON.parse(raw)
        for (var mod in x.modules) {
          if (x.modules[mod] === null) {
            continue
          }
          var f = './src/' + mod + '.js'
          fs.writeFile(f, x.modules[mod])
        }
      } catch (err) {
        console.error(err)
        console.error(raw)
      }
    })
  })
  req.on('error', function (e) {
    console.error(e)
  })
  req.end()
})
