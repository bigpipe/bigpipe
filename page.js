'use strict';

var async = require('async')
  , path = require('path');

/**
 * A simple object representation of a given page.
 *
 * @constructor
 * @api public
 */
function Page(pipe) {
  this.pipe = pipe;                         // Pipe wrapper.
  this.connections = Object.create(null);   // Stores active real-time connections.
  this.conditional = [];                    // Pagelets that are conditional.
  this.disabled = {};                       // Disabled pagelets.
  this.enabled = {};                        // Enabled pagelets.
  this._events = {};                        // Allow events to be registered.

  this.req = null;                          // Reference to HTTP request.
  this.res = null;                          // Reference to HTTP response.

  //
  // Don't allow any further extensions of the object. This improves performance
  // and forces people to stop maintaining state on the "page". As Object.seal
  // impacts the performance negatively, we're just gonna enable it for
  // development only so people will be caught early on.
  //
  if ('development' === this.env) Object.seal(this);
}

Page.prototype = Object.create(require('events').EventEmitter.prototype, {
  constructor: {
    value: Page,
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * The HTTP pathname that we should be matching against.
   *
   * @type {String|RegExp}
   * @public
   */
  path: {
    value: '/',
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * Which HTTP methods should this page accept. It can be a string, comma
   * separated string or an array.
   *
   * @type {String|Array}
   * @public
   */
  method: {
    value: 'GET',
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * The default status code that we should send back to the user.
   *
   * @type {Number}
   * @public
   */
  statusCode: {
    value: 200,
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * With what kind of generation mode do we need to output the generated
   * pagelets. We're supporting 3 different modes:
   *
   * - render, fully render the page without any fancy flushing.
   * - async, render all pagelets async and flush them as fast as possible.
   * - pipe, same as async but in the specified order.
   *
   * @type {String}
   * @public
   */
  mode: {
    value: 'async',
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * The location of the base template.
   *
   * @type {String}
   * @public
   */
  view: {
    value: '',
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * Optional template engine preference. Useful when we detect the wrong template
   * engine based on the view's file name.
   *
   * @type {String}
   * @public
   */
  engine: {
    value: '',
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * Save the location where we got our resources from, this will help us with
   * fetching assets from the correct location.
   *
   * @type {String}
   * @public
   */
  directory: {
    value: '',
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * The environment that we're running this page in. If this is set to
   * `development` It would be verbose.
   *
   * @type {String}
   * @public
   */
  env: {
    value: (process.env.NODE_ENV || 'development').toLowerCase(),
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * The pagelets that need to be loaded on this page.
   *
   * @type {Object}
   * @public
   */
  pagelets: {
    value: {},
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * Parameter parsers, key is the name of param and value the function that
   * parsers it.
   *
   * @type {Object}
   * @public
   */
  parsers: {
    value: {},
    writable: true,
    enumerable: false,
    configurable: true
  },

  /**
   * List of resources that can be used by the pagelets.
   *
   * @type {object}
   * @public
   */
  resources: {
    value: {},
    writable: true,
    enumerable: false,
    configurable: true
  },

  //
  // !IMPORTANT
  //
  // Function's should never overriden as we might depend on them internally,
  // that's why they are configured with writable: false and configurable: false
  // by default.
  //
  // !IMPORTANT
  //

  /**
   * Simple emit wrapper that returns a function that emits an event once it's
   * called
   *
   * @param {String} event Name of the event that we should emit.
   * @param {Function} parser Argument parser.
   * @api public
   */
  emits: {
    enumerable: false,
    value: function emits(event, parser) {
      var self = this;

      return function emit(arg) {
        self.emit(event, parser ? parser.apply(self, arguments) : arg);
      };
    }
  },

  /**
   * Discover pagelets that we're allowed to use.
   *
   * @api private
   */
  discover: {
    enumerable: false,
    value: function discover() {
      var req = this.req
        , page = this
        , pagelets;

      pagelets = this.pagelets.map(function allocate(Pagelet) {
        return Pagelet.freelist.alloc().configure(page);
      });

      //
      // The Pipe#transform has transformed our pagelets object in to an array
      // so we can easily iternate over them.
      //
      async.filter(pagelets, function rejection(pagelet, done) {
        //
        // Check if the given pagelet has a custom authorization method which we
        // need to call and figure out if the pagelet is available.
        //
        if ('function' === typeof pagelet.authorize) {
          pagelet.authorize(req, done);
        } else {
          done(true);
        }
      }, function acceptance(allowed) {
        page.enabled = allowed;

        page.disabled = pagelets.filter(function disabled(pagelet) {
          return !!allowed.indexOf(pagelet);
        });
      });
    }
  },

  /**
   * Mode: Render
   * Output the pagelets fully rendered in the HTML template.
   *
   * @api private
   */
  render: {
    enumerable: false,
    value: function render() {

    }
  },

  /**
   * Mode: Async
   * Output the pagelets as fast as possible.
   *
   * @api private
   */
  async: {
    enumerable: false,
    value: function render() {

    }
  },

  /**
   * Mode: pipeline
   * Output the pagelets as fast as possible but in order.
   *
   * @api private
   */
  pipeline: {
    enumerable: false,
    value: function render() {

    }
  },

  /**
   * The bootstrap method generates a string that needs to be included in the
   * template in order for pagelets to function.
   *
   * - It includes the pipe.js JavaScript client and initialises it.
   * - It includes "core" library files for the page.
   * - It includes "core" css for the page.
   * - It adds a <noscript> meta refresh for force a sync method.
   *
   * @param {String} mode The rendering mode that's used to output the pagelets.
   * @api private
   */
  bootstrap: {
    enumerable: false,
    value: function bootstrap(mode) {
      var view = this.pipe.temper.fetch(this.view).server
        , library = this.pipe.library.lend(this)
        , path = this.req.uri.pathname
        , head;

      head = [
        '<meta charset="utf-8" />',
        '<noscript>',
          '<meta http-equiv="refresh" content="0; URL='+ path +'?no_pagelet_js=1" />',
        '</noscript>'
      ];

      if (library.css) library.css.forEach(function inject(url) {
        head += '<link rel="stylesheet" href="'+ url +'" />';
      });

      if (library.js) library.js.forEach(function inject(url) {
        head += '<link rel="stylesheet" href="'+ url +'" />';
      });

      // @TODO rel prefetch for resources that are used on the next page?
      // @TODO cache manifest.
      // @TODO rel dns prefetch.

      this.res.write(view({
        bootstrap: head
      }));

      return this;
    }
  },

  /**
   * Reset the instance to it's orignal state and initialise it.
   *
   * @param {ServerRequest} req HTTP server request.
   * @param {ServerResponse} res HTTP server response.
   * @api private
   */
  configure: {
    enumerable: false,
    value: function configure(req, res) {
      var key;

      for (key in this.connections) {
        delete this.connections[key];
      }

      for (key in this.enabled) {
        delete this.enabled[key];
      }

      for (key in this.disabled) {
        delete this.enabled[key];
      }

      this.conditional.length = 0;
      this.removeAllListeners();

      this.req = req;
      this.res = res;

      //
      // Start rendering as fast as possible so the browser can start download the
      // resources as fast as possible.
      //
      this.bootstrap();
      this.discover();

      return this;
    }
  }
});

//
// Make's the Page extendable.
//
Page.extend = require('extendable');

//
// Expose the Page on the exports and parse our the directory.
//
Page.on = function on(module) {
  var dir = this.prototype.directory = this.prototype.directory || path.dirname(module.filename)
    , pagelets = this.prototype.pagelets;

  //
  // Resolve pagelets paths.
  //
  if (pagelets) Object.keys(pagelets).forEach(function resolve(pagelet) {
    if ('string' === typeof pagelets[pagelet]) {
      pagelets[pagelet] = path.join(dir, pagelets[pagelet]);
    }
  });

  module.exports = this;
  return this;
};

//
// Expose the constructor.
//
module.exports = Page;
