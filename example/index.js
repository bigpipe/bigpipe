'use strict';

var BigPipe = require('../');

var pipe = BigPipe.createServer(8080, {
  threshold: '10%',
  pages: __dirname +'/pages'
});
