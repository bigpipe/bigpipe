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
  this.param = null;  // params from parsing the url
  this.engines = [];  // engine.io connections for this page
  this.enabled = [];  // list of enabled and authorized pagelets
  this.disabled = []; // list of disabled pagelets

  _.extend(this, options);
  EventEmitter2.call(this, { wildcard: true, delimiter: ':' });

  this._configure(options);

  // Configuration process is over, don't allow any more extensions because we
  // don't want to main a shared state here..
  Object.seal(this);

  this.initialize();
}

_.extend(Page.prototype, EventEmitter2.prototype, {
    /**
     * The pathname that this page should respond to, it can either be a String
     * with the path or a Regular Expression.
     *
     * @type {String|RegExp}
     */
    path: '/'

    /**
     * The HTTP method this page should respond to.
     *
     * @type {String}
     */
  , method: 'GET'

    /**
     * The pagelets that are available on the page. They are mapped as pagelet
     * name => instance.
     *
     * @type {Object}
     */
  , pagelets: {}

    /**
     * The resources that are available on the page. They are mapped as resource
     * name => instance.
     *
     * @type {Object}
     */
  , resources: {}

    /**
     * Parameter parsers. They are mapped as param name => parser.
     *
     * @type {Object}
     */
  , params: {}

    /**
     * Reference to a storage instance.
     *
     * @type {Store}
     */
  , storage: Store

    /**
     * Configure and validate the page.
     *
     * @param {Object} options
     * @api private
     */
  , _configure: function configure(options) {
      var self = this;

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

      // Start processing the pagelets
      var pagelets = Object.keys(this.pagelets)
        , instances = {};

      async.filter(
          pagelets
        , function filter(name, done) {
            var pagelet = instances[name] = new self.pagelet[name]({
                page: self
              , name: name
            });

            // authorize the pagelet
            pagelet.authorize(self.req, done);
          }
        , function done(err, available) {
            if (err) self.emit('error', err);

            // Store a list of all enabled and disabled pagelets.
            self.enabled = available;
            self.disabled = _.difference(pagelets, available);

            // destroy all disabled applications
            self.disabled.forEach(function disable(name) {
              instances[name].destroy();
              delete instances[name];
            });

            self.initialize(options);
          }
      );
    }

  , initialize: function initialize() { }

    /**
     * A new connection has been made to this page.
     *
     * @param {Socket} socket engine connection
     * @api public
     */
  , connect: function connect(socket) {
      this.engine.push(socket);
      this.emit('connect', socket);
    }

    /**
     * Handle socket disconnections.
     *
     * @param {Socket} socket engine connection
     * @returns {Boolean} removal went okidokie
     * @api public
     */
  , disconnect: function disconnect(socket) {
      var index = this.engine.indexOf(socket);

      if (index > -1) return false;
      this.engine.splice(index, 1);

      this.emit('disconnect', socket);
      return true;
    }

    /**
     * A new message has been received from the client.
     *
     * @param {String} pagelet name of the pagelet
     * @param {String} event name of the event that should be triggered
     * @param {Array} args the event arguments
     * @api public
     */
  , receive: function dispatch(pagelet, event, args) {

    }

    /**
     * Send an event to the all the established connections for this page.
     *
     * @param {String} pagelet name of the pagelet
     * @param {String} event name of the event that should be triggered
     * @param {Array} args the event arguments
     * @api public
     */
  , trigger: function trigger(pagelet, event, args) {
      return this.engine.every(function every(socket) {
        return !!socket.trigger(pagelet, every, args);
      });
    }
});

Page.extend = require('extendable');
