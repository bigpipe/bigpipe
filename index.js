'use strict';

var debug = require('diagnostics')('bigpipe:server')
  , Compiler = require('./lib/compiler')
  , fabricate = require('fabricator')
  , destroy = require('demolish')
  , Zipline = require('zipline')
  , Temper = require('temper')
  , Supply = require('supply')
  , fuse = require('fusing')
  , async = require('async')
  , path = require('path');

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
    if (backup !== void 0) obj[key] = backup;

    return obj[key];
  }

  //
  // Allow new options to be be merged in against the original object.
  //
  get.merge = function merge(properties) {
    return BigPipe.predefine.merge(obj, properties);
  };

  return get;
}

/**
 * Our pagelet management.
 *
 * The following options are available:
 *
 * - cache: A object were we store our URL->pagelet mapping.
 * - dist: The pathname for the compiled assets.
 * - pagelets: String or array of pagelets we serve.
 * - parser: Which parser should be used to send data in real-time.
 * - transformer: The transport engine we should use for real-time.
 *
 * @constructor
 * @param {Server} server HTTP/S based server instance.
 * @param {Object} options Configuration.
 * @api public
 */
function BigPipe(server, options) {
  if (!this) return new BigPipe(server, options);
  this.fuse();

  options = configure(options || {});

  this._pagelets = [];                           // Stores our pagelets.
  this._server = server;                         // HTTP server we work with.
  this._options = options;                       // Configure options.
  this._temper = new Temper;                     // Template parser.
  this._plugins = Object.create(null);           // Plugin storage.
  this._cache = options('cache', false);         // Enable URL lookup caching.
  this._statusCodes = Object.create(null);       // Stores error pagelets.
  this._zipline = new Zipline(options);          // Improved gzip compression.

  //
  // Setup the asset compiler before pagelets are discovered as they will
  // need to hook in to the compiler to register all assets that are loaded.
  //
  this._compiler = new Compiler(
    options('dist', path.join(process.cwd(), 'dist')), this, {
      pathname: options('static', '/')
  });

  //
  // Middleware system, exposed as public so it can
  // easily be called externally.
  //
  this.middleware = new Supply(this);

  this.initialize(options);
}

//
// Inherit from EventEmitter3 as we need to emit listen events etc.
//
fuse(BigPipe, require('eventemitter3'));

/**
 * Initialize various things of BigPipe.
 *
 * @param {Object} options Optional options.
 * @returns {BigPipe} Fluent interface.
 * @api private
 */
BigPipe.readable('initialize', function initialize(options) {
  //
  // Add our default middleware layers, this needs to be done before we
  // initialize or add plugins as we want to make sure that OUR middleware is
  // loaded first as it's the most important (at least, in our opinion).
  //
  this.middleware.use('defaults', require('./middleware/defaults'));
  this.middleware.use('zipline', this._zipline.middleware());
  this.middleware.use('compiler', this._compiler.serve);

  //
  // Apply the plugins before resolving and transforming the pagelets so the
  // plugins can hook in to our optimization and transformation process.
  //
  return this.pluggable(options('plugins', []));
});

/**
 * The current version of the library.
 *
 * @type {String}
 * @public
 */
BigPipe.readable('version', require(__dirname +'/package.json').version);

/**
 * Start listening for incoming requests.
 *
 * @param {Number} port port to listen on
 * @param {Function} done callback
 * @return {BigPipe} fluent interface
 * @api public
 */
BigPipe.readable('listen', function listen(port, done) {
  var pipe = this
    , pagelets = this._options('pagelets', path.join(process.cwd(), 'pagelets'));

  //
  // Make sure we should only start listening on the server once
  // we're actually ready to respond to requests.
  //
  this.define(pagelets, function defined(error) {
    if (error) {
      if (done) return done(error);
      pipe.emit('error', error);
    }

    pipe._server.on('listening', pipe.emits('listening'));
    pipe._server.on('request', pipe.bind(pipe.dispatch));
    pipe._server.on('error', pipe.emits('error'));

    //
    // Start listening on the provided port and return the BigPipe instance.
    //
    debug('Succesfully defined pagelets and assets, starting HTTP server on port %d', port);
    pipe._server.listen(port, done);
  });

  return pipe;
});

/**
 * Discover if the user supplied us with custom error pagelets so we use that
 * in case we need to handle a 404 or and 500 errors.
 *
 * @param {Function} done Completion callback.
 * @returns {BigPipe} fluent interface
 * @api private
 */
BigPipe.readable('discover', function discover(done) {
  var pipe = this
    , local = ['404', '500', 'bootstrap'];

  debug('Discovering build-in pagelets, filtering out defaults (404, 500, bootstrap)');
  pipe._pagelets = pipe._pagelets.filter(function filter(Pagelet) {
    if (Pagelet.router && Pagelet.router.test('/404')) local[0] = Pagelet;
    else if (Pagelet.router && Pagelet.router.test('/500')) local[1] = Pagelet;
    else if (Pagelet.prototype.name === 'bootstrap') local[2] = Pagelet;
    else return Pagelet;
  });

  async.map(local, function (Pagelet, next) {
    if ('string' !== typeof Pagelet) return next(undefined, Pagelet);

    debug('No %s pagelet detected, using default bigpipe %s pagelet', Pagelet, Pagelet);
    require(Pagelet + '-pagelet').optimize({
      pipe: pipe,
      transform: {
        before: pipe.emits('transform:pagelet:before'),
        after: pipe.emits('transform:pagelet:after')
      }
    }, next);
  }, function found(error, status) {
    if (error) return done(error);

    pipe._statusCodes[404] = status[0];
    pipe._statusCodes[500] = status[1];
    pipe._bootstrap = status[2];

    //
    // Also catalog dependencies on status Pagelets and bootstrap.
    // As the developer could have provided custom Pagelets.
    //
    pipe._compiler.catalog(pipe._pagelets.concat(status), done);
  });

  return this;
});

/**
 * Render a pagelet from our `statusCodes` collection.
 *
 * @param {Request} req HTTP request.
 * @param {Response} res HTTP response.
 * @param {Number} code The status we should handle.
 * @param {Mixed} data Nothing or something, usually an Error
 * @returns {BigPipe} fluent interface
 * @api private
 */
BigPipe.readable('status', function status(req, res, code, data) {
  if (!(code in this._statusCodes)) {
    return this.emit('error', new Error('Unsupported HTTP code: '+ code +'.'));
  }

  var Pagelet = this._statusCodes[code]
    , pagelet = new Pagelet({ pipe: this, req: req, res: res }, data);

  this.bootstrap(pagelet, req, res);
  return pagelet;
});

/**
 * Insert pagelet into collection of pagelets. If pagelet is a manually
 * instantiated Pagelet push it in, otherwise resolve the path, always
 * transform the pagelet. After dependencies are catalogued the callback
 * will be called.
 *
 * @param {Mixed} pagelets array of composed Pagelet objects or file path.
 * @param {Function} done callback
 * @api public
 */
BigPipe.readable('define', function define(pagelets, done) {
  var pipe = this;

  async.map(fabricate(pagelets), function map(Pagelet, next) {
    Pagelet.optimize({
      pipe: pipe,
      transform: {
        before: pipe.emits('transform:pagelet:before'),
        after: pipe.emits('transform:pagelet:after')
      }
    }, next);
  }, function fabricated(err, pagelets) {
    if (err) return done(err);

    pipe._pagelets.push.apply(pipe._pagelets, pagelets);
    pipe.discover(done);
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
BigPipe.readable('bind', function bind(fn) {
  var pipe = this;

  return function bound(arg1, arg2, arg3) {
    fn.call(pipe, arg1, arg2, arg3);
  };
});

/**
 * Find and initialize pagelets based on a given id or on the pathname of the
 * request.
 *
 * @param {HTTP.Request} req The incoming HTTP request.
 * @param {HTTP.Response} res The outgoing HTTP request.
 * @param {String} id Optional id of pagelet we specifically need.
 * @api private
 */
BigPipe.readable('router', function router(req, res, id) {
  var key = id ? id : req.method +'@'+ req.uri.pathname
    , cache = this._cache ? this._cache.get(key) || [] : []
    , pagelets = this._pagelets
    , length = pagelets.length
    , pipe = this
    , i = 0
    , pagelet;

  //
  // Cache is empty.
  //
  if (!cache.length) {
    if (id) for (; i < length; i++) {
      pagelet = pagelets[i];

      if (id === pagelet.prototype.id) {
        cache.push(pagelet);
        break;
      }
    } else for (; i < length; i++) {
      pagelet = pagelets[i];

      if (!pagelet.router) continue;
      if (!pagelet.router.test(req.uri.pathname)) continue;
      if (pagelet.method.length && !~pagelet.method.indexOf(req.method)) continue;

      cache.push(pagelet);
    }

    if (this._cache && cache.length) {
      this._cache.set(key, cache);
      debug('Added key %s and its found pagelets to our internal lookup cache', key);
    }
  }

  //
  // Add an extra 404 pagelet so we always have a pagelet to display.
  //
  cache.push(this._statusCodes[404]);

  //
  // It could be that we have selected a couple of authorized pagelets. Filter
  // those out before sending the initialized pagelet to the callback.
  //
  (function each(pagelets) {
    var Pagelet = pagelets.shift()
      , pagelet = new Pagelet({
          params: Pagelet.router ? Pagelet.router.exec(req.uri.pathname) : {},
          pipe: pipe,
          req: req,
          res: res
        });

    debug('Iterating over pagelets for %s testing %s atm', req.url, pagelet.path);

    //
    // Check if the parent Pagelet is authorized or not. If the Pagelet is
    // not allowed, continue crawling the other routable pagelets.
    //
    if (pagelet.if) {
      return pagelet.conditional(req, function authorize(allowed) {
        debug(
          'Authorization %s for %s',
          allowed ? 'allowed' : 'disallowed',
          pagelet.path
        );

        if (allowed) return pipe.bootstrap(pagelet, req, res);
        each(pagelets);
      });
    }

    debug('Using %s for %s', pagelet.path, req.url);
    pipe.bootstrap(pagelet, req, res);
  }(cache.slice(0)));

  return this;
});

/**
 * Run the plugins.
 *
 * @param {Array} plugins List of plugins.
 * @returns {BigPipe} fluent interface
 * @api private
 */
BigPipe.readable('pluggable', function pluggable(plugins) {
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
 * @returns {BigPipe} fluent interface
 * @api private
 */
BigPipe.readable('dispatch', function dispatch(req, res) {
  var pipe = this;

  return this.middleware.each(req, res, function next(err, early) {
    if (err) return pipe.status(req, res, 500, err);
    if (early) return debug('request was handled by a middleware layer');

    pipe.router(req, res);
  });
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
BigPipe.readable('use', function use(name, plugin) {
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

  if (name in this._plugins) {
    throw new Error('The plugin name was already defined. Please select an unique name for each plugin');
  }

  //
  // Resolve the path of the plugin as it might be required
  // to resolve dependencies.
  //
  Object.keys(require.cache).forEach(function (key) {
    if (require.cache[key].exports !== plugin) return;
    plugin.path = key;
  });

  debug('Added plugin `%s`', name);

  this._plugins[name] = plugin;
  if (!plugin.server) return this;

  this._options.merge(plugin.options || {});
  plugin.server.call(this, this, this._options);

  return this;
});

/**
 * Redirect the user.
 *
 * @param {String} location Where should we redirect to.
 * @param {Number} status The status number.
 * @api public
 */
BigPipe.readable('redirect', function redirect(pagelet, location, status, options) {
  options = options || {};

  pagelet._res.statusCode = +status || 301;
  pagelet._res.setHeader('Location', location);

  //
  // Instruct browsers to not cache the redirect.
  //
  if (options.cache === false) {
    pagelet._res.setHeader('Pragma', 'no-cache');
    pagelet._res.setHeader('Expires', 'Sat, 26 Jul 1997 05:00:00 GMT');
    pagelet._res.setHeader('Cache-Control', [
      'no-store', 'no-cache', 'must-revalidate', 'post-check=0', 'pre-check=0'
    ].join(', '));
  }

  pagelet._res.end();

  if (pagelet.listeners('end').length) pagelet.emit('end');
  return pagelet.debug('Redirecting to %s', location);
});

/**
 * Initialize a new Bootstrap Pagelet and return it so the routed Pagelet and
 * its childs can use it as state keeper. The HTML of the bootstrap pagelet is
 * flushed asap to the client.
 *
 * @param {Pagelet} parent Main pagelet that was found by the Router.
 * @param {ServerRequest} req HTTP server request.
 * @param {ServerResponse} res HTTP server response.
 * @returns {Bootstrap} Bootstrap Pagelet.
 * @api private
 */
BigPipe.readable('bootstrap', function bootstrap(parent, req, res) {
  //
  // It could be that the initialization handled the page rendering through
  // a `page.redirect()` or a `page.notFound()` call so we should terminate
  // the request once that happens.
  //
  if (res.finished) return this;

  //
  // @TODO rel prefetch for resources that are used on the next page?
  // @TODO cache manifest.
  //
  res.statusCode = parent.statusCode;

  //
  // Emit a pagelet configuration event so plugins can hook in to this.
  //
  res.once('close', this.emits('close'));

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
       'no_pagelet_js' in req.query && +req.query.no_pagelet_js === 1
    || !(req.httpVersionMajor >= 1 && req.httpVersionMinor >= 1)
  ) {
    parent.debug('Forcing `sync` instead of %s due lack of HTTP 1.1 or JS', parent.mode);
    parent.mode = 'sync';
  }

  //
  // Create a bootstrap Pagelet, this is a special Pagelet that is flushed
  // as soon as possible to instantiate the client side rendering.
  //
  parent._bootstrap = new this._bootstrap({
    dependencies: this._compiler.page(parent),
    params: parent._params,
    queue: parent.length,
    parent: parent.name,
    mode: parent.mode,
    pipe: this,
    res: res,
    req: req
  });

  this.emit('bootstrap', parent, req, res);

  if (parent.initialize) {
    if (parent.initialize.length) {
      parent.debug('Waiting for `initialize` method before rendering');
      parent.initialize(parent.init.bind(parent));
    } else {
      parent.initialize();
      parent.init();
    }
  } else {
    parent.init();
  }
});

/**
 * Completely destroy the instance and remove/release all its references.
 *
 * @type {Function}
 * @api public
 */
BigPipe.readable('destroy', destroy([
  '_pagelets', '_server', '_options', '_temper', '_plugins', '_cache',
  '_statusCodes', '_zipline', '_compiler', 'middleware'
], {
  before: function before() {
    try { this._server.close(); }
    catch (e) {}
  },
  after: 'removeAllListeners'
}));

/**
 * Create a new Pagelet/BigPipe server.
 *
 * @param {Number} port port to listen on
 * @param {Object} options Configuration.
 * @returns {BigPipe}
 * @api public
 */
BigPipe.createServer = function createServer(port, options) {
  options = 'object' === typeof port ? port : options || {};
  if ('number' === typeof port) options.port = port;

  var listen = options.listen === false
    , pipe;

  //
  // Listening is done by our own .listen method, so we need to tell the
  // createServer module that we don't want it to start listening to our sizzle.
  // This option is forced and should not be override by users configuration.
  //
  options.listen = false;
  options.port = options.port || 8080;
  pipe = new BigPipe(require('create-server')(options), options);

  //
  // By default the server will listen. Passing options.listen === false
  // is only required if listening needs to be done with a manual call.
  // BigPipe.createServer will pass as argument.
  //
  return listen ? pipe : pipe.listen(options.port);
};

//
// Expose the constructor.
//
module.exports = BigPipe;
