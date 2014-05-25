'use strict';

var crypto = require('crypto')
  , fuse = require('fusing')
  , path = require('path');

/**
 * Simple representation of a single file.
 *
 * @constructor
 * @param {String|Array} aliases absolute path(s) to the source.
 * @param {String} extname extension of the file.
 * @param {Boolean} dependency File is page level dependency.
 * @param {Buffer} code The contents of the file.
 * @api public
 */
function File(aliases, extname, dependency, code) {
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
  this.writable('aliases', aliases);                   // Absolute paths to source.

  this.enumerable('length');                           // Buffer length.
  this.enumerable('hash', null);                       // Hashed code representation.
  this.enumerable('pagelets', []);                     // List of pagelets.
  this.enumerable('extname', extname);                 // File extension.

  this.readable('dependency', dependency);             // File is page dependency.
  this.readable('type', this.mime[this.extname]);      // The content-type.

  //
  // Process the content of the file if provided.
  //
  if (code) this.set(code);
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
    return '/' + this.hash + this.extname;
  }
}, true);

/**
 * Update the content of the file, convert to Buffer if required and update length.
 *
 * @param {Buffer|String} content Content of the file.
 * @param {Boolean} append Add async CSS selector or not
 * @returns {File} fluent interface
 * @api private
 */
File.readable('set', function set(content, append) {
  this.hash = this.encrypt(content);
  if (this.is('css') && append) content = this.append(content, this.hash);

  //
  // Append async loading class to CSS and make sure that the code is a Buffer.
  //
  this.code = content;
  this.buffer = Buffer.isBuffer(content) ? content : new Buffer(content);
  this.length = this.buffer.length;

  return this;
});

/**
 * Get the orginal content, either the buffer or the code.
 *
 * @param {Boolean} readable true will return readable code, false the Buffer
 * @return {String} content
 * @api public
 */
File.readable('get', function get(readable) {
  return readable ? this.code : this.buffer;
});

/**
 * Update the CSS with a selector that contains the filename which is
 * required for async loading of CSS.
 *
 * @param {String} content CSS
 * @param {String} hash Optional hashed representation of the file
 * @returns {String} CSS content with selector appended
 * @api public
 */
File.readable('append', function append(content, hash) {
  return [
    content,
    '#pagelet_',
    hash || this.hash,
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
 * Add file to the list of aliases.
 *
 * @param {String} filepath
 * @return {File} fluent interface
 * @api public
 */
File.readable('alias', function  alias(filepath) {
  if (!~this.aliases.indexOf(filepath)) this.aliases.push(filepath);
  return this;
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
