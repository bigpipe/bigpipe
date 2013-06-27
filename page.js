'use strict';

var Pagelet = require('./pagelet');

/**
 *
 * @constructor
 * @api public
 */
function Page(pipe, options) {
  options = options || {};

  this.pipe = pipe;                         // Pipe wrapper.
  this.connections = Object.create(null);   // Stores active real-time connections.
  this.conditional = [];                    // Pagelets that are conditional.
  this.disabled = {};                       // Disabled pagelets.
  this.enabled = {};                        // Enabled pagelets.

  //
  // Don't allow any further extensions of the object. This improves performance
  // and forces people to stop maintaining state on the "page". As Object.seal
  // impacts the performance negatively, we're just gonna enable it for
  // development only so people will be caught early on.
  //
  if ('development' === this.env) Object.seal(this);
}

/**
 * The HTTP pathname that we should be matching against.
 *
 * @type {String|RegExp}
 * @public
 */
Page.prototype.path = '/';

/**
 * Which HTTP methods should this page accept. It can be a string, comma
 * separated string or an array.
 *
 * @type {String|Array}
 * @public
 */
Page.prototype.method = 'GET';

/**
 * The default status code that we should send back to the user.
 *
 * @type {Number}
 * @public
 */
Page.prototype.statusCode = 200;

/**
 * The environment that we're running this page in. If this is set to
 * `development` It would be verbose.
 *
 * @type {String}
 * @public
 */
Page.prototype.env = (process.env.NODE_ENV || 'development').toLowerCase();

/**
 * The pagelets that need to be loaded on this page.
 *
 * @type {Object}
 */
Page.prototype.pagelets = {};

/**
 * List of resources that can be used by the pagelets.
 *
 * @type {object}
 */
Page.prototype.resources = {};

/**
 * Expose our async flow control library.
 *
 * @type {Object}
 * @public
 */
Page.prototype.async = require('async');

//
// Make's the Page extendable.
//
Page.extend = require('extendable');

//
// Expose the constructor.
//
module.exports = Page;
