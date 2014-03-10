'use strict';

//
// Required modules.
//
var debug = require('debug')('bigpipe:pagelet');
exports.name = 'test';
exports.server = function server(bigpipe) {
bigpipe.on('transform::pagelet', function (Pagelet) {

/**
 * Check if the given pagelet has been enabled for the page.
 *
 * @param {String} name The name of the pagelet.
 * @api public
 */
if (!Pagelet.prototype.enabled) Pagelet.readable('enabled', function enabled(name) {
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
if (!('disabled' in Pagelet.prototype)) Pagelet.readable('disabled', function disabled(name) {
  return this.page.disabled.some(function some(pagelet) {
    return pagelet.name === name;
  });
});

/**
 * Get route parameters that we've extracted from the route.
 *
 * @type {Object}
 * @public
 */
if (!('params' in Pagelet.prototype)) Pagelet.readable('params', {
  enumerable: false,
  get: function params() {
    return this.page.params;
  }
}, true);


/**
 * Renderer takes care of all the data merging and `render` invocation.
 *
 * @param {Function} fn Completion callback.
 * @api private
 */
if (!('renderer' in Pagelet.prototype)) Pagelet.readable('renderer', function renderer(fn) {
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

    page.write(pagelet, data, fn);
  });
});

//
// Extend the default Pagelet.
//
Pagelet.extend({
  /**
   * Add references to the page and pipe instance.
   *
   * @param {Object} options
   * @api private
   */
  configure: function configure(options) {
    options = options || {};

    this.pipe = options.page.pipe || options.pipe;
    this.page = options.page;

    return this;
  }
});
  console.log(Pagelet);

});
};
