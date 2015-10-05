'use strict';

var crypto = require('crypto')
  , fuse = require('fusing')
  , path = require('path');

/**
 * Simple representation of a single file.
 *
 * @constructor
 * @param {String} filepath Absolute path to file.
 * @param {Object} options Set of options
 *
 * Available options:
 *  - aliases {String|Array} absolute (alternative) path(s) to the source.
 *  - extname {String} extension of the file.
 *  - dependency {Boolean} File is page level dependency.
 *  - code {Buffer} The contents of the file.
 *  - external {Boolean} File is hosted externally.
 *
 * @api public
 */
function File(filepath, options) {
  this.fuse();

  options = options || {};
  options.code = options.code || '';
  options.extname = options.extname || '.js';
  options.external = options.external || false;
  options.dependency = options.dependency || false;

  filepath = (filepath || '').replace(path.extname(filepath), '');

  //
  // Normalize aliasses. File can have multiple aliases, for example due to
  // symlinked content. Aliases will be used by compiler.register
  //
  options.aliases = options.aliases || filepath;
  options.aliases = Array.isArray(options.aliases)
    ? options.aliases
    : [ options.aliases ];

  this.readable('enumerable', File.predefine(this, {
    enumerable: true,
    writable: true
  }));

  this.writable('code');                               // Actual code.
  this.writable('buffer');                             // Buffer of code.
  this.writable('_events');                            // EventEmitter 3.
  this.writable('aliases', options.aliases);           // Absolute paths to source.

  this.enumerable('length');                           // Buffer length.
  this.enumerable('hash', null);                       // Hashed code representation.
  this.enumerable('pagelets', []);                     // List of pagelets.
  this.enumerable('filepath', filepath);               // Absolute path to file.
  this.enumerable('extname', options.extname);         // File extension.
  this.enumerable('external', options.external);       // File is hosted externally.

  this.readable('dependency', options.dependency);     // File is page dependency.
  this.readable('type', this.mime[this.extname]);      // The content-type.

  //
  // Process the content of the file if provided.
  //
  this.hash = this.encrypt(options.code);
  this.set(options.code);
}

fuse(File, require('eventemitter3'));

/**
 * Expose distributed location of the File.
 *
 * @return {String} file location.
 * @api public
 */
File.readable('location', {
  enumerable: false,
  get: function get() {
    if (this.external) return this.filepath + this.extname;
    return '/' + this.hash + this.extname;
  }
}, true);

/**
 * Expose original location of the File.
 *
 * @return {String} original file location.
 * @api public
 */
File.readable('origin', {
  enumerable: false,
  get: function get() {
    if (!this.filepath) return;
    return '/' + this.filepath + this.extname;
  }
}, true);

/**
 * Update the content of the file, convert to Buffer if required and update length.
 *
 * @param {Buffer|String} content Content of the file.
 * @returns {File} fluent interface
 * @api private
 */
File.readable('set', function set(content) {
  this.code = content.toString('utf-8');

  //
  // Append async loading class to CSS
  //
  if (this.is('css')) {
    content = this.append(content, this.hash);
  }

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
    '#_',
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
File.readable('alias', function alias(filepath) {
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
