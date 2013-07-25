'use strict';

var BigPipe = require('../');

var pipe = BigPipe.createServer(8080, {
  directory: __dirname +'/dist',
  pages: __dirname +'/pages'
});
