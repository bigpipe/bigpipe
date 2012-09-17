/*global unescape:true */

'use strict';

var engine = require('engine.io')
  , _ = require('lodash')
  , url = require('url');

/**
 * Engine.io wrapper.
 *
 * @constructor
 * @param {HTTP.Server} http
 * @param {Object} options
 */
function Engine(http, options) {
  // Extend the options with some defaults
  _.extend(options || {}, {
      path: '/pagelets'     // Path for the requests to enter the server.
    , resource: 'default'   // Default resource.
    , cookie: 'pagelet'     // Name of the cookie for persistent ids.
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

/**
 * Get the socket.
 *
 * @param {String} id
 */
Engine.prototype.socket = function socket(id) {
  return this.server.clients[id];
};

/**
 * Handle engine.io connections.
 *
 * @param {Socket} socket engine.io socket
 */
Engine.prototype.connection = function connection(socket) {
  // Attach the real-time connection to the correct pagelet instance.
  var page = this.fetchPage(socket)
    , id = this.fetchSession(socket)
    , pagelet = this.pagelet.get(id + ':' + page)
    , self;

  socket.on('close', function close() {
    // The connection has been closed, if it's not connected within 5 minutes,
    // remove the reference to the pagelet.
    self.pagelet.expire(id + ':' + page, '5 minutes');
    pagelet = null;
  });

  socket.on('message');
  socket.on('error');
};

/**
 * Fetch the current connected page from the socket so we know from where we
 * connected from.
 *
 * @param {HTTP.Request} socket
 */
Engine.prototype.fetchPage = function fetchPage(socket) {
  var req = socket.request;

  if (req.headers.referrer) return url.parse(req.headers.referrer).pathname;
  return req.query.pathname;
};

/**
 * Fetch the session id from the connection.
 *
 * @param {HTTP.Request} socket
 */
Engine.prototype.fetchSession = function fetchSession(socket) {
  var req = socket.request
    , id = /connect.sid\=([^;]+)/g.exec(req.headers.cookie);

  if (id && id.length) {
    return unescape(id[1]).split('.')[0].slice(2);
  }

  return 'never-gonna-match-you-up';
};

Engine.extend = require('extendable');
