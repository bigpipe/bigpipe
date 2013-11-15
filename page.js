'use strict';

var debug = require('debug')('bigpipe:page')
  , shared = require('./shared')
  , async = require('async')
  , path = require('path')
  , fs = require('fs')
  , operations = ['post', 'put'];

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
     * The actual Pipe instance.
     *
     * @type {Pipe}
     * @private
     */
    pipe: {
      enumerable: false,
      value: pipe
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
      value: Object.create(null),
      writable: true,
      enumerable: false,
      configurable: true
    },

    /**
     * The incoming HTTP request.
     *
     * @type {Request}
     * @private
     */
    req: {
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
    res: {
      value: null,
      writable: true,
      enumerable: false,
      configurable: true
    },

    /**
     * Counter for the number of processed pagelets.
     *
     * @type {Number}
     * @api private
     */
    n: {
      value: 0,
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

Page.prototype = Object.create(require('eventemitter3').prototype, shared.mixin({
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
   * Character set for page. Setting this to null will not include the meta
   * charset. However this is not advised as this will reduce performace.
   *
   * @type {String}
   * @api private
   */
  charset: {
    value: 'utf-8',
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
   * Provide dynamic data to the view or static object. The data will be merged
   * by dispatch right before rendering the view. The function will be supplied
   * with callback, e.g. function data(next) { ... }
   *
   * @type {Function}
   * @public
   */
  data: {
    value: null,
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

  /**
   * Keep track of rendered pagelets.
   *
   * @type {Array}
   * @private
   */
  queue: {
    value: [],
    writable: true,
    enumerable: false,
    configurable: false
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
   * Redirect the user.
   *
   * @param {String} location Where should we redirect to.
   * @param {Number} status The status number.
   * @api public
   */
  redirect: {
    enumerable: false,
    value: function redirect(location, status) {
      this.res.statusCode = +status || 301;
      this.res.setHeader('Location', location);
      this.res.end();

      debug('%s - %s is redirecting to %s', this.method, this.path, location);
      if (this.listeners('end').length) this.emit('end');
    }
  },

  /**
   * Well, actually, never mind, we shouldn't accept this page so we should
   * render our 404 page instead.
   *
   * @api public
   */
  notFound: {
    enumerable: false,
    value: function notFound() {
      debug('%s - %s is not found, returning Page to freelist and 404-ing', this.method, this.path);

      this.emit('free').pipe.status(this.req, this.res, 404);
      if (this.listeners('end').length) this.emit('end');

      return this;
    }
  },

  /**
   * We've gotten a captured error and we should show a error page.
   *
   * @param {Error} err The error message.
   * @api public
   */
  error: {
    enumerable: false,
    value: function error(err) {
      err = err || new Error('Internal Server Error');
      this.emit('free').pipe.status(this.req, this.res, 500, err);

      debug('%s - %s captured an error: %s, displaying error page instead', this.method, this.path, err);
      if (this.listeners('end').length) this.emit('end');
      return this;
    }
  },

  /**
   * Discover pagelets that we're allowed to use.
   *
   * @param {Function} before iterative function to execute before render.
   * @returns {Page} fluent interface
   * @api private
   */
  discover: {
    enumerable: false,
    value: function discover(before) {
      if (!this.pagelets.length) return this;

      var req = this.req
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
          pagelet.authorize(req, function (allowed) {
            debug('%s - %s pagelet %s/%s was %s on the page'
              , page.method, page.path
              , pagelet.name, pagelet.id, allowed ? 'allowed' : 'disallowd'
            );
            done(allowed);
          });
        } else {
          debug('%s - %s pagelet %s/%s had no authorization function and is allowed on page'
            , page.method, page.path
            , pagelet.name, pagelet.id
          );
          done(true);
        }
      }, function acceptance(allowed) {
        page.enabled = allowed;

        //
        // Keep track of disabled pagelets, also close open POST/PUT request if
        // the pagelet is not included in or allowed for the current page.
        //
        page.disabled = pagelets.filter(function disabled(pagelet) {
          var allow = !~allowed.indexOf(pagelet);
          if (allow && before && before.pagelet === pagelet.name) page.req.destroy();

          return allow;
        });

        allowed.forEach(function initialize(pagelet) {
          if (pagelet.initialize) pagelet.initialize();
          page.pipe.expire.set(pagelet.id, pagelet);
        });

        // @TODO free disabled pagelets
        debug('%s - %s initialised all allowed pagelets', page.method, page.path);
        page[page.mode](before);
      });

      return this;
    }
  },

  /**
   * Mode: Render
   * Output the pagelets fully rendered in the HTML template.
   * @TODO rewrite, not working against altered renderer.
   *
   * @param {String} base The generated base template.
   * @returns {Page} fluent interface
   * @api private
   */
  render: {
    writable: true,
    enumerable: false,
    configurable: true,
    value: function render(base) {
      var page = this;

      debug('%s - %s is rendering the pagelets in `render` mode', this.method, this.path);

      async.forEach(this.enabled, function each(pagelet, next) {
        pagelet.renderer(next);
      }, function done(err, data) {
        // @TODO handle errors
        page.enabled.forEach(function forEach(pagelet, index) {
          var view = page.temper.fetch(pagelet.view).server;

          // @TODO Also write the CSS and JavaScript.
          // @TODO also remove the pagelets that we're disabled.
          base = page.inject(base, pagelet.name, view(data[index]));
        });

        page.done();
      });

      return this;
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
    value: function render(before) {
      var page = this;

      //
      // Render each pagelet, if the request method was POST/PUT #before will
      // be called prior to calling the renderer of the specific pagelet.
      //
      debug('%s - %s is rendering the pagelets in `async` mode', this.method, this.path);
      async.parallel(this.enabled.map(function mapRenderer(pagelet) {
        return before && before.pagelet === pagelet.name
          ? before.bind(page, pagelet.renderer.bind(pagelet))
          : pagelet.renderer.bind(pagelet);
      }), this.done.bind(this));
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
      debug('%s - %s is rendering the pagelets in `pipeline` mode', this.method, this.path);
    }
  },

  /**
   * Close the connection once the main page was sent.
   *
   * @api private
   */
  done: {
    enumerable: false,
    value: function done() {
      var page = this;

      //
      // Do not close the connection before the main page has sent headers.
      //
      if (page.n !== page.pagelets.length) {
        debug('%s - %s not all pagelets have been written, (%s out of %s)',
          this.name, this.id, this.n, this.pagelets.length
        );
        return false;
      }

      //
      // Write disabled pagelets so the client can remove all empty placeholders.
      //
      page.disabled.filter(function filter(pagelet) {
        return !!pagelet.remove;
      }).forEach(function each(pagelet) {
        debug('%s - %s is instructing removal of the %s/%s pagelet'
          , page.method, page.path
          , pagelet.name, pagelet.id
        );

        page.write(pagelet);
      });

      //
      // Send the remaining trailer headers if we have them queued.
      //
      if (page.res.trailer) {
        debug('%s - %s adding trailer headers', this.method, this.path);
        page.res.addTrailers(page.res.trailers);
      }

      //
      // Everything is processed, close the connection.
      //
      page.res.end();
    }
  },

  /**
   * Write a new pagelet to the request.
   *
   * @param {Pagelet} pagelet Pagelet instance.
   * @param {Mixed} data The data returned from Pagelet.render().
   * @param {Function} fn Optional callback to be called when data has been written.
   * @api private
   */
  write: {
    enumerable: false,
    value: function write(pagelet, data, fn) {
      data = data || {};

      var view = this.temper.fetch(pagelet.view).server
        , frag = this.compiler.pagelet(pagelet)
        , output;

      debug('%s - %s writing pagelet %s/%s\'s response'
        , this.method, this.path
        , pagelet.name, pagelet.id
      );

      frag.remove = pagelet.remove;   // Does the front-end need to remove the pagelet.
      frag.id = pagelet.id;           // The internal id of the pagelet.
      frag.data = data;               // Template data for the pagelet.
      frag.rpc = pagelet.RPC;         // RPC methods from the pagelet.

      output = fragment
        .replace(/\{pagelet::name\}/g, pagelet.name)
        .replace(/\{pagelet::data\}/g, JSON.stringify(frag))
        .replace(/\{pagelet::template\}/g, view(data).replace('-->', ''));

      this.n++;
      this.res.write(output, 'utf-8', fn);

      //
      // Optional write confirmation, it got added in more recent versions of
      // node, so if it's not supported we're just going to call the callback
      // our selfs.
      //
      if (this.res.write.length !== 3 && 'function' === typeof fn) {
        fn();
      }
    }
  },

  /**
   * Dispatch will do the following:
   *   - merge additional data from http methods or custom supplier
   *   - check mode and shortcircuit if render sync.
   *   - write the initial headers so the browser can start working.
   *   - dispatch already queued pagelets.
   *
   * @param {String} core data, e.g. the header
   * @param {Function} before iterative function to execute before render.
   * @api private
   */
  dispatch: {
    enumerable: false,
    value: function dispatch(core, before) {
      var page = this
        , stack = []
        , output;

      /**
       * Write content to the client, data is merged before that in
       * the following order: {} - post - custom data - core.
       *
       * @param {Error} err
       * @param {Mixed} data
       * @api private
       */
      function init(err, data) {
        if (err) page.error(new Error('Providing custom data to Page instance failed'));

        //
        // Merge all data.
        //
        data.push(core);
        data = data.reduce(page.merge, {});

        //
        // Generate the main page via temper.
        //
        output = page.temper.fetch(page.view).server(data);

        //
        // Shortcircuit page is in render mode.
        //
        if ('render' === page.mode) return page.render(output);

        //
        // Write the headers.
        //
        page.res.write(output);

        //
        // Hack: As we've already send out our initial headers, all other headers
        // need to be send as "trailing" headers. But none of the modules in the
        // node's eco system are written in a way that they support trailing
        // headers. They are all focused on a simple request/response pattern so
        // we need to override the `setHeader` method so it sends trailer headers
        // instead.
        //
        page.res.trailers = {};
        page.res.trailer = false;
        page.res.setHeader = function setHeader(key, value) {
          this.trailers[key] = value;
          this.trailer = true;

          return this;
        };

        //
        // Write the remaining queued pagelets, if no pagelets
        // are remaining the response will be closed.
        //
        async.parallel(page.queue, page.done.bind(page));
      }

      if ('function' === typeof before) stack.push(before.bind(this));
      if ('function' === typeof page.data) stack.push(page.data.bind(this));

      //
      // Check the data provider and supply it with a callback.
      //
      async.series(stack, init);
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
   * We've been initialized, proceed with rendering if needed.
   * @TODO free the page if initialization already terminated the request
   *
   * @api private
   */
  setup: {
    enumerable: false,
    value: function setup() {
      var req = this.req
        , main = [ 'bootstrap' ]
        , sub = [ 'discover' ]
        , method = req.method.toLowerCase()
        , pagelet;

      //
      // It could be that the initialization handled the page rendering through
      // a `page.redirect()` or a `page.notFound()` call so we should terminate
      // the request once that happens.
      //
      if (this.res.finished) return req.destroy();
      debug('%s - %s is initialising', this.method, this.path);

      //
      // Check if the HTTP method is targetted at a specific pagelet inside the
      // page. If so, only execute the logic contained in pagelet#method.
      // If no pagelet is targeted, check if the page has an implementation, if
      // all else fails make sure we destroy the request.
      //
      if (~operations.indexOf(method)) {
        if ('_pagelet' in req.query) pagelet = this.has(req.query._pagelet);
        if (pagelet && method in pagelet.prototype) {
          method = this.fetch(pagelet.prototype[method]);
          method.pagelet = pagelet.prototype.name;
          sub.push(method);
        } else if (method in this) {
          main.push(this.fetch(this[method]));
        } else {
          req.destroy();
        }
      }

      //
      // Fire the main paths for rendering and dispatching content. Both emits
      // can be supplied with a different set of parameters.
      //  - trigger rendering of page.
      //  - trigger rendering of all pagelets.
      //
      this.emit.apply(this, main);
      this.emit.apply(this, sub);
    }
  },

  /**
   * Helper to check if the page has pagelet by name, must use prototype.name
   * since pagelets are not always constructed yet.
   *
   * @param {String} name of pagelet
   * @returns {Boolean}
   * @api public
   */
  has: {
    enumerable: false,
    value: function has(name) {
      var pagelets = this.pagelets
        , i = pagelets.length;

      while (i--) {
        if (pagelets[i].prototype.name === name) break;
      }

      return pagelets[i];
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
   * @param {Function} before data
   * @returns {Page} fluent interface
   * @api private
   */
  bootstrap: {
    enumerable: false,
    value: function bootstrap(before) {
      var charset = this.charset
        , library = this.compiler.page(this)
        , path = this.req.uri.pathname
        , data = {}
        , head = [];

      //
      // Add the character set asap for performance, defaults to utf-8.
      //
      if (charset) head.push('<meta charset="' + charset + '">');

      if (this.mode !== 'render') {
        head.push(
          '<noscript>',
          '<meta http-equiv="refresh" content="0; URL='+ path +'?no_pagelet_js=1">',
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
        head.push('<link rel="stylesheet" href="'+ url +'">');
      });

      library.js.forEach(function inject(url) {
        head.push('<script type="text/javascript" src="'+ url +'"></script>');
      });

      head.push('<script>pipe = new BigPipe();</script>');

      // @TODO rel prefetch for resources that are used on the next page?
      // @TODO cache manifest.
      // @TODO rel dns prefetch.

      this.res.statusCode = this.statusCode;
      this.res.setHeader('Content-Type', 'text/html');

      //
      // Supply data to the view and render after. Make sure the defined head
      // key cannot be overwritten by any custom data.
      //
      Object.defineProperty(data, this.pipe.options('head', 'bootstrap'), {
        writable: false,
        enumerable: true,
        value: head.join('\n')
      });

      //
      // Page and headers are bootstrapped. Dispatch the headers.
      //
      this.dispatch(data, before);
      return this;
    }
  },

  /**
   * Delegate processed and received data to the supplied page#method
   *
   * @param {Function} method page delegation method
   * @returns {Function} processor
   * @api private
   */
  fetch: {
    enumerable: false,
    value: function fetch(method) {
      var page = this;

      /**
       * Process incoming request.
       *
       * @param {Fucntion} next completion callback.
       * @api private
       */
      return function process(next) {
        var bytes = page.bytes
          , req = page.req
          , received = 0
          , buffers = []
          , err;

        function data(buffer) {
          received += buffer.length;

          buffers.push(buffer);

          if (bytes && received > bytes) {
            req.removeListener('data', data);
            req.destroy(err = new Error('Request was too large and has been destroyed to prevent DDOS.'));
          }
        }

        //
        // Only process data if we received any.
        //
        req.on('data', data);
        req.once('end', function end() {
          if (err) return next(err);

          //
          // Use Buffer#concat to join the different buffers to prevent UTF-8 to be
          // broken.
          //
          req.removeListener('data', data);
          method(undefined, Buffer.concat(buffers), next);

          buffers.length = 0;
        });
      };
    }
  },

  /**
   * Reset the instance to it's original state and initialise it.
   *
   * @param {ServerRequest} req HTTP server request.
   * @param {ServerResponse} res HTTP server response.
   * @api private
   */
  configure: {
    enumerable: false,
    value: function configure(req, res) {
      var mode = this.mode
        , page = this
        , key;

      //
      // Clear any previous listeners, the counter and added pagelets.
      //
      this.removeAllListeners();
      this.queue.length = this.n = 0;

      for (key in this.enabled) {
        delete this.enabled[key];
      }

      for (key in this.disabled) {
        delete this.disabled[key];
      }

      this.req = req;
      this.res = res;

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
      if (
           'no_pagelet_js' in req.uri.query
        || !(req.httpVersionMajor >= 1 && req.httpVersionMinor >= 1)
      ) {
        debug('%s - %s forcing `render` mode instead of %s', this.method, this.path, mode);
        this.mode = mode = 'render';
      }

      //
      // Listen to events that setup the main BigPipe routes, pages and pagelets.
      //
      this.once('bootstrap', this.bootstrap.bind(this));
      this.once('discover', this.discover.bind(this));

      debug('%s - %s is configured', this.method, this.path);
      if (this.initialize) {
        if (this.initialize.length) {
          debug('%s - %s waiting for `initialize` method before discovering pagelets', this.method, this.path);
          this.initialize(this.setup.bind(this));
        } else {
          this.initialize();
          this.setup();
        }
      } else {
        this.setup();
      }

      return this;
    }
  }
}));

//
// Make the Page extendable.
//
Page.extend = require('extendable');

//
// Expose the Page on the exports and parse our the directory.
//
Page.on = function on(module) {
  var dir = this.prototype.directory = this.prototype.directory || path.dirname(module.filename)
    , pagelets = this.prototype.pagelets
    , resolve = this.prototype.resolve;

  //
  // Resolve pagelets and resource paths.
  //
  if (pagelets) Object.keys(pagelets).forEach(resolve(dir, pagelets));

  module.exports = this;
  return this;
};

//
// Expose the constructor.
//
module.exports = Page;
