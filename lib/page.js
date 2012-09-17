'use strict';

/**
 * Third party dependencies.
 */
var EventEmitter2 = require('eventemitter2').EventEmitter2
  , Routable = require('routable')
  , async = require('async')
  , _ = require('lodash');

/**
 * Library modules.
 */
var Store = require('./store')
  , Pagelet = require('./pagelet');

/**
 * The `page` is a collection of `pagelets`.
 *
 * @constructor
 * @param {Object} options
 */
function Page(options) {
  options = options || {};

  this.req = null;    // request object
  this.res = null;    // response object
  this.params = null; // params from parsing the url
  this.engine = null; // engine.io connection, only set when established

  _.extend(this, options);
  EventEmitter2.call(this);

  this._configure(options);

  // Configuration process is over, don't allow any more extensions because we
  // don't want to main a shared state here..
  Object.seal(this);

  this.initialize();
}

_.extend(Page.prototype, EventEmitter2.prototype, {
    path: '/'
  , method: 'GET'
  , pagelets: {}
  , resources: {}

  , storage: Store

  , _configure: function configure(options) {
      // Ensure that our storage engine is initialized.
      if (!(this.storage instanceof Store) && _.isFunction(this.storage)) {
        this.storage = new this.storage(options);
      }

      // Ensure that we have pagelets, it could be that they supplied a path to
      // the pagelet instead of Pagelet instance.
      this.pagelets = _.map(this.pagelets, function exists(pagelet) {
        // It could be that they supplied us with a string, assume that it's
        // path to Pagelet that needs to be required.
        if (typeof pagelet === 'string') {
          pagelet = require(pagelet);
        }

        // Make sure that the pagelets arent initialized.
        if (pagelet instanceof Pagelet) {
          throw new Error('The supplied pagelet ('+ pagelet.name +') is already initialized');
        }

        return pagelet;
      });

      // Ensure that the specified resources actually exist
      this.resources = _.map(this.resources, function exists(resource) {
        if (typeof resource === 'string') {
          resource = require(resource);
        }

        return resource;
      });
    }

  , initialize: function initialize() {

    }
});

Page.extend = require('extendable');
