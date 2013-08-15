'use strict';

/**
 * Simple representation of a single file.
 *
 * @constructor
 * @param {Buffer} code The contents of the file.
 * @param {String} extname The extension of the file.
 * @api public
 */
function File(code, extname) {
  this.buffer = code;                   // The contents of the file.
  this.length = code.length;            // The size of the file.
  this.type = this.mime[extname];       // The content-type.
  this.extname = extname;               // File extension.
}

/**
 * Small mime lookup table.
 *
 * @type {Object}
 * @private
 */
File.prototype.mime = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

//
// Expose the module interface.
//
module.exports = File;
