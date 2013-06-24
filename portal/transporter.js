'use strict';

/**
 * A real-time transporter.
 *
 * @constructor
 * @api public
 */
function Transporter() {
  this.portal = null;
  this.service = null;
}

Transporter.prototype.__proto__ = require('events').EventEmitter.prototype;

/**
 * Attach the transporter to a portal.
 *
 * @param {Portal} portal Portal instance that uses this transport.
 * @api private
 */
Transporter.prototype.using = function using(portal) {
  this.portal = portal;
  this.initialise();

  return this;
};

Transporter.prototype.initialise = function initialise() {
  var transporter = this;

  //
  // Create a server.
  //
  this.server();

  this.portal.server
    .on('request', this.request.bind(this))
    .on('upgrade', this.upgrade.bind(this));
};

Transporter.prototype.request = function request(req, res) {
  this.emit('portal::request', req, res);
};

Transporter.prototype.upgrade = function upgrade(req, res, head) {
  this.emit('portal::upgrade');
};

//
// Make the transporter extendable.
//
Transporter.extend = require('extendable');

//
// Expose the transporter.
//
module.exports = Transporter;
