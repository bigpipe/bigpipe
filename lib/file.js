'use strict';

var crypto = require('crypto')
  , fuse = require('fusing')
  , path = require('path');

/**
 * Simple representation of a single file.
 *
 * @constructor
 * @param {Buffer} code The contents of the file.
 * @param {String} extname extension of the file.
 * @param {String|Array} aliases absolute path(s) to the source.
 * @api public
 */
function File(code, extname, aliases) {
  this.fuse();

  //
  // Normalize aliasses. File can have multiple aliases, for example due to
  // symlinked content. Aliases will be used by compiler.register
  //
  aliases = Array.isArray(aliases) ? aliases : [ aliases ];

  this.readable('enumerable', File.predefine(this, {
    enumerable: true,
    writable: true
  }));

  this.writable('code');                               // Actual code.
  this.writable('buffer');                             // Buffer of code.
  this.writable('_events');                            // EventEmitter 3.
  this.writable('location');                           // Absolute path to file.
  this.writable('pagelets', []);                       // Pagelets using the file.
  this.writable('aliases', aliases);                   // Absolute paths to source.

  this.enumerable('hash');                             // Hashed code representation.
  this.enumerable('length');                           // Buffer length.
  this.enumerable('extname', extname);                 // File extension.

  this.readable('type', this.mime[this.extname]);      // The content-type.

  //
  // Process the content of the file, will set content type,
  //
  this.set(code);                                      // The contents of the file.
}

fuse(File, require('eventemitter3'));

/**
 * Expose distributed location of the File.
 *
 * @return {String} file location
 * @api public
 */
File.readable('location', {
  enumerable: false,
  get: function get() {
    return path.join(this.hash, this.extname);
  }
}, true);

/**
 * Update the content of the file, convert to Buffer if required and update length.
 *
 * @param {Buffer|String} content of the file.
 * @returns {File} fluent interface
 * @api private
 */
File.readable('set', function set(content) {
  this.code = content;
  this.hash = this.encrypt(content);

  //
  // Append async loading class to CSS and make sure that the code is a Buffer.
  //
  content = this.is('css') ? this.append(content, this.hash) : content;
  content = Buffer.isBuffer(content) ? content : new Buffer(content);

  this.buffer = content;
  this.length = content.length;

  return this;
});

//
// Update the CSS with a selector that contains the filename which is
// required for async loading of CSS.
//
File.readable('append', function append(content, hash) {
  return [
    content,
    '#pagelet_',
    hash,
    ' { height: 42px }'
  ].join('');
});

/**
 * Create a hash of the code which can be used as filename. This allows us to
 * aggressively cache the data.
 *
 * @param {String} code The code that is send to the client.
 * @returns {String} hash representation of the code.
 * @api private
 */
File.readable('encrypt', function encrypt(code) {
  return crypto.createHash('sha1').update(code).digest('hex').toString('hex');
});

/**
 * Check if the file is of the provided type.
 *
 * @param {String} type part of the extension of the file.
 * @returns {Boolean}
 * @api private
 */
File.readable('is', function is(type) {
  if (type.charAt(0) !== '.') type = '.' + type;
  return this.extname === type;
});

/**
 * Small mime lookup table.
 *
 * @type {Object}
 * @private
 */
File.readable('mime', {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
});

//
// Expose the module interface.
//
module.exports = File;
