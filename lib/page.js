'use strict';

/**
 * Third party dependencies.
 */
var EventEmitter2 = require('eventemitter2').EventEmitter2
  , Routable = require('routable')
  , Square = require('square')
  , async = require('async')
  , _ = require('lodash');

/**
 * Native node modules
 */
var path = require('path');

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

  // Setup the [square] build system so we can also concatinate all the dependencies
  this.square = new Square({ 'log level': 0, writable: false });

  _.extend(this, options);
  EventEmitter2.call(this, { wildcard: true, delimiter: ':' });

  this._configure(options);

  // Configuration process is over, don't allow any more extensions because we
  // don't want to main a shared state here..
  Object.seal(this);
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
      this.pagelets = _.reduce(this.pagelets, function exists(memo, pagelet, name) {
        // It could be that they supplied us with a string, assume that it's
        // path to Pagelet that needs to be required.
        if (typeof pagelet === 'string') {
          pagelet = require(pagelet);
        }

        // Make sure that the pagelets arent initialized.
        if (pagelet instanceof Pagelet) {
          throw new Error('The supplied pagelet ('+ pagelet.name +') is already initialized');
        }

        memo[name] = pagelet;
        return memo;
      }, {});

      // Ensure that the specified resources actually exist
      this.resources = _.reduce(this.resources, function exists(memo, resource, name) {
        if (typeof resource === 'string') {
          resource = require(resource);
        }

        memo[name] = resource;
        return memo;
      }, {});

      // Start processing the pagelets
      var pagelets = Object.keys(this.pagelets);

      // Create a collection of pagelets based on their permissions, we only
      // want to have access to the available modules.
      async.reject(
          pagelets
        , function filter(name, done) {
            var pagelet = self.pagelets[name] = new self.pagelets[name]({
                page: self
              , name: name
            });

            // Authorize the pagelet, we assume that people will use true for
            // accepted authorization and false for invalid, the filter method
            // needs to have a false instead of true to not filter it out.
            if (typeof authorize === 'function') {
              return pagelet.authorize(self.req, function yaynay(yay) {
                done(!yay);
              });
            }

            process.nextTick(function ticktock() {
              done(false);
            });
          }
        , function done(available) {
            // Store a list of all enabled and disabled pagelets.
            var disabled = _.difference(pagelets, available);

            // destroy all disabled pagelets
            disabled.forEach(function disable(name) {
              self.pagelets[name].destroy();
              delete self.pagelets[name];
            });

            self.initialize(options);
            self.compose();
          }
      );
    }

    /**
     * The pagelet has been initialized
     *
     * @param {Object} options
     */
  , initialize: function initialize() {}

    /**
     * Each pagelet has it's own CSS and JavaScript files. To improve
     * performance of the page we are going to concatinate these files in to
     * a single JavaScript and CSS file.
     */
  , compose: function compose() {
      // Get all merge all the assets of the pagelets in to one single
      // specification file.
      var pagelets = Object.keys(this.pagelets).sort()
        , assets = _.reduce(this.pagelets, reduce, {})
        , self = this;

      /**
       * Merge the assets in to big assets object.
       *
       * @param {Object} memo
       * @param {Pagelet} pagelet
       * @returns {Object} memo
       */
      function reduce(memo, pagelet) {
        _.extend(memo, pagelet.assets || {});
        return memo;
      }

      // Generate the bundle.
      var bundle = {
          configuration: {
              // We are using MD5 hashes here as file name so we can agressively
              // cache these resources, when a change is made the MD5 sum will be
              // changed anyways
              dist: '{md5}.{type}.{ext}'
          }
        , bundle: assets
      };

      this.square.parse(bundle);
      this.square.plugin('crush');
      this.square.build(['css', 'js'], function done(err, files) {

      });
    }

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

/**
 * Make the page extendable.
 */
Page.extend = require('extendable');

/**
 * Expose the constructor.
 */
module.exports = Page;
