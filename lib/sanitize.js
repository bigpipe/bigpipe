'use strict';

/**
 * Sanitize the output so it's save to be placed in the DOM.
 *
 * @param {Mixed} data
 * @returns {Mixed}
 * @api private
 */
module.exports = function sanitize(key, data) {
  if ('string' !== typeof data) return data;

  return data
    .replace(/&/gm, '&amp;')
    .replace(/</gm, '&lt;')
    .replace(/>/gm, '&gt;')
    .replace(/"/gm, '&quote;')
    .replace(/'/gm, '&#x27;');
};
