'use strict';

var engine = require('engine.io')
  , _ = require('lodash');

function Engine(http, options) {
  // Extend the options with some defaults
  _.extend(options || {}, {
      path: '/pagelets'     // path for the requests to enter the server
    , resource: 'default'   // default resource
    , cookie: 'pagelet'     // name of the cookie for persistent ids
  });

  this.server = engine.attach(http, options);
  this.server.on('connection', this.connection.bind(this));
}

/**
 * Encode a message so it can be send to the client.
 *
 * @param {String} msg
 */
Engine.prototype.encode = function encode(msg) {

};

/**
 * Decode a message from the client.
 *
 * @param {String} msg
 */
Engine.prototype.decode = function decode(msg) {

};

Engine.prototype.socket = function socket(id) {
  return this.server.clients[id];
};

Engine.prototype.connection = function connection(socket) {
  socket.on('close');
  socket.on('message');
  socket.on('error');
  socket.on('flush');
  socket.on('drain');
};

Engine.extend = require('extendable');
