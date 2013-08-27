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
   * @type {Object}
   * @public
   */
  cache: {
    value: {},
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

  /**
   * GET a new value from the resource.
   *
   * @type {Function}
   * @public
   */
  get: {
    writable: true,
    enumerable: false,
    configurable: true,
    value: function get(query, fn) {
      var state = this.state;

      if (state && 'get' in state) return state.get.apply(this, arguments);
      fn(new Error('unable to read the data from the resource'));
    }
  },

  /**
   * POST a new value to the resource.
   *
   * @type {Function}
   * @public
   */
  post: {
    writable: true,
    enumerable: false,
    configurable: true,
    value: function post(data, fn) {
      var state = this.state;

      if (state && 'post' in state) return state.post.apply(this, arguments);
      fn(new Error('unable to create a new value in the resource'), false);
    }
  },

  /**
   * PUT a value in the resource.
   *
   * @type {Function}
   * @public
   */
  put: {
    writable: true,
    enumerable: false,
    configurable: true,
    value: function put(data, query, fn) {
      var state = this.state;

      if (state && 'put' in state) return state.put.apply(this, arguments);
      fn(new Error('unable to update the queried value in the resource'), false);
    }
  },

  /**
   * DELETE a value from the resource.
   *
   * @type {Function}
   * @public
   */
  delete: {
    writable: true,
    enumerable: false,
    configurable: true,
    value: function deleted(query, fn) {
      var state = this.state;

      if (state && 'delete' in state) return state.delete.apply(this, arguments);
      fn(new Error('unable to delete the value from the resource'), false);
    }
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

        args.push(this.proxy.bind(this, fn));
        this[method].apply(this, args);
      };
    }
  },

  /**
   * Proxy method to channel all callbacks from resources through, this will
   * expose Error objects only if manipulation of resources fails and will make
   * sure callbacks are async.
   *
   * @param {Funtion} fn callback
   * @param {Mixed} error error message
   * @param {Mixed} data
   * @api private
   */
  proxy: {
    enumerable: false,
    value: function proxy(fn, error, data) {
      if (error && !(error instanceof Error)) error = new Error(error);

      //
      // Defer callbacks so resource are always async.
      //
      process.nextTick(function callback() {
        fn(error, data);
      });
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
   * Receive the data once and remove it.
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

      this.cache.length = 0;
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
