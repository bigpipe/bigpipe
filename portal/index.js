'use strict';

var Stream = require('./stream');

/**
 * Portal is a unversal wrapper for real-time frameworks that provides a common
 * interface for server and client interaction.
 *
 * @constructor
 * @param {HTTP.Server} server HTTP or HTTPS server instance.
 * @param {Object} options Configuration
 * @api public
 */
function Portal(server, options) {
  options = options || {};

  this.transporter = null;
  this.encoder = null;
  this.decoder = null;

  this.server = server;
  this.parsers(options.parser);
  this.pathname = options.pathname || '/portal';
  this.Stream = Stream.bind(Stream, this);
  this.connections = Object.create(null);

  this.initialiase(options.transport);
}

Portal.prototype.__proto__ = require('events').EventEmitter;

//
// Lazy read the Portal.js JavaScript client.
//
Object.defineProperty(Portal.prototype, 'client', {
  get: function read() {
    return require('fs').readFileSync('./portal.js', 'utf-8');
  }
});

//
// Expose the current version number.
//
Portal.prototype.version = require('./package.json');

/**
 * Initialise the real-time transport that was choosen.
 *
 * @param {String} transport The name of the transport
 * @api private
 */
Portal.prototype.initialise = function initialise(transport) {
  var Transporter = require('./transporters/'+ (transport || 'ws').toLowerCase());

  this.transporter = new Transporter();
  this.transporter.using(this);

  this.on('connection', function connection(stream) {
    this.connections[stream.id] = stream;
  });

  this.on('disconnected', function disconnected(stream) {
    delete this.connections[stream.id];
  });
};

/**
 * Iterate over the connections.
 *
 * @param {Function} fn
 * @api public
 */
Portal.prototype.forEach = function forEach(fn) {
  for (var stream in this.connections) {
    fn(this.connections[stream], stream);
  }

  return this;
};

/**
 * Install message parsers.
 *
 * @param {String} type Parse name.
 * @api private
 */
Portal.prototype.parsers = function parsers(type) {
  var parser = require('./parsers/'+ (type || 'json').toLowerCase());

  this.encoder = parser.encoder;
  this.decoder = parser.decoder;
};

/**
 * Generate a front-end library.
 *
 * @returns {String} The client side library.
 * @api public
 */
Portal.prototype.library = function compile() {
  var encoder = this.encoder.client || this.encoder
    , decoder = this.decoder.client || this.decoder
    , library = this.transporter.library || ''
    , transport = this.transporter.client
    , client = this.client;

  //
  // Replace some basic content.
  //
  client = client
    .replace('= null; // @import {portal::version}', '"'+ this.version +'"')
    .replace('= null; // @import {portal::transport}', transport.toString())
    .replace('= null; // @import {portal::encoder}', encoder.toString())
    .replace('= null; // @import {portal::decoder}', decoder.toString())
    .replace('= null; // @import {portal::pathname}', this.pathname)
    .replace('/* {portal::library} */', library);

  return client;
};
