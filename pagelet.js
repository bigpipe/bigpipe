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
  this.pipe = null;
  this.id = null;
}

Pagelet.prototype = Object.create(require('stream').prototype, {
  constructor: {
    value: Pagelet,
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * The name of this pagelet so it can checked to see if's enabled. In addition
   * to that, it can be injected in to placeholders using this name.
   *
   * @type {String}
   * @public
   */
  name: {
    value: '',
    writable: true,
    enumerable: false,
    configurable: true
  },

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
  authorize: {
    value: null,
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * Optional template engine preference. Useful when we detect the wrong template
   * engine based on the view's file name.
   *
   * @type {String}
   * @public
   */
  engine: {
    value: '',
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * Remove the DOM element if we are unauthorized. This will make it easier to
   * create conditional layouts without having to manage the pointless DOM
   * elements.
   *
   * @type {Boolean}
   * @public
   */
  remove: {
    value: true,
    writable: true,
    enumerable: false,
    configurable: true
  },

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
  view: {
    value: '',
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * The location of the Style Sheet for this pagelet. It should contain all the
   * CSS that's needed to render this pagelet.
   *
   * @type {String}
   * @public
   */
  css: {
    value: '',
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * The location of the JavaScript file that you need for this page. This file
   * needs to be included in order for this pagelet to function.
   *
   * @type {String}
   * @public
   */
  js: {
    value: '',
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * An array with dependencies that your pagelet depends on. This can be CSS or
   * JavaScript files/frameworks whatever. It should be an array of strings
   * which represent the location of these files.
   *
   * @type {Array}
   * @public
   */
  dependencies: {
    value: [],
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * Save the location where we got our resources from, this will help us with
   * fetching assets from the correct location.
   *
   * @type {String}
   * @public
   */
  directory: {
    value: '',
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * Initialization function that is called when the pagelet is activated. This is
   * done AFTER any of the authorization hooks are handled. So your sure that this
   * pagelet is allowed for usage.
   *
   * @type {Function}
   * @public
   */
  initialize: {
    value: function initialize() {},
    writable: true,
    enumerable: false,
    configurable: true
  },

  //
  // !IMPORTANT
  //
  // Function's should never overridden as we might depend on them internally,
  // that's why they are configured with writable: false and configurable: false
  // by default.
  //
  // !IMPORTANT
  //

  /**
   * Check if the given pagelet has been enabled for the page.
   *
   * @param {String} name The name of the pagelet.
   * @api public
   */
  enabled: {
    enumerable: false,
    value: function enabled(name) {
      return this.page.enabled.some(function some(pagelet) {
        return pagelet.name === name;
      });
    }
  },

  /**
   * Check if the given pagelet has been disabled for the page.
   *
   * @param {String} name The name of the pagelet.
   * @api public
   */
  disabled: {
    enumerable: false,
    value: function disabled(name) {
      return this.page.disabled.some(function some(pagelet) {
        return pagelet.name === name;
      });
    }
  },

  /**
   * Simple emit wrapper that returns a function that emits an event once it's
   * called.
   *
   * ```js
   * page.on('close', pagelet.emits('close'));
   * ```
   *
   * @param {String} event Name of the event that we should emit.
   * @param {Function} parser Argument parser.
   * @api public
   */
  emits: {
    enumerable: false,
    value: function emits(event, parser) {
      var self = this;

      return function emit(arg) {
        self.emit(event, parser ? parser.apply(self, arguments) : arg);
      };
    }
  },

  /**
   * Access a resource.
   *
   * @TODO re-use
   * @param {String} name The resource
   * @api public
   */
  resource: {
    enumerable: false,
    value: function get(name) {
      var resource;

      if (name in this.resources) resource = new this.resources[name];
      else resource = new this.page.resources[name];

      resource.configure(this.page.req, this.page.res);
      return resource;
    }
  },

  /**
   * Reset the instance to it's original state.
   *
   * @param {Page} page The page instance which created this pagelet.
   * @api private
   */
  configure: {
    enumerable: false,
    value: function configure(page) {
      this.pipe = page.pipe;
      this.page = page;

      //
      // Set a new id.
      //
      this.id = [1, 1, 1, 1].map(function generator() {
        return Math.random().toString(36).substring(2).toUpperCase();
      }).join('-');

      return this.removeAllListeners();
    }
  },

  /**
   * Default render function.
   *
   * @param {Function} done callback for async rendering
   * @api public
   */
  render: {
    enumerable: false,
    value: function render(done) {
      setImmediate(done);
    }
  }
});

//
// Make the Pagelet extendable. This allows us to use:
//
// ```js
// Pagelet.extend({
//   prop: value
// });
// ```
//
// For extending the prototypes, just like you're used to in Backbone.
//
Pagelet.extend = require('extendable');

//
// Expose the Pagelet on the exports and parse our the directory. This ensures
// that we can properly resolve all relative assets:
//
// ```js
// Pagelet.extend({
//   ..
// }).on(module);
// ```
//
Pagelet.on = function on(module) {
  this.prototype.directory = this.prototype.directory || path.dirname(module.filename);
  module.exports = this;

  return this;
};

//
// Expose the pagelet.
//
module.exports = Pagelet;
