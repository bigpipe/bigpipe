'use strict';

var chai = require('chai');
chai.Assertion.includeStack = true;

//
// Expose primus
//
exports.Server = require('../');

//
// Expose our assertations.
//
exports.expect = chai.expect;
