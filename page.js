'use strict';

var async = require('async')
  , path = require('path')
  , fs = require('fs');

/**
 * The fragment is actual chunk of the response that is written for each
 * pagelet.
 *
 * @type {String}
 * @private
 */
var fragment = fs.readFileSync(__dirname +'/pagelet.fragment', 'utf-8');

/**
 * A simple object representation of a given page.
 *
 * @constructor
 * @api public
 */
function Page(pipe) {
  Object.defineProperties(this, {
    /**
     * Reference to our template compiler and caching engine.
     *
     * @type {Temper}
     * @private
     */
    temper: {
      enumerable: false,
      value: pipe.temper
    },

    /**
     * Reference to the asset management.
     *
     * @type {Librarian}
     * @private
     */
    compiler: {
      enumerable: false,
      value: pipe.compiler
    },

    /**
     * Contains all disabled pagelets.
     *
     * @type {Array}
     * @private
     */
    disabled: {
      value: [],
      writable: true,
      enumerable: false,
      configurable: true
    },

    /**
     * Contains all enabled pagelets.
     *
     * @type {Array}
     * @private
     */
    enabled: {
      value: [],
      writable: true,
      enumerable: false,
      configurable: true
    },

    /**
     * Required for EventEmitter, stores the listeners.
     *
     * @type {Object}
     * @private
     */
    _events: {
      enumerable: false,
      value: Object.create(null),
    },

    /**
     * The incoming HTTP request.
     *
     * @type {Request}
     * @private
     */
    incoming: {
      value: null,
      writable: true,
      enumerable: false,
      configurable: true
    },

    /**
     * The outgoing HTTP response.
     *
     * @type {Response}
     * @private
     */
    outgoing: {
      value: null,
      writable: true,
      enumerable: false,
      configurable: true
    }
  });

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
   * An authorization handler to see if the request is authorized to interact with
   * this page. This is set to `null` by default as there isn't any
   * authorization in place. The authorization function will receive 2 arguments:
   *
   * - req, the http request that initialized the pagelet
   * - done, a callback function that needs to be called with only a boolean.
   *
   * ```js
   * Page.extend({
   *   authorize: function authorize(req, done) {
   *     done(true); // True indicates that the request is authorized for access.
   *   }
   * });
   * ```
   *
   * @type {Function}
   * @public
   */
  authorize: {
    value: null,
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

  /**
   * Dependencies. These are the common, shared files that need to be loaded
   * globally. This array will be set
   *
   * @type {Array}
   * @private
   */
  dependencies: {
    value: {},
    writable: true,
    enumerable: false,
    configurable: true
  },

  //
  // !IMPORTANT
  //
  // Function's should never overridden as we might depend on them internally,
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
   * @param {String} mode The render mode for the pagelets.
   * @param {Object} data The POST data, if any
   * @api private
   */
  discover: {
    enumerable: false,
    value: function discover(mode, data) {
      if (!this.pagelets.length) return false;

      var incoming = this.incoming
        , page = this
        , pagelets;

      pagelets = this.pagelets.map(function allocate(Pagelet) {
        return Pagelet.freelist.alloc().configure(page);
      });

      //
      // The Pipe#transform has transformed our pagelets object in to an array
      // so we can easily iterate over them.
      //
      async.filter(pagelets, function rejection(pagelet, done) {
        //
        // Check if the given pagelet has a custom authorization method which we
        // need to call and figure out if the pagelet is available.
        //
        if ('function' === typeof pagelet.authorize) {
          pagelet.authorize(incoming, done);
        } else {
          done(true);
        }
      }, function acceptance(allowed) {
        page.enabled = allowed;

        page.disabled = pagelets.filter(function disabled(pagelet) {
          return !!allowed.indexOf(pagelet);
        });

        if (data) page.enabled.forEach(function process(pagelet) {
          if (pagelet.incoming) pagelet.incoming(data);
        });

        //
        // Render the pagelets using the specified render mode. If they
        // specified an incorrect render mode, it will just throw.
        //
        page[mode]();
      });

      return true;
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
      var page = this;

      async.forEach(this.enabled, function each(pagelet, next) {
        pagelet.render(function rendering(err, data) {
          page.write(pagelet, data);
          next();
        });
      }, function done() {
        page.disabled.filter(function filter(pagelet) {
          return !!pagelet.remove;
        }).forEach(function each(pagelet) {
          page.write(pagelet);
        });

        //
        // Send the remaining trailer headers if we have them queued.
        //
        if (page.outgoing.trailer) {
          page.outgoing.addTrailers(page.outgoing.trailers);
        }

        page.outgoing.end();
      });
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
   * Write a new pagelet to the request.
   *
   * @param {Pagelet} pagelet Pagelet instance.
   * @param {Mixed} data The data returned from Pagelet.render().
   * @api private
   */
  write: {
    enumerable: false,
    value: function write(pagelet, data) {
      data = data || {};

      var view = this.temper.fetch(pagelet.view).server
        , frag = this.compiler.pagelet(pagelet);

      frag.remove = pagelet.remove;
      frag.data = data;

      this.outgoing.write(fragment
        .replace(/\{pagelet::name\}/g, pagelet.name)
        .replace(/\{pagelet::data\}/g, JSON.stringify(frag))
        .replace(/\{pagelet::template\}/g, view(data).replace('-->', ''))
      );
    }
  },

  /**
   * Inject the output of a template directly in to view's pagelet placeholder
   * element.
   *
   * @param {String} base The template where we need to inject in to.
   * @param {String} name Name of the pagelet.
   * @param {String} view The generated pagelet view.
   * @returns {String} updated base template
   * @api private
   */
  inject: {
    enumerable: false,
    value: function inject(base, name, view) {
      [
        "data-pagelet='"+ name +"'",
        'data-pagelet="'+ name +'"',
        'data-pagelet='+ name,
      ].forEach(function locate(attribute) {
        var index = base.indexOf(attribute)
          , end;

        //
        // As multiple versions of the pagelet can be included in to one single
        // page we need to search for multiple occurrences of the `data-pagelet`
        // attribute.
        //
        while (~index) {
          end = base.indexOf('>', index);

          if (~end) {
            base = base.slice(0, end + 1) + view + base.slice(end + 1);
            index = end + 1 + view.length;
          }

          index = base.indexOf(attribute, index + 1);
        }
      });

      return base;
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
      var method = this.pagelets.length ? 'write' : 'end'
        , view = this.temper.fetch(this.view).server
        , head = ['<meta charset="utf-8" />']
        , library = this.compiler.page(this)
        , path = this.incoming.uri.pathname;

      if (mode !== 'render') {
        head.push(
          '<noscript>',
          '<meta http-equiv="refresh" content="0; URL='+ path +'?no_pagelet_js=1" />',
          '</noscript>'
        );
      } else {
        head.push(
          '<script>',
          'if (location.search.indexOf("no_pagelet_js=1"))',
          'location.href = location.href.replace(location.search, "")',
          '</script>'
        );
      }

      if (library.css) library.css.forEach(function inject(url) {
        head.push('<link rel="stylesheet" href="'+ url +'" />');
      });

      library.js.forEach(function inject(url) {
        head.push('<script type="text/javascript" src="'+ url +'"></script>');
      });

      head.push('<script>pipe = new BigPipe();</script>');

      // @TODO rel prefetch for resources that are used on the next page?
      // @TODO cache manifest.
      // @TODO rel dns prefetch.

      this.outgoing.setHeader('Content-Type', 'text/html');
      this.outgoing[method](view({
        bootstrap: head.join('\n')
      }));

      //
      // Hack: As we've already send out our initial headers, all other headers
      // need to be send as "trailing" headers. But none of the modules in the
      // node's eco system are written in a way that they support trailing
      // headers. They are all focused on a simple request/response pattern so
      // we need to override the `setHeader` method so it sends trailer headers
      // instead.
      //
      this.outgoing.trailers = {};
      this.outgoing.trailer = false;
      this.outgoing.setHeader = function setHeader(key, value) {
        this.trailers[key] = value;
        this.trailer = true;

        return this;
      };

      return this;
    }
  },

  /**
   * Reset the instance to it's original state and initialise it.
   *
   * @param {ServerRequest} req HTTP server request.
   * @param {ServerResponse} res HTTP server response.
   * @param {Object} data POST data.
   * @api private
   */
  configure: {
    enumerable: false,
    value: function configure(req, res, data) {
      var mode = this.mode
        , key;

      this.removeAllListeners();
      for (key in this.enabled) {
        delete this.enabled[key];
      }

      for (key in this.disabled) {
        delete this.enabled[key];
      }

      this.incoming = req;
      this.outgoing = res;

      //
      // If we have a `no_pagelet_js` flag, we should force a different
      // rendering mode. This parameter is automatically added when we've
      // detected that someone is browsing the site without JavaScript enabled.
      //
      // In addition to that, the other render modes only work if your browser
      // supports trailing headers which where introduced in HTTP 1.1 so we need
      // to make sure that this is something that the browser understands.
      // Instead of checking just for `1.1` we want to make sure that it just
      // tests for every http version above 1.0 as http 2.0 is just around the
      // corner.
      //
      if ('no_pagelet_js' in req.uri.query || !(req.httpVersionMajor >= 1 && req.httpVersionMinor >= 1)) {
        mode = 'render';
      }

      //
      // Start rendering as fast as possible so the browser can start download the
      // resources as fast as possible.
      //
      this.bootstrap(mode);
      this.discover(mode, data);

      return this;
    }
  }
});

//
// Make the Page extendable.
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
