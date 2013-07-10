'use strict';

var path = require('path');

/**
 * A simple pagelet.
 *
 * @constructor
 * @api public
 */
function Pagelet() {
  this.page = null;
  this.id = null;
}

Pagelet.prototype.__proto__ = require('stream').prototype;

/**
 * The name of this pagelet so it can checked to see if's enabled. In addition
 * to that, it can be injected in to placeholders using this name.
 *
 * @type {String}
 * @public
 */
Pagelet.prototype.name = '';

/**
 * An authorization handler to see if the request is authorized to interact with
 * this pagelet. This is set to `null` by default as there isn't any
 * authorization in place. The authorization function will receive 2 arguments:
 *
 * - req, the http request that initialized the pagelet
 * - done, a callback function that needs to be called with only a boolean.
 *
 * ```js
 * Pagelet.extend({
 *   authorize: function authorize(req, done) {
 *     done(true); // True indicates that the request is authorized for access.
 *   }
 * });
 * ```
 *
 * @type {Function}
 * @public
 */
Pagelet.prototype.authorize = null;

/**
 * The location of your view template. But just because you've got a view
 * template it doesn't mean we will render it. It depends on how the pagelet is
 * called. If it's called from the client side we will only forward the data to
 * server.
 *
 * As a user you need to make sure that your template runs on the client as well
 * as on the server side.
 *
 * @type {String}
 * @public
 */
Pagelet.prototype.view = '';

/**
 * The location of the StyleSheet for this pagelet. It should contain all the
 * CSS that's needed to render this pagelet.
 *
 * @type {String}
 * @public
 */
Pagelet.prototype.css = '';

/**
 * The location of the JavaScript file that you need for this page. This file
 * needs to be included in order for this pagelet to function.
 *
 * @type {String}
 * @public
 */
Pagelet.prototype.js = '';

/**
 * An array with dependencies that your pagelet depends on. This can be CSS or
 * JavaScript files/frameworks what evers. It should be an array of strings
 * which represent the location of these files.
 *
 * @type {Array}
 * @public
 */
Pagelet.prototype.dependencies = [];

/**
 * Initialization function that is called when the pagelet is activated. This is
 * done AFTER any of the authorization hooks are handled. So your sure that this
 * pagelet is allowed for usage.
 *
 * @type {Function}
 * @public
 */
Pagelet.prototype.initialize = function initialize() {};

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

  return this.removeAllListeners();
};

//
// Make the Pagelet extendable.
//
Pagelet.extend = require('extendable');

//
// Expose the pagelet.
//
module.exports = Pagelet;
