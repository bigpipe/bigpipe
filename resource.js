'use strict';

var shared = require('./shared')
  , rest = ['get', 'post', 'put', 'delete'];

function Resource() {
  if (!(this instanceof Resource)) return new Resource();
}

Resource.prototype = Object.create(require('stream').prototype, shared.mixin({
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
   * @type {Array}
   * @public
   */
  cache: {
    value: [],
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * Simple state that people can manipulate which persists until the resource
   * has been destroyed.
   *
   * @type {Mixed}
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
  // Function's should never overridden as we might depend on them internally,
  // that's why they are configured with writable: false and configurable: false
  // by default.
  //
  // !IMPORTANT
  //

  /**
   * GET proxy, which will call the provided or default GET and
   * emit the READ status on completion. This requires any custom state methods
   * to accept a callback as last argument.
   *
   * @param {String} method GET, POST, PUT, DELETE
   * @api private
   */
  proxyMethod: {
    enumerable: false,
    value: function proxyMethod(method) {
      return function callback() {
        var args = Array.prototype.slice.apply(arguments)
          , fn = args.pop();

        //
        // Call cache proxy and provide custom callback to excert control.
        //
        args.push(this.proxy(fn));
        if (method in this) return this['_' + method].apply(this, args);

        //
        // Call the REST method if implemented or return the callback with error.
        //
        this.proxy(fn).call(this, new Error(
          'unable to call ' + method + ' on the resource'
        ));
      };
    }
  },

  /**
   * Proxy method to channel all callbacks from resources through, this will
   * expose Error objects only if manipulation of resources fails and will make
   * sure callbacks are async.
   *
   * @param {Funtion} fn callback
   * @api private
   */
  proxy: {
    enumerable: false,
    value: function proxy(fn) {
      /**
       * Last callback before arguments are returned to the orginal callee.
       *
       * @param {Mixed} error error message
       * @param {Mixed} data
       * @api private
       */
      return function final(error, data) {
        if (error && !(error instanceof Error)) error = new Error(error);

        //
        // Defer callbacks so resource are always async.
        //
        process.nextTick(function callback() {
          fn(error, data);
        });
      };
    }
  },

  /**
   * Return array indices which have object in accordance with the object
   *
   * @param {Object} query
   * @returns {Array} of indices
   * @api private
   */
  find: {
    enumerable: false,
    value: function find(query) {
      var cache = this.cache
        , indices = [];

      //
      // Return empty list of indices if nothing is cached.
      //
      if ('object' !== typeof query || !cache) return indices;

      //
      // Extract matching indices from the cache.
      //
      return cache.reduce(function where(list, object, i) {
        var matches = Object.keys(query).reduce(function check(result, control) {
          result.push(control in object && query[control] === object[control]);
          return result;
        }, []);

        //
        // Only include the indice if every queried key matched.
        //
        if(matches.length === matches.filter(Boolean).length) list.push(i);
        return list;
      }, []);
    }
  },

  /**
   * Return objects in cache that match the indices in the list.
   *
   * @param {Array} list of indices
   * @returns {Array} cached objects in correspondence with indices
   * @api private
   */
  aquire: {
    enumerable: false,
    value: function aquire(list) {
      return (this.cache || []).reduce(function filter(stack, value, i) {
        if (~list.indexOf(i)) stack.push(value);
        return stack;
      }, []);
    }
  },

  /**
   * GET from cache or proxy to user implemented GET method.
   *
   * @type {Function}
   * @public
   */
  _get: {
    enumerable: false,
    value: function _get(query, fn) {
      var self = this
        , cache = this.aquire(this.find(query));

      //
      // Values were found in cache return cached values.
      //
      if (cache.length) return fn(null, cache);

      //
      // Tiny middleware function to populate cache on callback.
      //
      this.get.call(this, query, function push(error, data) {
        if (error || !data) return fn(error, data);

        //
        // Check if equal objects where added to the cache before, if not push.
        //
        data.forEach(function locate(q) {
          if (self.find(q).length === 0) cache.push(q);
        });

        fn.apply(fn, arguments);
      });
    }
  },

  /**
   * POST a new value to the resource.
   *
   * @type {Function}
   * @public
   */
  _post: {
    enumerable: false,
    value: function _post(data, fn) {
    }
  },

  /**
   * PUT a value in the resource.
   *
   * @type {Function}
   * @public
   */
  _put: {
    enumerable: false,
    value: function _put(data, query, fn) {
    }
  },

  /**
   * DELETE a value from the resource.
   *
   * @type {Function}
   * @public
   */
  _delete: {
    enumerable: false,
    value: function _deleted(query, fn) {
    }
  },

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
   * Pullt data from the resource once and remove it.
   *
   * @param {Mixed} data The data that we want to retrieve and delete.
   * @param {Function} fn The callback.
   * @api public
   */
  pull: {
    enumerable: false,
    value: function pull(data, fn) {
      var resource = this;

      this.get(data, function get(err, found) {
        if (!found) return fn(err, found);

        resource.delete(data, function deleted(fail) {
          fn(err || fail, found);
        });
      });
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
      var self = this;

      //
      // Listen to each REST event and delegate it to our private functions,
      // which can then call the user defined REST actions if provided.
      //
      this.removeAllListeners();
      rest.forEach(function initRest(method) {
        self.on(method, self.proxyMethod(method));
      });

      //
      // Supply an empty array to cache, since previous use could have unset it.
      //
      this.cache = [];
      if (this.initialise) this.initialise(req, res);
    }
  }
}));

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
