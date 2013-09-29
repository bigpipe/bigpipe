'use strict';

var FreeList = require('freelist').FreeList
  , Route = require('routable')
  , Primus = require('primus')
  , Temper = require('temper')
  , colors = require('colors')
  , async = require('async')
  , path = require('path')
  , url = require('url')
  , fs = require('fs');

//
// Library internals.
//
var Compiler = require('./lib/compiler')
  , Resource = require('./resource')
  , Pagelet = require('./pagelet')
  , Page = require('./page')
  , shared = require('./shared');

//
// Try to detect if we've got domains support. So we can easily serve 500 error
// pages when we have an error.
//
var domain;

try { domain = require('domain'); }
catch (e) {}

/**
 * Our pagelet management.
 *
 * The following options are available:
 *
 * - transport: The transport engine we should use for real-time.
 * - cache: A object were we store our URL->page mapping.
 * - stream: Where we should write our logs to.
 * - parser: Which parser should be used to send data in real-time.
 * - pages: String or array of pages we serve.
 * - domain: Use domains to handle requests.
 * - pathname: The pathname we use for Primus requests.
 * - static: The pathname for our static assets.
 * - dist: The pathname for the compiled assets.
 * - public: The pathname for public static content.
 * - head: String on which to bind header view data, defaults to bootstrap.
 *
 * @constructor
 * @param {Server} server HTTP/S based server instance.
 * @param {Object} options Configuration.
 * @api public
 */
function Pipe(server, options) {
  this.options = options = this.options(options || {});

  this.stream = options('stream', process.stdout);  // Our log stream.
  this.domains = !!options('domain') && domain;     // Call all requests in a domain.
  this.statusCodes = Object.create(null);           // Stores error pages.
  this.cache = options('cache', null);              // Enable URL lookup caching.
  this.temper = new Temper;                         // Template parser.
  this.plugins = Object.create(null);               // Plugin storage.

  //
  // Now that everything is processed, we can setup our internals.
  //
  this.server = server;
  this.primus = new Primus(this.server, {
    transformer: options('transport', 'websockets'),
    pathname: options('pathname', '/pagelets'),
    parser: options('parser', 'json')
  });

  //
  // Compile the Page's assets.
  //
  this.compiler = new Compiler(options('dist', path.join(process.cwd(), 'dist')), this, {
    pathname: options('static', '/')
  });

  //
  // Process the pages.
  //
  this.pages = this.resolve(options('pages'), this.transform) || [];
  this.discover(this.pages);
}

Pipe.prototype.__proto__ = require('events').EventEmitter.prototype;
Pipe.prototype.emits = shared.emits;

/**
 * Start listening for incoming requests.
 *
 * @param {Number} port port to listen on
 * @param {Function} done callback
 * @return {Pipe} fluent interface
 * @api public
 */
Pipe.prototype.listen = function listen(port, done) {
  var pipe = this;

  pipe.compiler.catalog(this.pages, function init(error) {
    if (error) return done(error);

    pipe.primus.on('connection', pipe.connection.bind(pipe));
    pipe.server.on('request', pipe.dispatch.bind(pipe));
    pipe.server.on('listening', pipe.emits('listening'));
    pipe.server.on('error', pipe.emits('error'));

    //
    // Start listening on the provided port and return the BigPipe instance.
    //
    pipe.server.listen(port, done);
  });

  return pipe;
};

/**
 * Checks if options exists.
 *
 * @param {Object} obj
 * @returns {Function}
 * @api private
 */
Pipe.prototype.options = function options(obj) {
  function get(key, backup) {
    return key in obj ? obj[key] : backup;
  }

  //
  // Allow new options to be be merged in against the orginal object.
  //
  get.merge = shared.merge.bind(get, obj);
  return get;
};

/**
 * Simple log method.
 *
 * @param {String} type The log type.
 * @returns {Pipe} fluent interface
 * @api private
 */
Pipe.prototype.log = function log(type) {
  var data = Array.prototype.slice.call(arguments, 1)
    , level = Pipe.prototype.log.levels[type];

  if (this.stream) {
    //
    // Add some padding, write the log type, and join as pretty string.
    //
    this.stream.write(['  '+ level +' '].concat(data).join(' ') + '\n');
  } else {
    this.emit.apply(this, ['log', type].concat(data));
  }

  return this;
};

/**
 * Pretty logger prefixes.
 *
 * @type {Object}
 * @private
 */
Pipe.prototype.log.levels = {
  'warn': '𝓦'.yellow,
  'error': '𝓔'.red,
  'info': '𝓘'.blue
};

/**
 * Transform strings, array of strings, objects, things in to the actual
 * constructors.
 *
 * @param {String|Array|Object} files The files.
 * @param {Function} transform Transformation function
 * @returns {Array}
 * @api private
 */
Pipe.prototype.resolve = function resolve(files, transform) {
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
    return ('string' === typeof constructor) ? require(constructor) : constructor;
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

      //
      // Add a name to the prototype, if we have this property in the prototype.
      // This mostly applies for the Pagelets.
      //
      if ('name' in constructor.prototype) {
        constructor.prototype.name = constructor.prototype.name || name;
      }

      return constructor;
    });
  }

  //
  // Filter out falsy values from above array maps.
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
  }).map(function map(constructor) {
    constructor = init(constructor);

    //
    // We didn't receive a proper page instance.
    //
    if ('function' !== typeof constructor) {
      var invalid = (JSON.stringify(constructor) || constructor.toString());
      this.log('warn', 'Ignorning invalid constructor: '+ invalid);
      return undefined;
    }

    return constructor;
  }, this).filter(Boolean);

  return transform
    ? files.map(transform.bind(this))
    : files;
};

/**
 * Discover if the user supplied us with custom error pages so we use that
 * in case we need to handle a 404 or and 500 error page.
 *
 * @param {Array} pages All enabled pages.
 * @returns {Pipe} fluent interface
 * @api private
 */
Pipe.prototype.discover = function discover(pages) {
  var catalog = pages || []
    , fivehundered
    , fourofour;

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
    fivehundered = this.transform(require('./pages/500'));
    catalog.push(fivehundered);
  }

  if (!fourofour) {
    fourofour = this.transform(require('./pages/404'));
    catalog.push(fourofour);
  }

  this.statusCodes[500] = fivehundered;
  this.statusCodes[404] = fourofour;

  return this;
};

/**
 * Render a page from our StatusCodes collection.
 *
 * @param {Request} req HTTP request.
 * @param {Response} res HTTP response.
 * @param {Number} code The status we should handle.
 * @param {Mixed} data Nothing or something :D
 * @api private
 */
Pipe.prototype.status = function status(req, res, code, data) {
  if (!(code in this.statusCodes)) throw new Error('Unsupported HTTP code: '+ code);

  var Page = this.statusCodes[code]
    , page = Page.freelist.alloc();

  page.once('free', function free() {
    Page.freelist.free(page);
  });

  page.configure(req, res);

  return this;
};

/**
 * We need to extract items from the Page prototype and transform it in to
 * something useful.
 *
 * @param {Page} page Page constructor.
 * @returns {Page} The upgrade page.
 * @api private
 */
Pipe.prototype.transform = function transform(Page) {
  var method = Page.prototype.method
    , router = Page.prototype.path
    , pipe = this;

  //
  // This page has already been processed, bailout.
  //
  if (Page.properties) return Page;

  //
  // Parse the methods to an array of accepted HTTP methods. We'll only accept
  // there requests and should deny every other possible method.
  //
  if (!Array.isArray(method)) method = method.split(/[\s,]+?/);
  method = method.filter(Boolean).map(function transformation(method) {
    return method.toUpperCase();
  });

  //
  // Update the pagelets, if any.
  //
  if (Page.prototype.pagelets) {
    var pagelets = this.resolve(Page.prototype.pagelets, function map(Pagelet) {
      //
      // This pagelet has already been processed before as pages can share
      // pagelets.
      //
      if (Pagelet.properties) return Pagelet;

      var prototype = Pagelet.prototype
        , dir = prototype.directory;

      if (prototype.view) {
        Pagelet.prototype.view = path.resolve(dir, prototype.view);
        pipe.temper.prefetch(Pagelet.prototype.view, Pagelet.prototype.engine);
      }

      if (prototype.css) Pagelet.prototype.css = path.resolve(dir, prototype.css);
      if (prototype.js) Pagelet.prototype.js = path.resolve(dir, prototype.js);

      //
      // Make sure that all our dependencies are also directly mapped to an
      // absolute URL.
      //
      if (prototype.dependencies) {
        Pagelet.prototype.dependencies = prototype.dependencies.map(function each(dep) {
          if (/^(http:|https:)?\/\//.test(dep)) return dep;
          return path.resolve(dir, dep);
        });
      }

      Pagelet.properties = Object.keys(Pagelet.prototype);

      //
      // Setup a FreeList for the pagelets so we can re-use the pagelet
      // instances and reduce garbage collection.
      //
      Pagelet.freelist = new FreeList('pagelet', Pagelet.prototype.freelist || 1000, function allocate() {
        return new Pagelet;
      });

      return Pagelet;
    });

    //
    // Save the transformed pagelets.
    //
    Page.prototype.pagelets = pagelets;
  }

  if (!Page.prototype.view) {
    throw new Error('The page for path '+ Page.prototype.path +' should have a .view property');
  }

  Page.prototype.view = path.resolve(Page.prototype.directory, Page.prototype.view);
  pipe.temper.prefetch(Page.prototype.view, Page.prototype.engine);

  //
  // Add the properties to the page.
  //
  Page.properties = Object.keys(Page.prototype);      // All properties before init.
  Page.router = new Route(router);                    // Actual HTTP route.
  Page.method = method;                               // Available HTTP methods.
  Page.id = router.toString() +'&&'+ method.join();   // Unique id.

  //
  // Setup a FreeList for the page so we can re-use the page instances and
  // reduce garbage collection to a bare minimum.
  //
  Page.freelist = new FreeList('page', Page.prototype.freelist || 1000, function allocate() {
    return new Page(pipe);
  });

  return Page;
};

/**
 * Insert page into collection of pages. If page is a manually instantiated
 * Page push it in, otherwise resolve the path, always transform the page. After
 * dependencies are catalogued the callback will be called.
 *
 * @param {Mixed} pages array of composed Page objects or filepath.
 * @param {Function} done callback
 * @api public
 */
Pipe.prototype.define = function define(pages, done) {
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

  return this;
};

/**
 * Find the correct Page constructor based on the given URL.
 *
 * @TODO it should return an array with possible options. So they can be
 * iterated over for when a page has a authorization method.
 *
 * @param {String} url The URL we need to find.
 * @returns {Array} Array full of constructors, or nothing.
 * @api public
 */
Pipe.prototype.find = function find(url, method) {
  if (this.cache && this.cache.has(url)) return this.cache.get(url);

  var routes = [];

  for (var i = 0, page, length = this.pages.length; i < length; i++) {
    page = this.pages[i];

    if (!page.router.test(url)) continue;
    if (method && page.method.length && !~page.method.indexOf(method)) continue;

    routes.push(page);
  }

  if (this.cache && routes.length) this.cache.set(url, routes);
  return routes;
};

/**
 * Dispatch incoming requests.
 *
 * @TODO cancel POST requests, when we don't accept them
 * @param {Request} req HTTP request.
 * @param {Response} res HTTP response.
 * @returns {Pipe} fluent interface
 * @api private
 */
Pipe.prototype.dispatch = function dispatch(req, res) {
  this.decorate(req, res);

  //
  // Check if these are assets that need to be served from the compiler.
  //
  if (this.compiler.serve(req, res)) return;

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
    var freelist = pages.shift().freelist
      , page = freelist.alloc();

    if ('function' === typeof page.authorize) {
      page.req = req; // Configure the res
      page.res = res; // and the response, needed for resources..

      return page.authorize(req, function authorize(allowed) {
        if (allowed) return done(undefined, page);

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
   * @param {Object} data Optional incoming data.
   * @api private
   */
  function completed(err, page, data) {
    //
    // Release the page again when we receive a `free` event.
    //
    page.once('free', function free() {
      page.constructor.freelist.free(page);
    });

    res.once('close', page.emits('close'));

    if (pipe.domains) {
      page.domain = domain.create();
      page.domain.run(function run() {
        run.configure(req, res, data);
      });
    } else {
      page.configure(req, res, data);
    }
  }

  if (req.method === 'POST') {
    async.parallel({
      data: this.post.bind(this, req),
      page: iterate
    }, function processed(err, result) {
      result = result || {};
      completed(err, result.page, result.data);
    });
  } else {
    iterate(completed);
  }
  return this;
};

/**
 * Process incoming POST requests.
 *
 * @param {Request} rea HTTP request
 * @param {Fucntion} fn Completion callback.
 * @api private
 */
Pipe.prototype.post = function post(req, fn) {
  var bytes = this.bytes
    , received = 0
    , buffers = []
    , err;

  req.on('data', function data(buffer) {
    received += buffer.length;

    buffers.push(buffer);

    if (bytes && received > bytes) {
      req.removeListener('data', data);
      req.destroy(err = new Error('Request was too large'));
    }
  });

  req.once('end', function end() {
    if (err) return fn(err);

    //
    // Use Buffer#concat to join the different buffers to prevent UTF-8 to be
    // broken.
    //
    fn(undefined, Buffer.concat(buffers));

    buffers.length = 0;
  });
};

/**
 * Decorate the request object with some extensions.
 *
 * @param {Request} req HTTP request.
 * @param {Response} res HTTP response.
 * @api private
 */
Pipe.prototype.decorate = function decorate(req, res) {
  req.uri = req.uri || url.parse(req.url, true);
  req.query = req.query || req.uri.query;

  //
  // Add some silly HTTP properties for connect.js compatibility.
  //
  req.originalUrl = req.url;
};

/**
 * Handle incoming real-time requests.
 *
 * @param {Spark} spark A real-time "socket".
 * @api private
 */
Pipe.prototype.connection = function connection(spark) {

};

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
Pipe.prototype.use = function use(name, plugin) {
  if ('object' === typeof name) {
    plugin = name;
    name = plugin.name;
  }

  if (!name) throw new Error('Plugin should be specified with a name');
  if ('string' !== typeof name) throw new Error('Plugin names should be a string');
  if ('string' === typeof plugin) plugin = require(plugin);

  //
  // Plugin accepts an object or a function only.
  //
  if (!/^(object|function)$/.test(typeof plugin)) throw new Error('Plugin should be an object or function');

  //
  // Plugin require a client, server or both to be specified in the object.
  //
  if (!('server' in plugin || 'client' in plugin)) {
    throw new Error('The plugin in missing a client or server function');
  }

  if (name in this.plugins) throw new Error('The plugin name was already defined');

  this.plugins[name] = plugin;
  if (!plugin.server) return this;

  this.options.merge(plugin.options || {});
  plugin.server.call(this, this, this.options);

  return this;
};

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

  var certs = 'key' in options && 'cert' in options
    , secure = certs || 443 === port
    , spdy = 'spdy' in options
    , server;

  //
  // We need to have SSL certs for SPDY and secure servers.
  //
  if (secure || spdy && !certs) {
    throw new Error('Missing the SSL key or certificate files in the options.');
  }

  if (spdy) {
    server = require('spdy').createServer(options);
  } else if (secure) {
    server = require('https').createServer(options);
  } else {
    server = require('http').createServer();
  }

  //
  // Now that we've got a server, we can setup the pipe and start listening.
  //
  var pipe = new Pipe(server, options);
  pipe.listen(port, function initialized(error) {
    if (error) throw error;

    //
    // Apply plugins is available.
    //
    if ('plugins' in options) options.plugins.map(pipe.use.bind(pipe));
  });

  return pipe;
};

//
// Expose our constructors.
//
Pipe.Resource = Resource;
Pipe.Pagelet = Pagelet;
Pipe.Page = Page;

//
// Expose the constructor.
//
module.exports = Pipe;
