'use strict';

var Stream = require('stream');

function Resource() {
  if (!(this instanceof Resource)) return new Resource();
  this.cache = {};
}

/**
 * Invalidate the cache.
 *
 * @api public
 */
Resource.prototype.invalidate = function invalidate() {
  this.cache = {};
  return this;
};

//
// Make the Resource extendable.
//
Resource.extend = require('extendable');

//
// Initialize.
//
module.exports = Resource;
