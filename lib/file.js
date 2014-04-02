'use strict';

var fuse = require('fusing')
  , path = require('path');

/**
 * Simple representation of a single file.
 *
 * @constructor
 * @param {String} location The full path of the file.
 * @param {Buffer} code The contents of the file.
 * @api public
 */
function File(location, code) {
  var extname = path.extname(location);

  this.fuse();
  this.writable('code');                               // Actual code.
  this.writable('buffer');                             // Code buffer representation.
  this.readable('type', this.mime[extname]);           // The content-type.
  this.readable('enumerable', File.predefine(this, {
    enumerable: true,
    writable: false
  }));

  this.enumerable('location', location);               // Full path to the file.
  this.enumerable('extname', extname);                 // File extension.

  if (code) this.set(code);                            // The contents of the file.
}

fuse(File, require('eventemitter3'));

/**
 * Update the content of the file, convert to Buffer if required and update length.
 *
 * @param {Buffer|String} content of the file.
 * @return {File} fluent interface
 * @api private
 */
File.readable('set', function set(content) {
  this.code = content;

  //
  // Make sure that the given code is a buffer.
  //
  content = Buffer.isBuffer(content) ? content: new Buffer(content);

  this.buffer = content;
  this.length = content.length;

  return this;
});

/**
 * Check if the file is of the provided type.
 *
 * @param {String} type part of the extension of the file.
 * @return {Boolean}
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