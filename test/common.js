'use strict';

var chai = require('chai')
  , sinon = require('sinon')
  , sinonChai = require('sinon-chai');

chai.Assertion.includeStack = true;
chai.use(sinonChai);

//
// Expose Pagelets's Pipe
//
exports.Pipe = require('../');
exports.Pagelet = require('pagelet');
exports.Page = require('../page');
exports.File = require('../lib/file');

//
// Expose our assertations.
//
exports.expect = chai.expect;
exports.sinon = sinon;

//
// Expose a port number generator.
//
var port = 1024;
Object.defineProperty(exports, 'port', {
  get: function get() {
    return port++;
  }
});
