'use strict';

/**
 * A real-time transporter.
 *
 * @constructor
 * @api public
 */
function Transporter() {
  this.portal = null;
}

/**
 * Attach the transporter to a portal.
 *
 * @param {Portal} portal Portal instance that uses this transport.
 * @api private
 */
Transporter.prototype.using = function using(portal) {
  this.pathname = portal.pathname;
  this.server = portal.server;
  this.portal = portal;

  this.create();
  return this;
};

//
// Make the transporter extendable.
//
Transporter.extend = require('extendable');

//
// Expose the transporter.
//
module.exports = Transporter;
