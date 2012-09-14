'use strict';

var Stream = require('stream')
  , EventEmitter2 = require('eventemitter2').EventEmitter2;

/**
 * Utilities and helpers.
 */
var async = require('async')
  , _ = require('lodash');

function Pagelet() {

  this._configure();
}

_.extend(Pagelet.prototype, Stream.prototype, {
    assets: process.cwd()

  , _configure: function () {

    }

  , authorized: function authorized(req, done) {
      done(null, true);
    }

  , id: Date.now() * Math.random()

  , events: {

    }

  , resources: function resources(name, dafasdfa) {

    }

  , render: function () {}
});

Pagelet.extend = require('extendable');
