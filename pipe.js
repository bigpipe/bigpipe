/*globals Primus */
'use strict';

/**
 *
 * @constructor
 * @param {String} server The server address we need to connect to.
 * @param {Object} options Pipe configuration
 * @api public
 */
function Pipe(server, options) {
  options = options || {};

  this.stream = null;     // Reference to the connected Primus socket.

  Primus.EventEmitter.call(this);
  this.connect(server, options.primus);
}

//
// Inherit from Primus's EventEmitter.
//
Pipe.prototype = new Primus.EventEmitter();
Pipe.prototype.constructor = Pipe;

/**
 * A new Pagelet is flushed by the server. We should register it and update the
 * content.
 *
 * @param {Object} pagelet Pagelet configuration.
 * @api public
 */
Pipe.prototype.arrive = function arrive(pagelet) {
  return this;
};

/**
 * Setup a real-time connection to the pagelet server.
 *
 * @param {String} url The server address.
 * @param {Object} options The primus configuration.
 * @api private
 */
Pipe.prototype.connect = function connect(url, options) {
  this.stream = new Primus(url, options);
};
