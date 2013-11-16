'use strict';

/**
 * Get an accurate type check for the given Object.
 *
 * @param {Mixed} obj The object that needs to be detected.
 * @returns {String} The object type.
 * @api private
 */
function type(obj) {
  return Object.prototype.toString.call(obj).slice(8, -1).toLowerCase();
}

/**
 * Iterate over a collection.
 *
 * @param {Mixed} collection The object we want to iterate over.
 * @param {Function} iterator The function that's called for each iteration.
 * @param {Mixed} context The context of the function.
 * @api private
 */
function each(collection, iterator, context) {
  if ('function' === typeof collection.forEach) {
    return collection.forEach(iterator, context);
  }

  var i = 0;

  if ('array' === type(collection)) {
    for (; i < collection.length; i++) {
      iterator.call(context, collection[i], i, collection);
    }
  } else {
    for (i in collection) {
      iterator.call(context, collection[i], i);
    }
  }
}

/**
 * Checks if the given object is empty. The only edge case here would be
 * objects. Most object's have a `length` attribute that indicate if there's
 * anything inside the object.
 *
 * @param {Mixed} collection The collection that needs to be checked.
 * @returns {Boolean}
 * @api private
 */
function empty(obj) {
  if (!obj) return false;
  return size(obj) === 0;
}

/**
 * Determine the size of a collection.
 *
 * @param {Mixed} collection The object we want to know the size of.
 * @returns {Number} The size of the collection.
 * @api private
 */
function size(collection) {
  var x, i = 0;

  if ('object' === type(collection)) {
    for (x in collection) i++;
    return i;
  }

  return +collection.length;
}

/**
 * Wrap the given object in an array if it's not an array already.
 *
 * @param {Mixed} obj The thing we might need to wrap.
 * @returns {Array} We promise!
 * @api private
 */
function array(obj) {
  if ('array' === type(obj)) return obj;

  return obj  // Only transform objects in to an array when they exist.
    ? [ obj ]
    : [];
}

//
// Expose the collection utilities.
//
exports.array = array;
exports.empty = empty;
exports.size = size;
exports.type = type;
exports.each = each;
