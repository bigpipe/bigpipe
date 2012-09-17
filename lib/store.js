'use strict';

var Expirable = require('expirable')
  , _ = require('lodash');

/**
 * Storage, please note that every method should be have async to prevent any
 * future suprices when people implement other stores / databases.
 *
 * @constructor
 */
function Store(options) {
  this.data = new Expirable(Infinity);

  // In this store we are JSON encoding/ecoding it so we get errors when we have
  // data with cyclic references. But this also allows us to use different
  // encoders like JSONH.
  this.encoder = JSON.stringify;
  this.decoder = JSON.parse;

  _.extend(this, options || {});
}

Store.prototype = {
    constructor: Store

    /**
     * Get an item from the store.
     *
     * @param {String} key
     * @param {Function} done callback
     */
  , get: function get(key, done) {
      var self = this;

      process.nextTick(function () {
        try { done(null, self.decoder(self.data.get(key))); }
        catch (e) { done(e); }
      });
    }

    /**
     * Set a key.
     *
     * @param {String} key
     * @param {Mixed} value something that can be stringified
     * @param {Function} done callback
     */
  , set: function set(key, value, done) {
      this.data.set(key, this.encoder(value));
      process.nextTick(done);
    }

    /**
     * Expire the given key.
     *
     * @param {String} key
     * @param {String} duration
     * @param {Function} done callback
     */
  , expire: function expire(key, duration, done) {
      this.data.expire(key, duration);
      process.nextTick(done);
    }

    /**
     * Remove the key.
     *
     * @param {String} key
     * @param {Function} done callback
     */
  , remove: function remove(key, done) {
      this.data.remove(key);
      process.nextTick(done);
    }
};

/**
 * Extendable like a bad-ass.
 */
Store.extend = require('extendable');
