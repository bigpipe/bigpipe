'use strict';

var Formidable = require('formidable').IncomingForm
  , debug = require('diagnostics')('bigpipe:page')
  , fabricate = require('fabricator')
  , qs = require('querystring')
  , Route = require('routable')
  , crypto = require('crypto')
  , async = require('async')
  , fuse = require('fusing')
  , path = require('path')
  , fs = require('fs');

/**
 * A simple object representation of a given page.
 *
 * @constructor
 * @param {Pipe} pipe BigPipe server instance.
 * @param {Request} req HTTP request.
 * @param {Response} res HTTP response.
 * @api public
 */
function Page(pipe, req, res) {
  if (!(this instanceof Page)) return new Page(pipe, req, res);

  this.fuse();

  var writable = this.writable
    , readable = this.readable;

  readable('compiler', pipe.compiler);        // Asset management.

  writable('flushed', false);                 // Is the queue flushed.
  writable('ended', false);                   // Is the page ended.

  writable('params', {});                     // Param extracted from the route.
  writable('queue', []);                      // Write queue that will be flushed.

  writable('n', 0);                           // Number of processed pagelets.
}

fuse(Page, require('eventemitter3'));

//
// !IMPORTANT
//
// These function's & properties should never overridden as we might depend on
// them internally, that's why they are configured with writable: false and
// configurable: false by default.
//
// !IMPORTANT
//
//
//
// Expose the constructor.
//
module.exports = Page;
