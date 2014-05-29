'use strict';

var debug = require('diagnostics')('bigpipe:pagelet');

//
// Plugin name.
//
exports.name = 'wrap-pagelet';

//
// Server side Pagelet plugin to add additional functionality for BigPipe.
//
exports.server = function (pipe) {
  pipe.on('transform:pagelet', function transform(Pagelet) {
    debug('Transforming base Pagelet %s with methods for BigPipe functionality', Pagelet.prototype.name);

    if (Pagelet.prototype.___bigPiped === true) return;

    /**
     * Prevent double processing.
     *
     * @type {Boolean}
     * @private
     */
    Pagelet.readable('___bigPiped', true);

    /**
     * Add a reference to our the pipe that initialised the Pagelet.
     *
     * @type {Pipe}
     * @public
     */
    Pagelet.readable('pipe', pipe);

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
      this.page = (options || {}).page;

      //
      // Emit a pagelet configuration event so plugins can hook in to this
      // event.
      //
      this.pipe.emit('pagelet:configure', this);

      return this;
    });
  });
};
