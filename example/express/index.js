'use strict';

/**
 * Attaching it to a server, for example express:
 */
var express = require('express')
  , app = express()
  , server = require('http').createServer(app);

var middleware = require('../../').attach(server, {
  pages: './page'
});

app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({ secret: 'pagelet' }));
app.use(express.csrf());
app.use(middleware);

server.listen(8080);
