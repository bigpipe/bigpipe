'use strict';

var path = require('path');

var EventEmitter2 = require('eventemitter2').EventEmitter2
  , async = require('async')
  , _ = require('lodash');

function Pagelet(options) {
  options = options || {};

  // Save the location where we got our resources from, this will help us with
  // fetching assets from the correct location.
  this.directory = __dirname;

  // Reference to the wrapping page
  this.page = null;

  _.extend(this, options);
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
     * Unique identifier for the pagelet.
     *
     * @type {Number}
     */
  , id: Date.now() * Math.random()

    /**
     * Configure the pagelet.
     */
  , _configure: function configure() {

    }

  , initialize: function noop() {}

    /**
     * Check if we are authorized to access this pagelet.
     *
     * @param {HTTP.Request} req
     * @param {Function} done
     */
  , authorize: function authorize(req, done) {
      done(null, true);
    }

    /**
     * Checks if a other pagelet is also enabled. For example you want to
     * add an extra url to the UI if pagelet x is enabled.
     *
     * @param {String} pagelet the name of the pagelet
     * @returns {Boolean} yep/nope
     */
  , enabled: function enabled(pagelet) {
      return !!~this.page.enabled.indexOf(pagelet);
    }

    /**
     * Check if the other pagelet has been disabled.
     *
     * @param {String} pagelet the name of the pagelet
     * @return {Boolean}
     */
  , disabled: function disabled(pagelet) {
      return !!~this.page.disabled.indexOf(pagelet);
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
  , render: function render(data, done) {

    }

    /**
     * Destroy the pagelet and all it's references.
     */
  , destroy: function destroy() {
      this.removeAllListeners();
      this.page = null;
    }
});

Pagelet.extend = require('extendable');
