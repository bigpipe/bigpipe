'use strict';

var fs = require('fs');

/**
 * The librarian manages all the assets that we have inside our pagelets. It's
 * able to identify the most commonly included libraries and compiles them in
 * a single core file.
 *
 * @param {Pipe} pipe Reference to the Pipe
 */
function Librarian(pipe) {
  this.pipe = pipe;

  this.buffer = Object.create(null);
  this.initialise();
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

Librarian.prototype.initialise = function initialise() {
};

Librarian.prototype.inspect = function inspect(page) {

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
