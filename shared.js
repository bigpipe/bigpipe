'use strict';

var path = require('path');

//
// This file contains common utilities and functionality that is shared between
// the various of pagelet interfaces. This object is merged in to the prototype
// directly
//

var shared = {
  /**
   * List of resources that can be used by the pagelets.
   *
   * @type {object}
   * @public
   */
  resources: {
    value: {},
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

  /**
   * Simple emit wrapper that returns a function that emits an event once it's
   * called
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
   * Mixin objects to form one single object that contains the properties of all
   * objects.
   *
   * @param {Object} target Mix all other object in to this object.
   * @returns {Object} target
   * @api public
   */
  mixin: {
    enumerable: false,
    value: function mixin(target) {
      Array.prototype.slice.call(arguments, 1).forEach(function forEach(o) {
        Object.getOwnPropertyNames(o).forEach(function eachAttr(attr) {
          Object.defineProperty(target, attr, Object.getOwnPropertyDescriptor(o, attr));
        });
      });

      return target;
    }
  },

  /**
   * Compile iterator to resolve paths to various resources supplied to the module.
   *
   * @param {String} dir base directory
   * @param {Object} stack orginal collection
   * @param {Mixed} object reference to resource
   * @returns {Function} iterator
   * @api private
   */
  resolve: {
    enumerable: false,
    value: function resolve(dir, stack) {
      return function resolver(object) {
        if ('string' === typeof stack[object]) {
          stack[object] = path.join(dir, stack[object]);
        }
      };
    }
  },

  /**
   * Access a resource.
   *
   * @TODO re-use previous initialised resources.
   * @param {String} name The resource.
   * @api public
   */
  resource: {
    enumerable: false,
    value: function get(name) {
      var page = this.page || this
        , Resource = this.resources[name] || page.resources[name]
        , resource;

      if ('string' === typeof Resource) Resource = require(Resource);
      resource = new Resource;

      resource.configure(page.req, page.res);
      return resource;
    }
  },

  /**
   * Recursively merge properties of two objects.
   *
   * @param {Object} a first object
   * @param {Object} b second object
   * @api public
   */
  merge: {
    enumerable: false,
    value: function merge(a, b) {
      for (var p in b) {
        try {
          if ('object' === typeof b[p]) {
            a[p] = this.merge(a[p], b[p]);
          } else {
            a[p] = b[p];
          }
        } catch(e) {
          a[p] = b[p];
        }
      }

      return a;
    }
  }
};

/**
 * Provide a nice syntax sugar for merging in our shared properties and function
 * in to our different instances.
 *
 * @param {Object} proto The prototype we should merge in to.
 * @return {Object} Object.defineProperties compatible Object.
 * @api public
 */
exports.mixin = function mixin(proto) {
  return shared.mixin.value(Object.create(null), shared, proto);
};

//
// Expose merge and emits functionality for external use.
//
exports.merge = shared.merge.value;
exports.emits = shared.emits.value;
