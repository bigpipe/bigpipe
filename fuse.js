'use strict';

var predefine = require('predefine')
  , path = require('path');

module.exports = function fuse(Base, inherits) {
  Base.prototype.__proto__ = inherits.prototype;

  Base.writable = predefine(Base.prototype, predefine.WRITABLE);
  Base.readable = predefine(Base.prototype, {
    configurable: false,
    enumerable: false,
    writable: false
  });

  //
  // Inherit some methods from the predefine module
  //
  Base.readable('mixin', predefine.mixin);
  Base.readable('merge', predefine.merge);

  /**
   * Reset the constructor so it points to the Base class.
   *
   * @type {Function}
   * @api public
   */
  Base.writable('constructor', Base);

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
  Base.readable('emits', function emits(event, parser) {
    var self = this;

    return function emit(arg) {
      self.emit(event, parser ? parser.apply(self, arguments) : arg);
    };
  });

  /**
   * Compile iterator to resolve paths to various resources supplied to the module.
   *
   * @param {String} dir base directory
   * @param {Object} stack original collection
   * @param {Mixed} object reference to resource
   * @returns {Function} iterator
   * @api private
   */
  Base.writable('resolve', function resolve(dir, stack) {
    return function resolver(object) {
      if ('string' === typeof stack[object]) {
        stack[object] = path.join(dir, stack[object]);
      }
    };
  });

  /**
   * Make the Base class extendable using Backbone's .extend pattern.
   *
   * @type {Function}
   * @api public
   */
  Base.extend = predefine.extend;

  return Base;
};
