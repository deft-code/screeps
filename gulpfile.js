
const gulp = require('gulp');
const credentials = require('./credentials.js');
const https = require('https');
const fs = require('fs');

gulp.task('fetch', function() {
  const options = {
    hostname: 'screeps.com',
    port: '443',
    path: '/api/user/code',
    method: 'GET',
    auth: credentials.email + ':' + credentials.password,
  }

  const req = https.request(options, function(res) {
    fs.mkdirSync('src');
    var raw = '';
    res.on('data', function(chunk) {
      raw += chunk
    });
    res.on('end', function() {
      var x = JSON.parse(raw);
      for (var mod in x.modules) {
        if(x.modules[mod] === null) {
          continue;
        }
        var f = './src/' + mod + '.js';
        fs.writeFile(f, x.modules[mod]);
      }
    });
  });
  req.on('error', function(e) {
    console.error(e)
  });
  req.end();
});
