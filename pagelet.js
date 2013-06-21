'use strict';

function Pagelet(page) {
  this.page = page;
}

/**
 * The name of this pagelet so it can checked to see if's enabled. In addition
 * to that, it can be injected in to placeholders using this name.
 *
 * @public
 */
Pagelet.prototype.name = '';

/**
 * Check if the given pagelet has been enabled for the page.
 *
 * @api public
 */
Pagelet.prototype.enabled = function enabled(name) {
  return name in this.page.enabled;
};

/**
 * Check if the given pagelet has been enabled for the page.
 *
 * @api public
 */
Pagelet.prototype.disabled = function disabled(name) {
  return name in this.page.disabled;
};

//
// Make the Pagelet extendable.
//
Pagelet.extend = require('extendable');

//
// Expose the pagelet.
//
module.exports = Pagelet;
