'use strict';

var debug = require('debug')('bigpipe:pagelet')
  , predefine = require('predefine')
  , fuse = require('./fuse')
  , path = require('path');

/**
 * A pagelet is the representation of an item, section, column, widget on the
 * page. It's basically a small sandboxed application within your page.
 *
 * @constructor
 * @api public
 */
function Pagelet() {
  var writable = predefine(this, predefine.WRITABLE);

  writable('page', null);   // Reference to the page that generated the pagelet.
  writable('pipe', null);   // Reference to the BigPipe instance.
  writable('id', null);     // Custom ID of the pagelet.
}

fuse(Pagelet, require('stream'));

/**
 * The name of this pagelet so it can checked to see if's enabled. In addition
 * to that, it can be injected in to placeholders using this name.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('name', '');

/**
 * These methods can be remotely called from the client. Please note that they
 * are not set to the client, it will merely be executing on the server side.
 *
 * ```js
 * Pagelet.extend({
 *   RPC: [
 *     'methodname',
 *     'methodname'
 *   [,
 *
 *   methodname: function methodname(reply) {
 *
 *   }
 * });
 *
 * @type {Array}
 * @public
 */
Pagelet.writable('RPC', []);

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
Pagelet.writable('authorize', null);

/**
 * Optional template engine preference. Useful when we detect the wrong template
 * engine based on the view's file name.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('engine', '');

/**
 * Get the params of the Page.
 *
 * @type {Object}
 * @public
 */
Pagelet.readable('params', {
  enumerable: false,
  get: function params() {
    return this.page.params;
  }
}, true);

/**
 * Remove the DOM element if we are unauthorized. This will make it easier to
 * create conditional layouts without having to manage the pointless DOM
 * elements.
 *
 * @type {Boolean}
 * @public
 */
Pagelet.writable('remove', true);

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
Pagelet.writable('view', '');

/**
 * The location of the Style Sheet for this pagelet. It should contain all the
 * CSS that's needed to render this pagelet. It doesn't have to be a `CSS`
 * extension as these files are passed through `smithy` for automatic
 * pre-processing.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('css', '');

/**
 * The location of the JavaScript file that you need for this page. This file
 * needs to be included in order for this pagelet to function.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('js', '');

/**
 * An array with dependencies that your pagelet depends on. This can be CSS or
 * JavaScript files/frameworks whatever. It should be an array of strings
 * which represent the location of these files.
 *
 * @type {Array}
 * @public
 */
Pagelet.writable('dependencies', []);

/**
 * Save the location where we got our resources from, this will help us with
 * fetching assets from the correct location.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('directory', '');

/**
 * Default render function.
 *
 * @param {Function} done callback for async rendering
 * @api public
 */
Pagelet.writable('render', function render(done) {
  setImmediate(done);
});

//
// !IMPORTANT
//
// These function's & properties should never overridden as we might depend on
// them internally, that's why they are configured with writable: false and
// configurable: false by default.
//
// !IMPORTANT
//

/**
 * Check if the given pagelet has been enabled for the page.
 *
 * @param {String} name The name of the pagelet.
 * @api public
 */
Pagelet.readable('enabled', function enabled(name) {
  return this.page.enabled.some(function some(pagelet) {
    return pagelet.name === name;
  });
});

/**
 * Check if the given pagelet has been disabled for the page.
 *
 * @param {String} name The name of the pagelet.
 * @api public
 */
Pagelet.readable('disabled', function disabled(name) {
  return this.page.disabled.some(function some(pagelet) {
    return pagelet.name === name;
  });
});

/**
 * Reset the instance to it's original state.
 *
 * @param {Page} page The page instance which created this pagelet.
 * @api private
 */
Pagelet.readable('configure', function configure(page) {
  this.pipe = page.pipe;
  this.page = page;

  //
  // Set a new id.
  //
  this.id = [1, 1, 1, 1].map(function generator() {
    return Math.random().toString(36).substring(2).toUpperCase();
  }).join('-');

  this.removeAllListeners();

  debug('configuring %s/%s', this.name, this.id);
  return this;
});

/**
 * Renderer takes care of all the data merging and `render` invocation.
 *
 * @param {Function} fn Completion callback.
 * @api private
 */
Pagelet.readable('renderer', function renderer(fn) {
  var page = this.page
    , pagelet = this;

  this.render(function receive(err, data) {
    if (err) debug('rendering %s/%s resulted in a error', pagelet.name, pagelet.id, err);

    //
    // If the response was closed, finished the async asap.
    //
    if (page.res.finished) {
      return fn(new Error('Response was closed, unable to write Pagelet'));
    }

    //
    // The main page and headers were written, flush pagelet immediately.
    //
    if (page.res._headerSent) return page.write(pagelet, data, fn);

    //
    // The main page is not written to the client yet,
    // delay the pagelet and trigger the callback.
    //
    page.queue.push(page.write.bind(page, pagelet, data));
    fn();
  });
});

/**
 * Trigger a RPC function.
 *
 * @param {String} method The name of the method.
 * @param {Array} args The function arguments.
 * @param {String} id The RPC id.
 * @param {SubStream} substream The substream that does RPC.
 * @returns {Boolean} The event was triggered.
 * @api private
 */
Pagelet.readable('trigger', function trigger(method, args, id, substream) {
  var index = this.RPC.indexOf(method)
    , err;

  if (!~index) {
    debug('%s/%s received an unknown method `%s`, ignorning rpc', this.name, this.id, method);
    return substream.write({
      args: [new Error('The given method is not allowed as RPC function.')],
      type: 'rpc',
      id: id
    });
  }

  var fn = this[this.RPC[index]]
    , pagelet = this;

  if ('function' !== typeof fn) {
    debug('%s/%s method `%s` is not a function, ignoring rpc', this.name, this.id, method);
    return substream.write({
      args: [new Error('The called method is not an RPC function.')],
      type: 'rpc',
      id: id
    });
  }

  //
  // We've found a working function, assume that function is RPC compatible
  // where it accepts a `returns` function that receives the arguments.
  //
  fn.apply(this, [function returns() {
    var args = Array.prototype.slice.call(arguments, 0)
      , success = substream.write({ type: 'rpc', args: args, id: id });

    return success;
  }].concat(args));

  return true;
});

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
