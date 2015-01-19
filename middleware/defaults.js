'use strict';

var url = require('url');

/**
 * A small middleware layer which is ran before everything else to add some
 * silly connect based middleware defaults so they can also be used in BigPipe.
 *
 * @type {Function}
 * @api public
 */
module.exports = function defaults(req, res) {
  req.uri = req.uri || url.parse(req.url, true);
  req.query = req.query || req.uri.query;
  req.originalUrl = req.url;
};
