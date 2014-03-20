'use strict';

/**
 * Added BigPipe specific methods to the Pagelet.
 *
 * @param {Function} Pagelet The Pagelet constructor
 * @returns {Pagelet}
 * @api private
 */
module.exports = function sugar(Pagelet) {
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
   * Get route parameters that we've extracted from the route.
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
   * Add references to the page and pipe instance.
   *
   * @param {Object} options
   * @api private
   */
  Pagelet.readable('init', function init(options) {
    options = options || {};

    this.pipe = options.page.pipe || options.pipe;
    this.page = options.page;

    //
    // Emit a pagelet configuration event so plugins can hook in to this.
    //
    this.pipe.emit('pagelet::configure', this);

    return this;
  });

  return Pagelet;
};
