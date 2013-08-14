'use strict';

function Resource() {
  if (!(this instanceof Resource)) return new Resource();
}

Resource.prototype = Object.create(require('stream').prototype, {
  constructor: {
    value: Resource,
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * Simple lookup table that caches responses so we're not doing duplicate
   * lookups of data. If people don't want to have their shit cached. They
   * should set it to `undefined` explicitly.
   *
   * @type {Object}
   * @public
   */
  cache: {
    value: [],
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * Simple state that people can manipulate which perists untill the resource
   * has been destroyed.
   *
   * @ptype {Mixed}
   * @public
   */
  state: {
    value: null,
    writable: true,
    enumerable: false,
    configurable: true
  },

  //
  // !IMPORTANT
  //
  // Function's should never overriden as we might depend on them internally,
  // that's why they are configured with writable: false and configurable: false
  // by default.
  //
  // !IMPORTANT
  //

  /**
   * Invalidate the cache all other get requests will now bypass the cache. It
   * needs to set the cache to a `false` value. We're not allowed to set it to
   * `undefined` as that's the indication that the user doesn't want to use any
   * resource caching.
   *
   * @api private
   */
  invalidate: {
    enumerable: false,
    value: function invalidate() {
      this.cache = null;
    }
  },

  /**
   * Get a new value from the resource.
   *
   * @param {Mixed} data The query or data we need to retrieve.
   * @param {Function} fn The callback.
   * @api public
   */
  get: {
    enumerable: false,
    value: function get(data, fn) {
      if (this.sync) this.sync('read', data, fn);
      this.emit('read');
    }
  },

  /**
   * Receive the data once and remove it.
   *
   * @param {Mixed} data The data that we want to retrieve and delete.
   * @param {Function} fn The callback.
   * @api public
   */
  once: {
    enumerable: false,
    value: function once(data, fn) {
      var resource = this;

      this.get(data, function get(err, found) {
        if (!found) return fn(err, found);

        resource.del(data, function deleted(fail) {
          fn(err || fail, found);
        });
      });
    }
  },

  /**
   * Update a value in the resource.
   *
   * @param {Mixed} data The data that needs to be updated.
   * @param {Function} fn The callback.
   * @api public
   */
  set: {
    enumerable: false,
    value: function set(data, fn) {
      if (this.sync) this.sync('update', data, fn);
      this.emit('update');
    }
  },

  /**
   * Remove a value in the resource.
   *
   * @param {Mixed} data The data that needs to be removed.
   * @param {Function} fn The callback.
   * @api public
   */
  del: {
    enumerable: false,
    value: function deletes(data, fn) {
      if (this.sync) this.sync('delete', data, fn);
      this.emit('delete');
    }
  },

  /**
   * Configure the resource.
   *
   * @api private
   */
  configure: {
    enumerable: false,
    value: function configure(req, res) {
      this.cache.length = 0;

      if (this.initialise) {
        this.initialise(req, res);
      } else {
        this.sync('create', req, function noop() {});
      }
    }
  }
});

//
// Make the Resource extendable.
//
Resource.extend = require('extendable');

//
// Expose the Resource on the exports through the same interface as we're doing
// with Pagelet and Page constructors
//
// ```js
// Resource.extend({
//   ..
// }).on(module);
// ```
//
Resource.on = function on(module) {
  module.exports = this;
  return this;
};

//
// Initialize.
//
module.exports = Resource;
