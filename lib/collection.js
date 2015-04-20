'use strict';

var fuse = require('fusing');

/**
 * Collection of files.
 *
 * @Constructor
 * @param {Object} options
 * @api public
 */
function Collection(options) {
  options = options || {};

  this.fuse();
  this.readable('stack', []);

  //
  // Only use the toString of options if it was explicitly provided, otherwise
  // this would default to the toString of the options object.
  //
  if (options.hasOwnProperty('toString')) {
    this.writable('_toString', options.toString);
  }

  this.concat(options.files);
}

//
// Fuse collection with extendible.
//
fuse(Collection);

/**
 * Push the file in the collection.
 *
 * @param {File} file
 * @return {Collection} fluent interface
 * @api public
 */
Collection.readable('push', function push(file) {
  if (!this.isFile(file) || ~this.stack.indexOf(file)) return this;
  this.stack.push(file);

  return this;
});

/**
 * JSON stringify by exposing locations of each File in the collection.
 *
 * @return {Array} all files in the collection
 * @api private
 */
Collection.readable('toJSON', function toJSON() {
  return this.stack.map(function map(file) {
    return file.location;
  });
});

/**
 * Concat another collection or file.
 *
 * @param {Collection|File} collection
 * @return {Collection} fluent interface
 * @api public
 */
Collection.readable('concat', function concat(collection) {
  if (this.isFile(collection)) this.push(collection);
  else if (collection instanceof Collection) collection.stack.forEach(this.push, this);

  return this;
});

/**
 * Check if the provided object is of type File.
 *
 * @return {Boolean}
 * @api private
 */
Collection.readable('isFile', function (file) {
  return !!(file && file.constructor && 'File' === file.constructor.name);
});

/**
 * Getter and Setter logic around providing a method that will be used toString
 * the Files in the Collection.
 *
 * @type {Function}
 * @api public
 */
Collection.set('toString', function get() {
  var collection = this;

  return function toString() {
    return collection.stack.reduce(function stringify(memo, file) {
      return memo + collection._toString(file);
    }, '');
  };
}, function set(method) {
  if ('function' !== typeof method) return;
  this._toString = method;
});

//
// Expose the Collection constructor.
//
module.exports = Collection;