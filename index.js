'use strict';

var debug = require('diagnostics')('bigpipe:server')
  , Formidable = require('formidable').IncomingForm
  , Compiler = require('./lib/compiler')
  , fabricate = require('fabricator')
  , Route = require('routable')
  , crypto = require('crypto')
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
var trailers = require('trailers')

//
// Reference to the default bootstrap pagelet.
//
var Bootstrap = require('./pagelets/bootstrap');

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
 * Simple helper function to generate some what unique id's for given
 * constructed pagelet.
 *
 * @returns {String}
 * @api private
 */
function generator() {
  return Math.random().toString(36).substring(2).toUpperCase();
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
    , writable = this.writable;

  //
  // Constants and properties that should never be overridden.
  //
  readable('statusCodes', Object.create(null));       // Stores error pagelets.
  readable('cache', options('cache', false));         // Enable URL lookup caching.
  readable('plugins', Object.create(null));           // Plugin storage.
  readable('options', options);                       // Configure options.
  readable('temper', new Temper);                     // Template parser.
  readable('server', server);                         // HTTP server we work with.
  readable('layers', []);                             // Middleware layer.
  readable('pagelets', []);                           // Stores our pagelets.

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
  // Setup the asset compiler before pagelets are discovered as they will
  // need to hook in to the compiler to register all assets that are loaded.
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
  // Apply the plugins before resolving and transforming the pagelets so the
  // plugins can hook in to our optimization and transformation process.
  //
  this.pluggable(options('plugins', []));
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
 * Initialize the pipe instance. This method should be called manually after
 * constructing the pipe instance. Pipe.createServer will call this m
 *
 * @param {Boolean} delay Should the listen call be delayed?
 * @returns {Pipe} fluent interface
 * @api public
 */
Pipe.readable('initialize', function initialize(delay) {
  var pipe = this
    , port = this.options('port', 8080)
    , pagelets = this.options('pagelets', path.join(process.cwd(), 'pagelets'));

  //
  // Discover the pagelets that we need serve from our server. Start
  // listening after everything is initialized. By default the server
  // will listen. Passing this option is only required if listening
  // needs to be done with a manual call. Pipe.createServer will pass
  // options.listen === false as argument.
  //
  pagelets.bootstrap = pagelets.bootstrap || pagelets.Bootstrap || Bootstrap;
  return this.define(pagelets, function listen() {
    if (delay) return;
    pipe.listen(port);
  });
});

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
  pipe.compiler.catalog(this.pagelets, function init(error) {
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
 * Discover if the user supplied us with custom error pagelets so we use that
 * in case we need to handle a 404 or and 500 errors.
 *
 * @param {Array} pagelets All enabled pagelets.
 * @returns {Pipe} fluent interface
 * @api private
 */
Pipe.readable('discover', function discover(pagelets, next) {
  var pipe = this
    , fivehundered
    , fourofour;

  debug('discovering build-in error pagelets');

  pagelets.forEach(function each(pagelet) {
    if (!pagelet.router) return;
    if (pagelet.router.test('/500')) fivehundered = pagelet;
    if (pagelet.router.test('/404')) fourofour = pagelet;
  });

  async.map([fourofour || '404', fivehundered || '500'], function (Pagelet, next) {
    if ('string' !== typeof Pagelet) return next(undefined, Pagelet);

    debug('no /'+ Pagelet +' error pagelet detected, using default bigpipe error pagelet');

    Pagelet = require('./pagelets/'+ Pagelet);
    pipe.optimize(Pagelet, next);
  }, function found(err, status) {
    if (err) return next(err);

    pipe.statusCodes[404] = status[0];
    pipe.statusCodes[500] = status[1];

    next();
  });

  return this;
});

/**
 * Render a pagelet from our `statusCodes` collection.
 *
 * @param {Request} req HTTP request.
 * @param {Response} res HTTP response.
 * @param {Number} code The status we should handle.
 * @param {Mixed} data Nothing or something
 * @returns {Pipe} fluent interface
 * @api private
 */
Pipe.readable('status', function status(req, res, code, data) {
  if (!(code in this.statusCodes)) {
    throw new Error('Unsupported HTTP code: '+ code +'.');
  }

  var Pagelet = this.statusCodes[code]
    , pagelet = new Pagelet({ pipe: pipe, req: req, res: res });

  pagelet.data = data || {};
  pagelet.data.env = process.env.NODE_ENV;
  pagelet.configure(req, res);

  return this;
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
Pipe.readable('define', function define(pagelets, done) {
  var pipe = this;

  async.map(fabricate(pagelets), function map(Pagelet, next) {
    pipe.optimize(Pagelet, next);
  }, function fabricated(err, pagelets) {
    if (err) return done(err);

    pipe.pagelets.push.apply(pipe.pagelets, pagelets);
    pipe.discover(pagelets, done);
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
 * Find and initialize pagelets based on a given id or on the pathname of the
 * request.
 *
 * @param {HTTP.Request} req The incoming HTTP request.
 * @param {HTTP.Response} res The outgoing HTTP request.
 * @param {String} id Optional id of pagelet we specifically need.
 * @param {Function} next Continuation callback
 * @api private
 */
Pipe.readable('router', function router(req, res, id, next) {
  if ('function' === typeof id) {
    next = id;
    id = undefined;
  }

  var key = id ? id : req.method +'@'+ req.uri.pathname
    , cache = this.cache ? this.cache.get(key) || [] : []
    , pagelets = this.pagelets
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

    if (this.cache && cache.length) {
      this.cache.set(key, cache);
      debug('added key %s and its found pagelets to our internal lookup cache', key);
    }
  }

  //
  // Add an extra 404 pagelet so we always have a pagelet to display.
  //
  cache.push(this.statusCodes[404]);

  //
  // It could be that we have selected a couple of authorized pagelets. Filter
  // those out before sending the initialized pagelet to the callback.
  //
  (function each(pagelets) {
    var Pagelet = pagelets.shift()
      , pagelet = new Pagelet({ pipe: pipe });

    debug('iterating over pagelets for %s testing %s atm', req.url, pagelet.path);

    //
    // Make sure we parse out all the parameters from the URL as they might be
    // required for authorization purposes.
    //
    if (Pagelet.router) pagelet.params = Pagelet.router.exec(req.uri.pathname) || {};
    if ('function' === typeof pagelet.if) {
      return pagelet.conditional(req, function authorize(allowed) {
        debug('%s required authorization we are %s', pagelet.path, allowed ? 'allowed' : 'disallowed');

        if (allowed) return next(undefined, pagelet);
        each(pagelets);
      });
    }

    debug('Using %s for %s', pagelet.path, req.url);
    next(undefined, pagelet);
  }(pagelets.slice(0)));

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
  if (!~index) {
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
   * Something failed while processing things. Display an error pagelet.
   *
   * @param {String}
   * @api private
   */
  function fivehundered(err) {
    var pagelet = new pipe.statusCodes[500](pipe);

    //
    // Set an error as data so it can be used as data in the template.
    //
    pagelet.data = err;
    pagelet.configure(req, res);
  }

  return this.forEach(req, res, function next(err) {
    if (err) return fivehundered(err);

    pipe.router(req, res, function completed(err, pagelet) {
      if (err) return fivehundered(err);

      pagelet.configure(req, res);
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
 * Redirect the user.
 *
 * @param {String} location Where should we redirect to.
 * @param {Number} status The status number.
 * @api public
 */
Pipe.readable('redirect', function redirect(location, status, options) {
  options = options || {};

  this.res.statusCode = +status || 301;
  this.res.setHeader('Location', location);

  //
  // Instruct browsers to not cache the redirect.
  //
  if (options.cache === false) {
    this.res.setHeader('Pragma', 'no-cache');
    this.res.setHeader('Expires', 'Sat, 26 Jul 1997 05:00:00 GMT');
    this.res.setHeader('Cache-Control', [
      'no-store', 'no-cache', 'must-revalidate', 'post-check=0', 'pre-check=0'
    ].join(', '));
  }

  this.res.end();

  if (this.listeners('end').length) this.emit('end');
  return this.debug('Redirecting to %s', location);
});

/**
 * Start buffering and reading the incoming request.
 *
 * @returns {Form}
 * @api private
 */
Pipe.readable('read', function read(pagelet) {
  var form = new Formidable()
    , pipe = this
    , fields = {}
    , files = {}
    , context
    , before;

  form.on('progress', function progress(received, expected) {
    //
    // @TODO if we're not sure yet if we should handle this form, we should only
    // buffer it to a predefined amount of bytes. Once that limit is reached we
    // need to `form.pause()` so the client stops uploading data. Once we're
    // given the heads up, we can safely resume the form and it's uploading.
    //
  }).on('field', function field(key, value) {
    fields[key] = value;
  }).on('file', function file(key, value) {
    files[key] = value;
  }).on('error', function error(err) {
    pagelet[pagelet.mode](err);
    fields = files = {};
  }).on('end', function end() {
    form.removeAllListeners();

    if (before) {
      before.call(context, fields, files, pagelet[pagelet.mode].bind(pagelet));
    }
  });

  /**
   * Add a hook for adding a completion callback.
   *
   * @param {Function} callback
   * @returns {Form}
   * @api public
   */
  form.before = function befores(callback, contexts) {
    if (form.listeners('end').length)  {
      form.resume();      // Resume a possible buffered post.

      before = callback;
      context = contexts;

      return form;
    }

    callback.call(contexts || context, fields, files, pagelet[pagelet.mode].bind(pagelet));
    return form;
  };

  return form.parse(pagelet.req);
});

/**
 * Close the connection once all pagelets are sent.
 *
 * @param {Error} err Optional error argument to trigger the error pagelet.
 * @returns {Boolean} Closed the connection.
 * @api private
 */
Pipe.readable('end', function end(err, pagelet) {
  //
  // The connection was already closed, no need to further process it.
  //
  if (pagelet.res.finished || pagelet.res.ended) {
    pagelet.debug('pagelet has finished, ignoring extra .end call');
    return true;
  }

  //
  // We've received an error. We need to close down parent pagelet and
  // display a 500 error pagelet instead.
  //
  // @TODO handle the case when we've already flushed the initial bootstrap code
  // to the client and we're presented with an error.
  //
  if (err) {
    pagelet.emit('end', err);
    pagelet.debug('Captured an error: %s, displaying error pagelet instead', err);
    this.status(pagelet.req, pagelet.res, 500, err);
    return pagelet.res.ended = true;
  }

  //
  // Do not close the connection before the pagelet has sent headers.
  //
  if (pagelet.res.n < pagelet.enabled.length) {
    pagelet.debug('Not all pagelets have been written, (%s out of %s)',
      pagelet.res.n, pagelet.enabled.length
    );
    return false;
  }

  //
  // Everything is processed, close the connection and clean up references.
  //
  this.flush(pagelet, true);
  pagelet.res.end();
  pagelet.emit('end');

  pagelet.debug('ended the connection');
  return pagelet.res.ended = true;
});

/**
 * Process the pagelet for an async or pipeline based render flow.
 *
 * @param {Mixed} fragment Content returned from Pagelet.render().
 * @param {Function} fn Optional callback to be called when data has been written.
 * @api private
 */
Pipe.readable('write', function write(pagelet, fragment, fn) {
  //
  // If the response was closed, do not attempt to write anything anymore.
  //
  if (pagelet.res.finished) {
    return fn(new Error('Response was closed, unable to write Pagelet'));
  }

  pagelet.debug('Writing pagelet\'s response');
  pagelet.res.queue.push(fragment);

  if (fn) pagelet.res.once('flush', fn);
  return this.flush(pagelet);
});

/**
 * Flush all queued rendered pagelets to the request object.
 *
 * @param {Boolean} flushing Should flush the queued data.
 * @api private
 */
Pipe.readable('flush', function flush(pagelet, flushing) {
  //
  // Only write the data to the response if we're allowed to flush.
  //
  if ('boolean' === typeof flushing) pagelet.res.flushed = flushing;
  if (!pagelet.res.flushed || !pagelet.res.queue.length) return this;

  var res = pagelet.res.queue.join('');
  pagelet.res.queue.length = 0;

  if (res.length) {
    pagelet.res.write(res, 'utf-8', function () {
      pagelet.res.emit('flush');
    });
  }

  //
  // Optional write confirmation, it got added in more recent versions of
  // node, so if it's not supported we're just going to call the callback
  // our selfs.
  //
  if (pagelet.res.write.length !== 3 || !res.length) {
    pagelet.res.emit('flush');
  }

  return this;
});

/**
 * Inject the output of a template directly in to view's pagelet placeholder
 * element.
 *
 * @TODO remove pagelet's that have `authorized` set to `false`
 * @TODO Also write the CSS and JavaScript.
 *
 * @param {String} base The template that is injected in to.
 * @param {String} view The generated pagelet view.
 * @param {Pagelet} pagelet The pagelet instance we're rendering
 * @returns {String} updated base template
 * @api private
 */
Pipe.readable('inject', function inject(base, view, pagelet) {
  var name = pagelet.name;

  [
    "data-pagelet='"+ name +"'",
    'data-pagelet="'+ name +'"',
    'data-pagelet='+ name,
  ].forEach(function locate(attribute) {
    var index = base.indexOf(attribute)
      , end;

    //
    // As multiple versions of the pagelet can be included in to one single
    // parent pagelet we need to search for multiple occurrences of the
    // `data-pagelet` attribute.
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
});

/**
 * The bootstrap method injects the _bootstrap pagelet that adds specific
 * directives to the HEAD element, which are required for BigPipe to function.
 *
 * - Sets a default set of meta tags in the HEAD element
 * - It includes the pipe.js JavaScript client and initializes it.
 * - It includes "core" library files for the page (pagelet dependencies).
 * - It includes "core" CSS for the page (pagelet dependencies).
 * - It adds a noscript meta refresh to force a `sync` method which fully
 *   renders the HTML server side.
 *
 * @param {Error} err An Error has been received while receiving data.
 * @returns {Page} fluent interface
 * @api private
 */
Pipe.readable('bootstrap', function bootstrap(err, parent) {
  //
  // It could be that the initialization handled the page rendering through
  // a `page.redirect()` or a `page.notFound()` call so we should terminate
  // the request once that happens.
  //
  if (parent.res.finished) return this;
  if (err) return this.end(err);

  var Base = parent.pagelets.bootstrap || Bootstrap
    , dependencies = []
    , bootstrapper, view;

  //
  // Add all required assets and dependencies to the HEAD of the page.
  //
  this.compiler.page(parent, dependencies);

  //
  // TODO: document why each property is provided.
  // TODO: do not simply add one to the length?
  //
  return new Base({
    length: parent.pagelets.length + 1,        // Number of pagelets that should be written.
    path: parent.req.uri.pathname,
    dependencies: dependencies,
    query: parent.req.query,
    temper: this.temper,
    mode: parent.mode,                     // Mode of the current pagelet.
    parent: parent.name,
    res: parent.res,
    req: parent.req
  }).html();
});

/**
 * Optimize the prototypes of Pagelets to reduce work when we're actually
 * serving the requests.
 *
 * Options:
 *
 * - temper: A customn temper instance we want to use to compile the templates.
 * - transform: Transformation callback so plugins can hook in the optimizer.
 *
 * @param {Pagelet} Pagelet Instance.
 * @param {Object} options Optimization configuration.
 * @param {Function} next Completion callback for async execution.
 * @returns {Pagelet}
 * @api private
 */
Pipe.readable('optimize', function optimize(Pagelet, options, done) {
  var prototype = Pagelet.prototype
    , method = prototype.method
    , router = prototype.path
    , name = prototype.name
    , pagelets = []
    , pipe = this
    , err;

  //
  // Options are optional, check if options is the actual callback.
  //
  if ('function' === typeof options) {
    done = options;
    options = {};
  }

  //
  // Generate a unique ID used for real time connection lookups.
  //
  prototype.id = options.id || [1, 1, 1, 1].map(generator).join('-');

  //
  // Parse the methods to an array of accepted HTTP methods. We'll only accept
  // these requests and should deny every other possible method.
  //
  debug('Optimizing pagelet %s registered for path %s', name, router);
  if (!Array.isArray(method)) method = method.split(/[\s\,]+?/);

  method = method.filter(Boolean).map(function transformation(method) {
    return method.toUpperCase();
  });

  //
  // Add the actual HTTP route and available HTTP methods.
  //
  if (router) Pagelet.router = new Route(router);
  Pagelet.method = method;

  options = options || {};
  options.temper = options.temper || Pagelet.temper || pipe.temper;

  //
  // Prefetch the template if a view is available. The view property is
  // mandatory but it's quite silly to enforce this if the pagelet is
  // just doing a redirect. We can check for this edge case by
  // checking if the set statusCode is in the 300~ range.
  //
  if (prototype.view) {
    prototype.view = path.resolve(prototype.directory, prototype.view);
    options.temper.prefetch(prototype.view, prototype.engine);
  } else if (!(prototype.statusCode >= 300 && prototype.statusCode < 400)) {
    throw new Error('The pagelet for path '+ router +' should have a .view property.');
  }

  //
  // Ensure we have a custom error pagelet when we fail to render this fragment.
  //
  if (prototype.error) {
    options.temper.prefetch(prototype.error, path.extname(prototype.error).slice(1));
  }

  //
  // Map all dependencies to an absolute path or URL.
  //
  Pagelet.resolve.call(Pagelet, ['css', 'js', 'dependencies']);

  //
  // Support lowercase variant of RPC
  //
  if ('rpc' in prototype) {
    prototype.RPC = prototype.rpc;
    delete prototype.rpc;
  }

  if ('string' === typeof prototype.RPC) {
    prototype.RPC = prototype.RPC.split(/[\s|\,]+/);
  }

  //
  // Validate the existance of the RPC methods, this reduces possible typo's
  //
  prototype.RPC.forEach(function validate(method) {
    if (!(method in prototype)) return err = new Error(
      name +' is missing RPC function `'+ method +'` on prototype'
    );

    if ('function' !== typeof prototype[method]) return err = new Error(
      name +'#'+ method +' is not function which is required for RPC usage'
    );
  });

  //
  // Recursively traverse pagelets to find all children.
  //
  Array.prototype.push.apply(pagelets, Pagelet.traverse(name));

  //
  // Resolve all found pagelets and optimize for use with BigPipe.
  //
  async.map(pagelets, function map(Child, next) {
    if (Array.isArray(Child)) return async.map(Child, map, next);
    pipe.optimize(Child, next);
  }, function (err, pagelets) {
    if (err) return done(err);

    //
    // Store the optimized children on the prototype, this should already be
    // a compatible array as the value is generated by an async.map.
    //
    prototype.pagelets = pagelets.map(function map(Pagelet) {
      return Array.isArray(Pagelet) ? Pagelet : [Pagelet];
    });

    //
    // Allow plugins to hook in the transformation process, so emit it when
    // all our transformations are done and before we instantiate the pagelet.
    //
    // @TODO Should this actually be async, or is sync good enough.
    //
    pipe.emit('transform:pagelet', Pagelet);
    done(null, Pagelet);
  });

  return pipe;
});

/**
 * Find a bunch of connected real-time connections based on the supplied query
 * parameters.
 *
 * Query:
 *
 * - id: The id of the pagelet
 * - pagelet: The name of the pagelet
 * - child: The id of a child pagelet
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
    if (!spark.pagelet || !spark.pagelet.constructor.router.test(url)) return;

    var pagelet = spark.pagelet;

    if (query.id && query.id === pagelet.id) {
      results.push(pagelet);
    }

    if (query.pagelet) {
      Array.prototype.push.apply(results, pagelet.has(query.pagelet, enabled));
    }

    if (query.child) pagelet.enabled.forEach(function each(child) {
      if (child.id === query.child) results.push(child);
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
  return new Pipe(require('create-server')(options), options).initialize(listen);
};

//
// Expose our constructors.
//
Pipe.Pagelet = require('pagelet');

//
// Expose the constructor.
//
module.exports = Pipe;
