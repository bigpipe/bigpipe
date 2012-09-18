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
 * @param {String} pagelet name of the pagelet that should receive this message
 * @param {String} event name of the event that needs to emitted
 * @param {Array} args arguments for the invocation
 * @returns {String}
 */
Engine.prototype.encode = function encode(pagelet, event, args) {
  try {
    return JSON.stringify({
        pagelet: pagelet
      , event: event
      , args: args
    });
  } catch (e) { return ''; }
};

/**
 * Decode a message from the client.
 *
 * @param {String} msg
 * @returns {Object}
 */
Engine.prototype.decode = function decode(msg) {
  try { return JSON.parse(msg); }
  catch (e) { return ''; }
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
  // Attach the real-time connection to the correct page instance.
  var id = this.fetchSession(socket) + ':get' + this.fetchPage(socket)
    , page = this.pages.get(id)
    , self = this;

  // if we don't have a page, we are going to ignore this for now.
  if (!page) return socket.close();

  /**
   * The established connection has been closed, either by us or by the user.
   */
  socket.on('close', function close() {
    // The connection has been closed, if it's not connected within 5 minutes,
    // remove the reference to the page.
    self.page.expire(id, '5 minutes');
    page.disconnect(socket);

    page = null;
  });

  /**
   * Received a message from the server.
   *
   * @param {String} msg encoded message
   */
  socket.on('message', function message(msg) {
    msg = self.decode(msg);
    if (!msg) return;

    // dispatch the message
    // @TODO validate the message
    page.receive(msg.pagelet, msg.event, msg.args);
  });

  /**
   * Handle potential errors of the connection.
   *
   * @param {Error} err
   */
  socket.on('error', function error(err) {
    page.emit('engine:error', err);
  });

  /**
   * Send the event to the browser.
   *
   * @returns {Boolean} success
   */
  socket.trigger = function trigger() {
    var msg = self.encode.apply(this, arguments);

    if (!msg) return false;
    return socket.send(msg);
  };

  // We have an active page, make sure it doesn't expire from our internal
  // cache.
  this.page.expire(id, Infinity);
  page.connect(socket);
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

  return 'never-gonna-get-you-up';
};

Engine.extend = require('extendable');
