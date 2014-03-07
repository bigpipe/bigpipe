'use strict';

var debug = require('debug')('bigpipe:server')
  , Compiler = require('./lib/compiler')
  , Primus = require('primus')
  , Temper = require('temper')
  , fuse = require('fusing')
  , async = require('async')
  , path = require('path')
  , url = require('url')
  , fs = require('fs');

//
// Try to detect if we've got domains support. So we can easily serve 500 error
// pages when we have an error.
//
var domain;

try { domain = require('domain'); }
catch (e) {}

//
// Automatically add trailers support to Node.js.
//
var trailers = require('trailers');

/**
 * Our pagelet management.
 *
 * The following options are available:
 *
 * - cache: A object were we store our URL->page mapping.
 * - dist: The pathname for the compiled assets.
 * - domain: Use domains to handle requests.
 * - pages: String or array of pages we serve.
 * - parser: Which parser should be used to send data in real-time.
 * - pathname: The pathname we use for Primus requests.
 * - public: The pathname for public static content.
 * - static: The pathname for our static assets.
 * - stream: Where we should write our logs to.
 * - transport: The transport engine we should use for real-time.
 *
 * @constructor
 * @param {Server} server HTTP/S based server instance.
 * @param {Object} options Configuration.
 * @api public
 */
function Pipe(server, options) {
  if (!(this instanceof Pipe)) return new Pipe(server, options);

  options = options || {};

  var writable = Pipe.predefine(this, Pipe.predefine.WRITABLE)
    , readable = Pipe.predefine(this);

  writable('_events', Object.create(null));                // Stores the events.
  readable('options', configure(options));                 // Configure options.
  readable('domains', !!this.options('domain') && domain); // Use domains for each req.
  readable('statusCodes', Object.create(null));            // Stores error pages.
  readable('cache', this.options('cache', null));          // Enable URL lookup caching.
  readable('temper', new Temper());                        // Template parser.
  readable('plugins', Object.create(null));                // Plugin storage.
  readable('layers', []);                                  // Middleware layer.
  readable('server', server);                              // HTTP server we work with.

  readable('primus', new Primus(this.server, {
    transformer: this.options('transport', 'websockets'),  // Real-time framework to use.
    pathname: this.options('pathname', '/pagelets'),       // Primus pathname.
    parser: this.options('parser', 'json'),                // Message parser.
    plugin: {
      substream: require('substream')                      // Volatile name spacing.
    }
  }));

  readable('compiler', new Compiler(                       // Asset compiler.
    this.options('dist', path.join(process.cwd(), 'dist')), this, {
      pathname: this.options('static', '/')
  }));

  readable('pages', this.resolve(                          // The pages we serve.
    this.options('pages', __dirname + '/pages'),
    this.transform) || []
  );

  this.discover(this.pages);
}

fuse(Pipe, require('eventemitter3'));

/**
 * Queryable options with merge and fallback functionality.
 *
 * @param {Object} obj
 * @returns {Function}
 * @api private
 */
function configure(obj) {
  function get(key, backup) {
    return key in obj ? obj[key] : backup;
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
 * The current version of the library.
 *
 * @type {String}
 * @api public
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
  /**
   * It's not required to supply resolve with instances, we can just
   * automatically require them if they are using the:
   *
   *   module.exports = base.extend();
   *
   * pattern for defining the pages/pagelets.
   *
   * @param {String} constructor
   * @returns {Object} initialized object
   * @api private
   */
  function init (constructor) {
    return ('string' === typeof constructor)
      ? require(constructor)
      : constructor;
  }

  if ('string' === typeof files) {
    files = fs.readdirSync(files).map(function locate(file) {
      file = path.resolve(files, file);

      //
      // Only read files and no subdirectories.
      //
      if (fs.statSync(file).isFile()) return file;
    });
  } else if (!Array.isArray(files)) {
    files = Object.keys(files).map(function merge(name) {
      var constructor = init(files[name]);

      if (!constructor.prototype) {
        debug('%s did not export correcly, did you forgot to add .on(module) at the end of your file?', files[name]);
        return;
      }

      //
      // Add a name to the prototype, if we have this property in the prototype.
      // This mostly applies for the Pagelets.
      //
      if ('name' in constructor.prototype) {
        constructor.prototype.name = constructor.prototype.name || name;
      }

      return constructor;
    }).filter(Boolean);
  }

  //
  // Filter out falsie values from above array maps.
  //
  files = files.filter(Boolean).filter(function jsonly(file) {
    var extname = path.extname(file)
      , type = typeof file;

    //
    // Make sure we only use valid JavaScript files as sources. We want to
    // ignore stuff like potential .log files. Also include Page constructors.
    // If there's no extension name we assume that it's a folder with an
    // `index.js` file.
    //
    return 'string' === type && (!extname || extname === '.js')
    || 'function' === type;
  }).map(function map(location) {
    var constructor = init(location);

    //
    // We didn't receive a proper page instance.
    //
    if ('function' !== typeof constructor) {
      var invalid = (JSON.stringify(constructor) || constructor.toString());

      if ('string' === typeof location) {
        invalid += ' (file: '+ location +')';
      }

      debug('we received an invalid constructor, ignoring the file: %s', invalid);
      return undefined;
    }

    return constructor;
  }, this).filter(Boolean);

  return transform
    ? files.map(transform.bind(this))
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
    , page = Page.freelist.alloc();

  page.data = data || {};

  page.once('free', function free() {
    Page.freelist.free(page);
  });

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
  pages = this.resolve(pages, this.transform);

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
 * Find the correct Page constructor based on the given URL.
 *
 * @TODO it should return an array with possible options. So they can be
 * iterated over for when a page has a authorization method.
 *
 * @param {String} url The URL we need to find.
 * @param {String} method HTTP method
 * @returns {Array} Array full of constructors, or nothing.
 * @api public
 */
Pipe.readable('find', function find(url, method) {
  debug('searching the matching routes for url %s', url);
  if (this.cache && this.cache.has(url)) return this.cache.get(url);

  var routes = [];

  for (var i = 0, page, length = this.pages.length; i < length; i++) {
    page = this.pages[i];

    if (!page.router.test(url)) continue;
    if (method && page.method.length && !~page.method.indexOf(method)) continue;

    routes.push(page);
  }

  if (this.cache && routes.length) {
    this.cache.set(url, routes);
    debug('added url %s and its discovered routes to the cache', url);
  }

  return routes;
});

/**
 * Add a new middleware layer which will run before any Page is executed.
 *
 * @param {Function} use The middleware.
 * @api private
 */
Pipe.readable('before', function before(use) {
  this.layers.push(use);

  return this;
});

/**
 * Dispatch incoming requests.
 *
 * @TODO cancel POST requests, when we don't accept them
 * @param {Request} req HTTP request.
 * @param {Response} res HTTP response.
 * @returns {Pipe} fluent interface
 * @api private
 */
Pipe.readable('dispatch', function dispatch(req, res) {
  this.decorate(req, res);

  //
  // Check if these are assets that need to be served from the compiler.
  //
  if (this.compiler.serve(req, res)) {
    return debug('asset compiler answered %s', req.url);
  }

  var pages = this.find(req.uri.pathname, req.method)
    , pipe = this;

  //
  // Always add the 404 page as last page to check so we always have working
  // page
  //
  pages.push(this.statusCodes[404]);

  /**
   * Iterates over the different pages that matched this route to figure out
   * which one of them we're allowed to process.
   *
   * @param {Function} done Completion callback
   * @api private
   */
  function iterate(done) {
    var constructor = pages.shift()
      , freelist = constructor.freelist
      , page = freelist.alloc();

    debug('iterating over pages for %s testing %s atm', req.url, page.path);

    //
    // Make sure we parse out all the params from the URL.
    //
    page.params = constructor.router.exec(req.url) || {};

    if ('function' === typeof page.authorize) {
      page.res = res;   // and the response, needed for plugins.
      page.req = req;   // Configure the request.

      return page.authorize(req, function authorize(allowed) {
        debug('%s required authorization we are %s', page.path, allowed ? 'allowed' : 'disallowed');
        if (allowed) return done(undefined, page);

        debug('%s - %s is released to the freelist', page.method, page.path);
        freelist.free(page);
        iterate(done);
      });
    }

    done(undefined, page);
  }

  /**
   * We've found a matching route, process the page.
   *
   * @param {Error} err We've encountered an error while generating shizzle.
   * @param {Page} page The page instance.
   * @api private
   */
  function completed(err, page) {
    //
    // Release the page again when we receive a `free` event.
    //
    page.once('free', function free() {
      debug('%s - %s is released to the freelist', page.method, page.path);
      page.constructor.freelist.free(page);

      if (page.domain) {
        debug('%s - %s \'s domain has been disposed', page.method, page.path);
        page.domain.dispose();
      }
    });

    res.once('close', page.emits('close'));

    if (pipe.domains) {
      page.domain = domain.create();

      page.domain.on('error', function (err) {
        debug('%s - %s received an error while processing the page, captured by domains: %s', page.method, page.path, err.message);
        // @TODO actually handle the error.
      });

      page.domain.run(function run() {
        page.configure(req, res);
      });
    } else {
      page.configure(req, res);
    }
  }

  //
  // Run middleware layers first, after iterate pages and run page#configure.
  //
  async.eachSeries(this.layers, function middleware(layer, next) {
    layer.call(pipe, req, res, next);
  }, iterate.bind(pipe, completed));

  return this;
});

/**
 * Decorate the request object with some extensions.
 *
 * @param {Request} req HTTP request.
 * @param {Response} res HTTP response.
 * @api private
 */
Pipe.readable('decorate', function decorate(req, res) {
  req.uri = req.uri || url.parse(req.url, true);
  req.query = req.query || req.uri.query || {};

  //
  // Add some silly HTTP properties for connect.js compatibility.
  //
  req.originalUrl = req.url;
});

/**
 * Handle incoming real-time requests.
 *
 * @param {Spark} spark A real-time "socket".
 * @api private
 */
Pipe.readable('connection', require('./primus'));

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

  pipe.listen(port, function initialized(error) {
    if (error) throw error;

    //
    // Apply plugins if available.
    //
    if ('plugins' in options) {
      options.plugins.map(pipe.bind(pipe.use));
    }
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
