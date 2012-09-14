'use strict';
var Expirable = require('expirable')
  , _ = require('lodash');

function Store(options) {
  this.data = new Expirable(Infinity);

  this.encoder = JSON.stringify;
  this.decoder = JSON.parse;

  _.extend(this, options || {});
}

Store.prototype = {
    constructor: Store

  , get: function get(key, done) {
      var self = this;

      process.nextTick(function () {
        try { done(null, self.decoder(self.data.get(key))); }
        catch (e) { done(e); }
      });
    }

  , set: function set() {

    }

  , expire: function expire() {

    }
};

Store.extend = require('extendable');
