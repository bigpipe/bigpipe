'use strict';

var fs = require('fs');

/**
 * The librarian manages all the assets that we have inside our pagelets. It's
 * able to identify the most commonly included libraries and compiles them in
 * a single core file.
 *
 * All non-common assets are also compiled and saved to disk so we don't have to
 * recompile everything during a request.
 *
 * @constructor
 * @param {Pipe} pipe Reference to the Pipe
 * @api public
 */
function Librarian(pipe) {
  this.buffer = Object.create(null);
  this.pipe = pipe;
}

//
// Proxy some of the pipe's properties directly in to our librarian.
//
['log', 'pages'].forEach(function proxy(api) {
  Object.defineProperty(Librarian.prototype, api, {
    get: function get() {
      return this.pipe[api];
    }
  });
});

/**
 * Scan the supplied pages for duplicate pagelet definitions.
 *
 * @api public
 */
Librarian.prototype.catalog = function optimize() {

};

Librarian.prototype.lend = function lend() {

};

/**
 * Read a file location.
 *
 * @param {String} path Location of the file.
 * @api private
 */
Librarian.prototype.read = function read(path) {
  if (path in this.buffer) return this.buffer[path];

  return this.buffer[path] = fs.readFileSync(path, 'utf-8');
};

//
// Initialize.
//
module.exports = Librarian;
