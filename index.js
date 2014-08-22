'use strict';

var debug = require('diagnostics')('bigpipe:server')
  , Compiler = require('./lib/compiler')
  , fabricate = require('fabricator')
  , Primus = require('primus')
  , Temper = require('temper')
  , fuse = require('fusing')
  , async = require('async')
  , path = require('path')
  , url = require('url')
  , fs = require('fs');

//
// Automatically add trailers support to Node.js.
//
var trailers = require('trailers');

/**
 * Queryable options with merge and fallback functionality.
 *
 * @param {Object} obj
 * @returns {Function}
 * @api private
 */
function configure(obj) {
  /**
   * Get an option.
   *
   * @param {String} key Name of the opt
   * @param {Mixed} backup Fallback data if key does not exist.
   * @api public
   */
  function get(key, backup) {
    if (key in obj) return obj[key];
    if (backup) obj[key] = backup;

    return obj[key];
  }

  //
  // Allow new options to be be merged in against the original object.
  //
  get.merge = function merge(properties) {
    return Pipe.predefine.merge(obj, properties);
  };

  return get;
}

/**
 * Our pagelet management.
 *
 * The following options are available:
 *
 * - cache: A object were we store our URL->page mapping.
 * - dist: The pathname for the compiled assets.
 * - pages: String or array of pages we serve.
 * - parser: Which parser should be used to send data in real-time.
 * - pathname: The pathname we use for Primus requests.
 * - transformer: The transport engine we should use for real-time.
 *
 * @constructor
 * @param {Server} server HTTP/S based server instance.
 * @param {Object} options Configuration.
 * @api public
 */
function Pipe(server, options) {
  if (!(this instanceof Pipe)) return new Pipe(server, options);
  this.fuse();

  options = configure(options || {});

  var readable = this.readable
    , writable = this.writable
    , bigpipe = this;

  //
  // Constants and properties that should never be overridden.
  //
  readable('statusCodes', Object.create(null));       // Stores error pages.
  readable('cache', options('cache', false));         // Enable URL lookup caching.
  readable('plugins', Object.create(null));           // Plugin storage.
  readable('options', options);                       // Configure options.
  readable('temper', new Temper());                   // Template parser.
  readable('server', server);                         // HTTP server we work with.
  readable('layers', []);                             // Middleware layer.
  readable('pages', []);                              // Stores our pages.

  //
  // Setup our real-time server.
  //
  readable('primus', new Primus(this.server, {
    transformer: options('transformer', 'websockets'),// Real-time framework to use.
    pathname: options('pathname', '/pagelets'),       // Primus pathname.
    parser: options('parser', 'json'),                // Message parser.
    plugin: {
      substream: require('substream')                 // Volatile name spacing.
    }
  }));

  //
  // Setup the asset compiler before the pages are discovered as they will need
  // to hook in to the compiler to register all assets that are loaded from
  // pagelets.
  //
  readable('compiler', new Compiler(
    options('dist', path.join(process.cwd(), 'dist')), this, {
      pathname: options('static', '/')
  }));

  //
  // Add our default middleware layers, this needs to be done before we
  // initialize or add plugins as we want to make sure that OUR middleware is
  // loaded first as it's the most important (at least, in our opinion).
  //
  this.before('compiler', this.compiler.serve);

  //
  // Apply the plugins before resolving and transforming the pages so the
  // plugins can hook in to our optimization and transformation process.
  //
  this.pluggable(options('plugins', []));
  this.use(require('./plugins/pagelet'));

  //
  // Finally, now that everything has been setup we can discover the pagelets
  // that we need serve from our server.
  //
  this.define(options('pages', path.join(process.cwd(), '/pages')), function () {
    //
    // we should probably set a boolean or emit an event here as everything is
    // ready
  });
}

//
// Inherit from EventEmitter3 as we need to emit listen events etc.
//
fuse(Pipe, require('eventemitter3'));

/**
 * The current version of the library.
 *
 * @type {String}
 * @public
 */
Pipe.readable('version', require(__dirname +'/package.json').version);

/**
 * Start listening for incoming requests.
 *
 * @param {Number} port port to listen on
 * @param {Function} done callback
 * @return {Pipe} fluent interface
 * @api public
 */
Pipe.readable('listen', function listen(port, done) {
  var pipe = this;

  //
  // Find all assets and compile them before we start listening to the server as
  // we don't want to serve un-compiled assets. And we should only start
  // listening on the server once we're actually ready to respond to requests.
  //
  pipe.compiler.catalog(this.pages, function init(error) {
    if (error) {
      if (done) return done(error);
      throw error;
    }

    //
    // Don't allow double calls to .listen this causes the request listener to
    // be added twice and result in the site being rendered and outputted twice
    // for the same request.
    //
    if (pipe.primus.transformer.listeners('previous::request').length) {
      throw new Error('BigPipe#listen should only be called once');
    }

    pipe.primus.transformer.on('previous::request', pipe.bind(pipe.dispatch));
    pipe.primus.on('connection', pipe.bind(pipe.connection));
    pipe.server.on('listening', pipe.emits('listening'));
    pipe.server.on('error', pipe.emits('error'));

    //
    // Start listening on the provided port and return the BigPipe instance.
    //
    debug('succesfully prepared the assets, starting HTTP server on port %d', port);
    pipe.server.listen(port, done);
  });

  return pipe;
});

/**
 * Discover if the user supplied us with custom error pages so we use that
 * in case we need to handle a 404 or and 500 error page.
 *
 * @param {Array} pages All enabled pages.
 * @returns {Pipe} fluent interface
 * @api private
 */
Pipe.readable('discover', function discover(pages, next) {
  var bigpipe = this
    , fivehundered
    , fourofour;

  debug('discovering build-in error pages');

  pages.forEach(function each(page) {
    if (page.router.test('/500')) fivehundered = page;
    if (page.router.test('/404')) fourofour = page;
  });

  async.map([fourofour || '404', fivehundered || '500'], function (Page, next) {
    if ('string' !== typeof Page) return next(undefined, Page);

    debug('no /'+ Page +' error page detected, using default bigpipe error page');

    Page = require('./pages/'+ Page);
    Page.optimize(bigpipe, function optimized(err) {
      next(err, Page);
    });
  }, function found(err, status) {
    if (err) return next(err);

    bigpipe.statusCodes[404] = status[0];
    bigpipe.statusCodes[500] = status[1];

    next();
  });

  return this;
});

/**
 * Render a page from our `statusCodes` collection.
 *
 * @param {Request} req HTTP request.
 * @param {Response} res HTTP response.
 * @param {Number} code The status we should handle.
 * @param {Mixed} data Nothing or something :D
 * @api private
 */
Pipe.readable('status', function status(req, res, code, data) {
  if (!(code in this.statusCodes)) {
    throw new Error('Unsupported HTTP code: '+ code +'.');
  }

  var Page = this.statusCodes[code]
    , page = new Page(this);

  page.data = data || {};
  page.data.env = process.env.NODE_ENV;
  page.configure(req, res);

  return this;
});

/**
 * Insert page into collection of pages. If page is a manually instantiated
 * Page push it in, otherwise resolve the path, always transform the page. After
 * dependencies are catalogued the callback will be called.
 *
 * @param {Mixed} pages array of composed Page objects or file path.
 * @param {Function} done callback
 * @api public
 */
Pipe.readable('define', function define(pages, done) {
  var bigpipe = this;

  async.map(fabricate(pages), function map(Page, next) {
    Page.optimize(bigpipe, function optimized(err) {
      next(err, Page);
    });
  }, function fabricated(err, pages) {
    if (err) return done(err);

    bigpipe.pages.push.apply(bigpipe.pages, pages);
    bigpipe.discover(pages, done);
  });

  return this;
});

/**
 * Bind performance is horrible. This introduces an extra function call but can
 * be heavily optimized by the V8 engine. Only use this in cases where you would
 * normally use `.bind`.
 *
 * @param {Function} fn A method of pipe.
 * @returns {Function}
 * @api private
 */
Pipe.readable('bind', function bind(fn) {
  var pipe = this;

  return function bound(arg1, arg2, arg3) {
    fn.call(pipe, arg1, arg2, arg3);
  };
});

/**
 * Find and initialize pages based on a given id or on the pathname of the
 * request.
 *
 * @param {HTTP.Request} req The incoming HTTP request.
 * @param {HTTP.Response} res The outgoing HTTP request.
 * @param {String} id Optional id of page we specifically need.
 * @param {Function} next Continuation callback
 * @api private
 */
Pipe.readable('router', function router(req, res, id, next) {
  if ('function' === typeof id) {
    next = id;
    id = undefined;
  }

  var key = id ? id : req.method +'@'+ req.uri.pathname
    , pages = this.cache ? this.cache.get(key) || [] : []
    , length = this.pages.length
    , pipe = this
    , i = 0
    , page;

  if (!pages.length) {
    if (id) for (; i < length; i++) {
      page = this.pages[i];

      if (id === page.prototype.id) {
        pages.push(page);
        break;
      }
    } else for (; i < length; i++) {
      page = this.pages[i];

      if (!page.router.test(req.uri.pathname)) continue;
      if (page.method.length && !~page.method.indexOf(req.method)) continue;

      pages.push(page);
    }

    if (this.cache && pages.length) {
      this.cache.set(key, pages);
      debug('added key %s and its found pages to our internal lookup cache', key);
    }
  }

  //
  // Add an extra 404 page so we always have an page to display.
  //
  pages.push(this.statusCodes[404]);

  //
  // It could be that we have selected a couple of authorized pages. Filter
  // those out before sending the and initialized page to the callback.
  //
  (function each(pages) {
    var Page = pages.shift()
      , page = new Page(pipe);

    debug('iterating over pages for %s testing %s atm', req.url, page.path);

    //
    // Make sure we parse out all the parameters from the URL as they might be
    // required for authorization purposes.
    //
    page.params = Page.router.exec(req.uri.pathname) || {};

    if ('function' === typeof page.authorize) {
      page.req = req;   // Might be needed to retrieve sessions.
      page.res = res;   // Might be needed for redirects.

      return page.authorize(req, function authorize(allowed) {
        debug('%s required authorization we are %s', page.path, allowed ? 'allowed' : 'disallowed');

        if (allowed) return next(undefined, page);
        each(pages);
      });
    }

    debug('Using %s for %s', page.path, req.url);
    next(undefined, page);
  }(pages.slice(0)));

  return this;
});

/**
 * Add a new middleware layer. If no middleware name has been provided we will
 * attempt to take the name of the supplied function. If that fails, well fuck,
 * just random id it.
 *
 * @param {String} name The name of the middleware.
 * @param {Function} fn The middleware that's called each time.
 * @param {Object} options Middleware configuration.
 * @returns {Pipe}
 * @api public
 */
Pipe.readable('before', function before(name, fn, options) {
  if ('function' === typeof name) {
    options = fn;
    fn = name;
    name = fn.name || 'pid_'+ Date.now();
  }

  options = options || {};

  //
  // No or only 1 argument means that we need to initialize the middleware, this
  // is a special initialization process where we pass in a reference to the
  // initialized Pipe instance so a pre-compiling process can be done.
  //
  if (fn.length < 2) fn = fn.call(this, options);

  //
  // Make sure that the given or returned function can
  //
  if ('function' !== typeof fn || fn.length < 2) {
    throw new Error('Middleware should be a function that accepts at least 2 args');
  }

  //
  // Add the middleware layers to primus as well.
  //
  if (options.primus) this.primus.before(name, fn);

  var layer = {
    length: fn.length,                // Amount of arguments indicates if it's a sync
    enabled: true,                    // Middleware is enabled by default.
    name: name,                       // Used for lookups.
    fn: fn                            // The actual middleware.
  }, index = this.indexOfLayer(name);

  //
  // Override middleware layers if we already have a middleware layer with
  // exactly the same name.
  //
  if (~index) {
    this.layers.push(layer);
  } else {
    debug('Duplicate middleware layer found, overwriting %s', name);
    this.layers[index] = layer;
  }

  return this;
});

/**
 * Remove a middleware layer from the stack.
 *
 * @param {String} name The name of the middleware.
 * @returns {Pipe}
 * @api public
 */
Pipe.readable('remove', function remove(name) {
  var index = this.indexOfLayer(name);

  if (~index) this.layers.splice(index, 1);
  return this;
});

/**
 * Enable a given middleware layer.
 *
 * @param {String} name The name of the middleware.
 * @returns {Pipe}
 * @api public
 */
Pipe.readable('enable', function enable(name) {
  var index = this.indexOfLayer(name);

  if (~index) this.layers[index].enabled = true;
  return this;
});

/**
 * Disable a given middleware layer.
 *
 * @param {String} name The name of the middleware.
 * @returns {Pipe}
 * @api public
 */
Pipe.readable('disable', function disable(name) {
  var index = this.indexOfLayer(name);

  if (~index) this.layers[index].enabled = false;
  return this;
});

/**
 * Find the index of a given middleware layer by name.
 *
 * @param {String} name The name of the layer.
 * @returns {Number}
 * @api private
 */
Pipe.readable('indexOfLayer', function indexOfLayer(name) {
  for (var i = 0, length = this.layers.length; i < length; i++) {
    if (this.layers[i].name === name) return i;
  }

  return -1;
});

/**
 * Run the plugins.
 *
 * @param {Array} plugins List of plugins.
 * @returns {Pipe} fluent interface
 * @api private
 */
Pipe.readable('pluggable', function pluggable(plugins) {
  var pipe = this;

  plugins.forEach(function plug(plugin) {
    pipe.use(plugin);
  });

  return this;
});

/**
 * Dispatch incoming requests.
 *
 * @param {Request} req HTTP request.
 * @param {Response} res HTTP response.
 * @returns {Pipe} fluent interface
 * @api private
 */
Pipe.readable('dispatch', function dispatch(req, res) {
  var pipe = this;

  /**
   * Something failed while processing things. Display an error page.
   *
   * @param {String}
   * @api private
   */
  function fivehundered(err) {
    var page = new pipe.statusCodes[500](pipe);

    //
    // Set an error as data so it can be used as data in the template.
    //
    page.data = err;
    page.configure(req, res);
  }

  return this.forEach(req, res, function next(err) {
    if (err) return fivehundered(err);

    pipe.router(req, res, function completed(err, page) {
      if (err) return fivehundered(err);

      page.configure(req, res);
    });
  });
});

/**
 * Iterate all the middleware layers that we're set on our Pipe instance.
 *
 * @param {Request} req HTTP request.
 * @param {Response} res HTTP response.
 * @param {Function} next Continuation callback.
 * @api private
 */
Pipe.readable('forEach', function forEach(req, res, next) {
  var layers = this.layers
    , pipe = this;

  req.uri = req.uri || url.parse(req.url, true);
  req.query = req.query || req.uri.query || {};

  //
  // Add some silly HTTP properties for connect.js compatibility.
  //
  req.originalUrl = req.url;

  if (!layers.length) {
    next();
    return this;
  }

  //
  // Async or sync call the middleware layer.
  //
  (function iterate(index) {
    var layer = layers[index++];

    if (!layer) return next();
    if (!layer.enabled) return iterate(index);

    debug('applying middleware %s on %s', layer.name, req.url);

    if (layer.length === 2) {
      //
      // When true is returned we don't want to continue with the iteration of
      // the middle and we certainly don't want to call the callback as the
      // request will be handled by the specified middleware.
      //
      if (layer.fn.call(pipe, req, res) === true) return;
      return iterate(index);
    }

    layer.fn.call(pipe, req, res, function done(err) {
      if (err) return next(err);

      iterate(index);
    });
  }(0));

  return this;
});

/**
 * Register a new plugin.
 *
 * ```js
 * bigpipe.use('ack', {
 *   //
 *   // Only ran on the server.
 *   //
 *   server: function (bigpipe, options) {
 *      // do stuff
 *   },
 *
 *   //
 *   // Runs on the client, it's automatically bundled.
 *   //
 *   client: function (bigpipe, options) {
 *      // do client stuff
 *   },
 *
 *   //
 *   // Optional library that needs to be bundled on the client (should be a string)
 *   //
 *   library: '',
 *
 *   //
 *   // Optional plugin specific options, will be merged with Bigpipe.options
 *   //
 *   options: {}
 * });
 * ```
 *
 * @param {String} name The name of the plugin.
 * @param {Object} plugin The plugin that contains client and server extensions.
 * @api public
 */
Pipe.readable('use', function use(name, plugin) {
  if ('object' === typeof name) {
    plugin = name;
    name = plugin.name;
  }

  if (!name) throw new Error('Plugin should be specified with a name.');
  if ('string' !== typeof name) throw new Error('Plugin names should be a string.');
  if ('string' === typeof plugin) plugin = require(plugin);

  //
  // Plugin accepts an object or a function only.
  //
  if (!/^(object|function)$/.test(typeof plugin)) {
    throw new Error('Plugin should be an object or function.');
  }

  //
  // Plugin require a client, server or both to be specified in the object.
  //
  if (!('server' in plugin || 'client' in plugin)) {
    throw new Error('The plugin in missing a client or server function.');
  }

  if (name in this.plugins) {
    throw new Error('The plugin name was already defined. Please select an unique name for each plugin');
  }

  debug('added plugin `%s`', name);

  this.plugins[name] = plugin;
  if (!plugin.server) return this;

  this.options.merge(plugin.options || {});
  plugin.server.call(this, this, this.options);

  return this;
});

/**
 * Find a bunch of connected real-time connections based on the supplied query
 * parameters.
 *
 * Query:
 *
 * - page: The id of the page
 * - pagelet: The name of the pagelet
 * - id: The id of a pagelet
 * - enabled: State of pagelet (defaults to true)
 *
 * @param {String} url The URL to find.
 * @param {Object} query Query object.
 * @returns {Array}
 * @api public
 */
Pipe.readable('find', function find(url, query) {
  var results = []
    , enabled = query.enabled === false ? false : true;

  this.primus.forEach(function each(spark) {
    if (!spark.page || !spark.page.constructor.router.test(url)) return;

    var page = spark.page;

    if (query.page && query.page === page.id) {
      results.push(page);
    }

    if (query.pagelet && page.has(query.pagelet, enabled)) {
      results.push(page.has(query.pagelet, enabled));
    }

    if (query.id) page.enabled.forEach(function each(pagelet) {
      if (pagelet.id === query.id) results.push(pagelet);
    });
  });

  return results;
});

/**
 * Handle incoming real-time requests.
 *
 * @param {Spark} spark A real-time "socket".
 * @api private
 */
Pipe.readable('connection', require('./primus'));

/**
 * Create a new Pagelet/Pipe server.
 *
 * @param {Number} port port to listen on
 * @param {Object} options Configuration.
 * @returns {Pipe}
 * @api public
 */
Pipe.createServer = function createServer(port, options) {
  options = 'object' === typeof port ? port : options || {};
  if ('number' === typeof port) options.port = port;

  var listen = options.listen === false;

  //
  // Listening is done by our own .listen method, so we need to tell the
  // createServer module that we don't want it to start listening to our sizzle.
  // This option is forced and should not be override by users configuration.
  //
  options.listen = false;

  var pipe = new Pipe(require('create-server')(options), options);

  if (!listen) return pipe.listen(options.port);
  return pipe;
};

//
// Expose our constructors.
//
Pipe.Pagelet = require('pagelet');
Pipe.Page = require('./page');

//
// Expose the constructor.
//
module.exports = Pipe;
