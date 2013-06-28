'use strict';

var path = require('path');

function Pagelet() {
  this.page = null;
  this.id = null;
}

Pagelet.prototype.__proto__ = require('stream').prototype;

/**
 * The name of this pagelet so it can checked to see if's enabled. In addition
 * to that, it can be injected in to placeholders using this name.
 *
 * @public
 */
Pagelet.prototype.name = '';

/**
 * An authorization handler to see if the request is authorized to interact with
 * this pagelet.
 *
 * @type {Function}
 * @public
 */
Pagelet.prototype.authorize = null;

/**
 * Initialization function that is called when the pagelet is activated. This is
 * done AFTER any of the authorization hooks are handled. So your sure that this
 * pagelet is allowed for usage.
 *
 * @type {Function}
 * @public
 */
Pagelet.prototype.initialize = null;

/**
 * Save the location where we got our resources from, this will help us with
 * fetching assets from the correct location.
 *
 * @type {String}
 * @public
 */
Pagelet.prototype.directory = path.dirname(process.mainModule.filename);

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

/**
 * Reset the instance to it's orignal state.
 *
 * @param {Page} page The page instance which created this pagelet.
 * @api private
 */
Pagelet.prototype.configure = function configure(page) {
  this.page = page;

  //
  // Set a new id.
  //
  this.id = [1, 1, 1, 1].map(function generator() {
    return Math.random().toString(36).substring(2).toUpperCase();
  }).join('-');

  this.removeAllListeners();
};

//
// Make the Pagelet extendable.
//
Pagelet.extend = require('extendable');

//
// Expose the pagelet.
//
module.exports = Pagelet;
