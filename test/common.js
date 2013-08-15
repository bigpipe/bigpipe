'use strict';

var chai = require('chai');
chai.Assertion.includeStack = true;

//
// Expose Pagelets's Pipe
//
exports.Pipe = require('../');
exports.Pagelet = require('../pagelet');
exports.Page = require('../page');
exports.shared = require('../shared');

//
// Expose our assertations.
//
exports.expect = chai.expect;

//
// Expose a port number generator.
//
var port = 1024;
Object.defineProperty(exports, 'port', {
  get: function get() {
    return port++;
  }
});
