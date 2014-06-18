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
 * - transport: The transport engine we should use for real-time.
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
    , writable = this.writable;

  //
  // Constants and properties that should never be overridden.
  //
  readable('statusCodes', Object.create(null));       // Stores error pages.
  readable('cache', options('cache', false));         // Enable URL lookup caching.
  readable('plugins', Object.create(null));           // Plugin storage.
  readable('options', options);                       // Configure options.
  readable('temper', new Temper);                     // Template parser.
  readable('server', server);                         // HTTP server we work with.
  readable('layers', []);                             // Middleware layer.

  //
  // Setup our real-time server
  //
  readable('primus', new Primus(this.server, {
    transformer: options('transport', 'websockets'),  // Real-time framework to use.
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
  // Create constructible page instances.
  //
  readable('pages', this.resolve(
    fabricate(options('pages', path.join(process.cwd(), '/pages'))),
    this.transform) || []
  );

  //
  // Finally, now that everything has been setup we can discover the pagelets
  // that we need serve from our server.
  //
  this.discover(this.pages);
}

//
// Add event emitting, do not inherit the resolve method, BigPipe has it own.
//
fuse(Pipe, require('eventemitter3'), { resolve: false });

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
    if (error) return done(error);

    pipe.primus.on('connection', pipe.bind(pipe.connection));
    pipe.server.on('listening', pipe.emits('listening'));
    pipe.server.on('request', pipe.bind(pipe.dispatch));
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
 * Transform strings, array of strings, objects, things in to the actual
 * constructors.
 *
 * @param {String|Array|Object} files The files.
 * @param {Function} transform Transformation function
 * @returns {Array}
 * @api private
 */
Pipe.readable('resolve', function resolve(files, transform) {
  //
  // Filter invalid page or pagelet instances.
  //
  files = files.filter(function filter(constructor) {
    if ('function' === typeof constructor) return true;
    return debug(
      'Invalid page or pagelet constructor, ignoring the file: %s',
      JSON.stringify(constructor) || constructor.toString()
    );
  }, this).filter(Boolean);

  return transform
    ? files.map(transform, this)
    : files;
});

/**
 * Discover if the user supplied us with custom error pages so we use that
 * in case we need to handle a 404 or and 500 error page.
 *
 * @param {Array} pages All enabled pages.
 * @returns {Pipe} fluent interface
 * @api private
 */
Pipe.readable('discover', function discover(pages) {
  var catalog = pages || []
    , fivehundered
    , fourofour;

  debug('discovering build-in error pages');

  pages.forEach(function each(page) {
    if (page.router.test('/500')) fivehundered = page;
    if (page.router.test('/404')) fourofour = page;
  });

  //
  // We don't have any 500 or 404 handlers, so use some default pages that are
  // provided by us. But as these page are not processed yet, we need to kick
  // them through our transform process.
  //
  if (!fivehundered) {
    debug('no /500 error page detected, using default bigpipe error page');
    fivehundered = this.transform(require('./pages/500'));
    catalog.push(fivehundered);
  }

  if (!fourofour) {
    debug('no /404 error page detected, using default bigpipe not found page');
    fourofour = this.transform(require('./pages/404'));
    catalog.push(fourofour);
  }

  this.statusCodes[500] = fivehundered;
  this.statusCodes[404] = fourofour;

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
 * We need to extract items from the Page prototype and transform it in to
 * something useful.
 *
 * @param {Page} page Page constructor.
 * @returns {Page} The upgrade page.
 * @api private
 */
Pipe.readable('transform', function transform(Page) {
  return Page.optimize(this);
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
  if (!pages) return this;
  if ('function' === typeof pages) pages = [ pages ];

  //
  // Transform the mixed pages into useful constructors.
  //
  pages = this.resolve(fabricate(pages), this.transform);

  //
  // Add the pages to the collection and catalog the dependencies.
  //
  this.pages.push.apply(this.pages, pages);
  this.compiler.catalog(pages, done);

  debug('added a new set of pages to bigpipe');

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
  if (!~index) this.layers.push(layer);
  else this.layers[index] = layer;

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
      if (layer.fn.call(pipe, req, res)) return;
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
  options = options || {};

  var certs = options.key && options.cert
    , secure = certs || 443 === port
    , spdy = 'spdy' in options
    , server;

  //
  // We need to have SSL certs for SPDY and secure servers.
  //
  if ((secure || spdy) && !certs) {
    throw new Error('Missing the SSL key or certificate files in the options.');
  }

  //
  // When given a `options.root` assume that our SSL certs and keys are path
  // references that still needs to be read. This allows a much more human
  // readable interface for SSL.
  //
  if (secure && options.root) {
    ['cert', 'key', 'ca', 'pfx', 'crl'].filter(function filter(key) {
      return key in options;
    }).forEach(function parse(key) {
      var data = options[key];

      if (Array.isArray(data)) {
        options[key] = data.map(function read(file) {
          return fs.readFileSync(path.join(options.root, file));
        });
      } else {
        options[key] = fs.readFileSync(path.join(options.root, data));
      }
    });
  }

  if (spdy) {
    server = require('spdy').createServer(options);
    debug('creating a spdy server on port %d', port);
  } else if (secure) {
    server = require('https').createServer(options);
    debug('creating a https server on port %d', port);

    if (+options.redirect) require('http').createServer(function handle(req, res) {
      res.statusCode = 404;

      if (req.headers.host) {
        res.statusCode = 301;
        res.setHeader('Location', 'https://'+ req.headers.host + req.url);
        debug('redirecting %s to the secure server', req.url);
      }

      res.end('');
    }).listen(+options.redirect);
  } else {
    server = require('http').createServer();
    debug('creating a http server on port %d', port);
  }

  //
  // Now that we've got a server, we can setup the pipe and start listening.
  //
  var pipe = new Pipe(server, options);

  //
  // Oh, actually, I don't want you to listen to the server, I'll do that
  // manually.
  //
  if (false === options.listen) return pipe;

  pipe.listen(port, function initialized(error) {
    if (error) throw error;
  });

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
