'use strict';

//
// Required modules.
//
var Expirable = require('expirable');

/**
 * Expirable resource pool constructor.
 *
 * @Constructor
 * @api public
 */
function Pool(options) {
  Expirable.call(this, options);
  this.type = options.type || 'general';
}

//
// Extend the prototype with expirable
//
Pool.prototype = Object.create(Expirable.prototype);
Pool.prototype.constructor = Pool;

//
// Initialize.
//
module.exports = Pool;
