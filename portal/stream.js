'use strict';

/**
 * The representation of a single connection.
 *
 * @constructor
 * @param {Portal} portal Reference to the portal server. (Set using .bind)
 * @param {Object} headers The request headers for this connection.
 * @param {Object} address The remoteAddress and port.
 * @api public
 */
function Stream(portal, headers, address) {
  this.portal = portal;     // References to the portal.
  this.headers = headers;   // The request headers.
  this.address = address;   // The remote address.

  this.writable = true;     // Silly stream compatiblity.
  this.readable = true;     // Silly stream compatiblity.

  this.initialise();
}

Stream.prototype.__proto__ = require('events').EventEmitter.prototype;

/**
 * Attach hooks and automatically announce a new connection.
 *
 * @api private
 */
Stream.prototype.initialise = function initialise() {
  var portal = this.portal
    , socket = this;

  //
  // We've received new data from our client, decode and emit it.
  //
  this.on('portal::data', function message(data) {
    portal.decoder(data, function decoding(err, packet) {
      //
      // Do a "save" emit('error') when we fail to parse a message. We don't
      // want to throw here as listening to errors should be optional.
      //
      if (err) return socket.listeners('error').length && socket.emit('error', err);
      socket.emit('data', packet);
    });
  });

  //
  // The client has disconnected.
  //
  this.on('portal::end', function disconnect() {
    socket.emit('end');
    socket.removeAllListeners();
  });

  //
  // Announce a new connection.
  //
  process.nextTick(function tick() {
    portal.emit('connection', this);
  });
};

/**
 * Simple emit wrapper that returns a function that emits an event once it's
 * called. This makes it easier for transports to emit specific events. The
 * scope of this function is limited as it will only emit one single argument.
 *
 * @param {String} event Name of the event that we should emit.
 * @param {Function} parser Argument parser.
 * @api public
 */
Stream.prototype.emits = function emits(event, parser) {
  var socket = this;

  return function emit(arg) {
    var data = parser ? parser.apply(socket, arguments) : arg;

    socket.emit('portal::'+ event, data);
  };
};

/**
 * Send a new message to a given socket.
 *
 * @param {Mixed} data The data that needs to be written.
 * @returns {Boolean} Always returns true.
 * @api public
 */
Stream.prototype.write = function write(data) {
  var socket = this;

  this.portal.encoder(data, function encoded(err, packet) {
    //
    // Do a "save" emit('error') when we fail to parse a message. We don't
    // want to throw here as listening to errors should be optional.
    //
    if (err) return socket.listeners('error').length && socket.emit('error', err);
    socket.emit('data', packet);
  });

  return true;
};

/**
 * End the connection.
 *
 * @api private
 */
Stream.prototype.end = function end() {
  this.emit('end');
  this.removeAllListeners();
};

//
// Expose the module.
//
module.exports = Stream;
