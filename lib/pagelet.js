'use strict';

/**
 * Third party libraries.
 */
var EventEmitter2 = require('eventemitter2').EventEmitter2
  , async = require('async')
  , _ = require('lodash');

/**
 * Native Node.js Modules.
 */
var path = require('path');

/**
 * Pagelet, a "sandboxed" piece of application logic. A single building brick to
 * complete your page.
 *
 * Options:
 *
 * - directory: The directory that holds the assets.
 * - page: Reference to the page that contains the pagelet.
 *
 * @constructor
 * @param {Object} options
 */
function Pagelet(options) {
  options = options || {};

  // Save the location where we got our resources from, this will help us with
  // fetching assets from the correct location.
  this.directory = path.dirname(process.mainModule.filename);

  // Reference to the wrapping page
  this.page = null;
  _.extend(this, options);

  // Generate a semi unique name based on the page details/pagelet combination.
  this.id = [this.page.path, this.page.method, this.name].join('@');

  EventEmitter2.call(this);
  this._configure(options);

  // Configuration process is over, don't allow any more extensions because we
  // don't want to main a shared state here..
  Object.seal(this);
}

_.extend(Pagelet.prototype, EventEmitter2.prototype, {
    /**
     * Dictionary with events that are transmitted from the client side.
     *
     * @type {Object}
     */
    events: {}

    /**
     * The client side assets, it currently only supports languages that compile
     * to JavaScript or CSS such as stylus, coffeescript, css and javascript.
     *
     * This object should follow the same bundle specification as specified by
     * the square.json spec:
     *
     * https://github.com/observing/square/blob/master/doc/square.json.md
     *
     * @type {Object}
     * @api public
     */
  , assets: {
        './pagelet.css': {
            'description': 'The default location of the CSS for this pagelet'
        }
      , './pagelet.js': {
            'description': 'The default location of the JavaScript'
        }
    }

    /**
     * The name of the pagelet.
     *
     * @type {String}
     */
  , name: ''

    /**
     * Configure the pagelet.
     */
  , _configure: function configure() {
      var self = this;

      // Prefix the paths of the assets with the set directory name so they
      // become absolute paths.
      Object.keys(this.assets).forEach(function asset(location) {
        var absolute = path.resolve(self.directory, location);

        // update the assets with the correct version and remove the old
        // instance
        self.assets[absolute] = self.assets[location];
        delete self.assets[location];
      });
    }

    /**
     * Simple callback for when the pagelet is fully initialized.
     */
  , initialize: function noop() {}

    /**
     * Checks if a other pagelet is also enabled. For example you want to
     * add an extra url to the UI if pagelet x is enabled.
     *
     * @param {String} pagelet the name of the pagelet
     * @returns {Boolean} yep/nope
     */
  , enabled: function enabled(pagelet) {
      return pagelet in this.page.pagelets;
    }

    /**
     * Check if the other pagelet has been disabled.
     *
     * @param {String} pagelet the name of the pagelet
     * @return {Boolean}
     */
  , disabled: function disabled(pagelet) {
      return !this.enabled(pagelet);
    }

    /**
     * Access the resources that are specified in the wrapping Page.
     *
     * @param {String} name name of the resource.
     */
  , resource: function resources(name /* args,  callback */) {
      return this.page.resource.apply(this.page, arguments);
    }

    /**
     * Trigger an event on the client side.
     *
     * @param {String} event name of the event.
     * @returns {Boolean} successfully send or queued the event
     */
  , trigger: function trigger(event) {
      var args = Array.prototype.slice.call(arguments, 1);
      return this.page.trigger(this.name, event, args);
    }

    /**
     * The user is done with their data transformations and want's us to render
     * the pagelet.
     *
     * @param {Mixed} data data for the pagelet
     * @param {Function} done callback
     */
  , write: function render(data, done) {
      if (this.page.res.write(data)) {
        return done();
      }

      this.page.res.once('drain', done);
    }

    /**
     * Destroy the pagelet and all it's references.
     */
  , destroy: function destroy() {
      this.removeAllListeners();
      this.page = null;
    }
});

/**
 * Make it extendable.
 */
Pagelet.extend = require('extendable');

/**
 * Expose the constructor.
 */
module.exports = Pagelet;
