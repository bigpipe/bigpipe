'use strict';

var Formidable = require('formidable').IncomingForm
  , stringify = require('json-stringify-safe')
  , debug = require('debug')('bigpipe:page')
  , FreeList = require('freelist').FreeList
  , sanitize = require('./lib/sanitize')
  , qs = require('querystring')
  , Route = require('routable')
  , async = require('async')
  , fuse = require('fusing')
  , path = require('path')
  , fs = require('fs');

/**
 * The methods that needs data buffering.
 *
 * @type {Array}
 * @api private
 */
var operations = ['post', 'put'];

/**
 * The fragment is actual chunk of the response that is written for each
 * pagelet.
 *
 * @type {String}
 * @private
 */
var fragment = fs.readFileSync(__dirname +'/pagelet.fragment', 'utf-8')
  .split('\n')
  .join('');

/**
 * A simple object representation of a given page.
 *
 * @constructor
 * @api public
 */
function Page(pipe) {
  var writable = Page.predefine(this, Page.predefine.WRITABLE)
    , readable = Page.predefine(this);

  readable('temper', pipe.temper);            // Reference to our template composer.
  readable('compiler', pipe.compiler);        // Asset management.
  readable('pipe', pipe);                     // Actual pipe instance.
  writable('disabled', []);                   // Contains all disable pagelets.
  writable('enabled', []);                    // Contains all enabled pagelets.
  writable('queue', []);                      // Write queue that will be flushed.
  writable('flushed', false);                 // Is the queue flushed.
  writable('ended', false);                   // Is the page ended.
  writable('_events', Object.create(null));   // Required for EventEmitter.
  writable('req', null);                      // Incoming HTTP request.
  writable('res', null);                      // Incoming HTTP response.
  writable('n', 0);                           // Number of processed pagelets.
  writable('params', {});                     // Param extracted from the route.
}

fuse(Page, require('eventemitter3'));

/**
 * The HTTP pathname that we should be matching against.
 *
 * @type {String|RegExp}
 * @public
 */
Page.writable('path', '/');

/**
 * <meta> character set for page. Setting this to null will not include the meta
 * charset. However this is not advised as this will reduce performance.
 *
 * @type {String}
 * @public
 */
Page.writable('charset', 'UTF-8');

/**
 * The Content-Type of the response. This defaults to text/html with a charset
 * preset. The charset does not inherit it's value from the `charset` option.
 *
 * @type {String}
 * @public
 */
Page.writable('contentType', 'text/html; charset=UTF-8');

/**
 * Which HTTP methods should this page accept. It can be a string, comma
 * separated string or an array.
 *
 * @type {String|Array}
 * @public
 */
Page.writable('method', 'GET');

/**
 * The default status code that we should send back to the user.
 *
 * @type {Number}
 * @public
 */
Page.writable('statusCode', 200);

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
Page.writable('authorize', null);

/**
 * With what kind of generation mode do we need to output the generated
 * pagelets. We're supporting 3 different modes:
 *
 * - sync:      Fully render the page without any fancy flushing.
 * - async:     Render all pagelets async and flush them as fast as possible.
 * - pipeline:  Same as async but in the specified order.
 *
 * @type {String}
 * @public
 */
Page.writable('mode', 'async');

/**
 * The location of the base template.
 *
 * @type {String}
 * @public
 */
Page.writable('view', '');

/**
 * Optional template engine preference. Useful when we detect the wrong template
 * engine based on the view's file name.
 *
 * @type {String}
 * @public
 */
Page.writable('engine', '');

/**
 * Save the location where we got our resources from, this will help us with
 * fetching assets from the correct location.
 *
 * @type {String}
 * @public
 */
Page.writable('directory', '');

/**
 * The environment that we're running this page in. If this is set to
 * `development` It would be verbose.
 *
 * @type {String}
 * @public
 */
Page.writable('env', (process.env.NODE_ENV || 'development').toLowerCase());

/**
 * Provide dynamic data to the view or static object. The data will be merged
 * by dispatch right before rendering the view. The function will be supplied
 * with callback, e.g. function data(next) { ... }
 *
 * @type {Function}
 * @public
 */
Page.writable('data', {});

/**
 * The pagelets that need to be loaded on this page.
 *
 * @type {Object}
 * @public
 */
Page.writable('pagelets', {});

/**
 * Parameter parsers, key is the name of param and value the function that
 * parsers it.
 *
 * @type {Object}
 * @public
 */
Page.writable('parsers', {});

/**
 * Dependencies. These are the common, shared files that need to be loaded
 * globally. This array will be set
 *
 * @type {Array}
 * @private
 */
Page.writable('dependencies', {});

//
// !IMPORTANT
//
// These function's & properties should never overridden as we might depend on
// them internally, that's why they are configured with writable: false and
// configurable: false by default.
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
Page.readable('redirect', function redirect(location, status) {
  this.res.statusCode = +status || 301;
  this.res.setHeader('Location', location);
  this.res.end();

  if (this.listeners('end').length) this.emit('end');
  return this.debug('Redirecting to %s', location);
});

/**
 * Discover pagelets that we're allowed to use.
 *
 * @returns {Page} fluent interface
 * @api private
 */
Page.readable('discover', function discover() {
  if (!this.pagelets.length) return this.emit('discover');

  var req = this.req
    , page = this
    , pagelets;

  //
  // Allocate new pagelets for this page and configure them so we can actually
  // use them during authorization.
  //
  pagelets = this.pagelets.map(function allocate(Pagelet) {
    return Pagelet.freelist.alloc().init({ page: page });
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
      return pagelet.authorize(req, done);
    }

    done(true);
  }, function acceptance(allowed) {
    page.enabled = allowed;

    //
    // Keep track of disabled pagelets, also close open POST/PUT request if
    // the pagelet is not included in or allowed for the current page.
    //
    page.disabled = pagelets.filter(function disabled(pagelet) {
      return !~allowed.indexOf(pagelet);
    });

    allowed.forEach(function initialize(pagelet) {
      if (pagelet.initialize) pagelet.initialize();
    });

    // @TODO free disabled pagelets
    page.debug('Initialised all allowed pagelets');
    page.emit('discover');
  });
});

/**
 * Mode: sync
 * Output the pagelets fully rendered in the HTML template.
 * @TODO rewrite, not working against altered renderer.
 *
 * @param {Error} err Failed to process POST.
 * @param {Object} data Optional data from POST.
 * @returns {Page} fluent interface.
 * @api private
 */
Page.readable('sync', function render(err, data) {
  if (err) return this.end(err);

  var page = this;

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
  });

  return this.debug('Rendering the pagelets in `sync` mode');
});

/**
 * Mode: Async
 * Output the pagelets as fast as possible.
 *
 * @param {Error} err Failed to process POST.
 * @param {Object} data Optional data from POST.
 * @returns {Page} fluent interface.
 * @api private
 */
Page.readable('async', function render(err, data) {
  if (err) return this.end(err);

  this.once('discover', function discovered() {
    async.each(this.enabled, function (pagelet, next) {
      pagelet.renderer(next);
    }, this.end.bind(this));
  });

  this.bootstrap(data);
  this.discover();

  return this.debug('Rendering the pagelets in `async` mode');
});

/**
 * Mode: pipeline
 * Output the pagelets as fast as possible but in order.
 *
 * @param {Error} err Failed to process POST.
 * @param {Object} data Optional data from POST.
 * @returns {Page} fluent interface.
 * @api private
 */
Page.readable('pipeline', function render(err, data) {
  throw new Error('Not Implemented');
});

/**
 * Start buffering and reading the incoming request.
 *
 * @returns {Form}
 * @api private
 */
Page.readable('read', function read() {
  var form = new Formidable()
    , page = this
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
    page[page.mode](err);
    fields = files = {};
  }).on('end', function end() {
    form.removeAllListeners();

    if (before) {
      before.call(context, fields, files, page[page.mode].bind(page));
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

    callback.call(context, fields, files, page[page.mode].bind(page));
    return form;
  };

  return form.parse(this.req);
});

/**
 * Close the connection once the main page was sent.
 *
 * @param {Error} err Optional error argument to trigger the error page.
 * @returns {Boolean} Closed the connection.
 * @api private
 */
Page.readable('end', function end(err) {
  var page = this;

  //
  // The connection was already closed, no need to further process it.
  //
  if (this.res.finished || this.ended) return true;

  //
  // We've received an error. We need to close down the page and display a 500
  // error page instead.
  //
  // @TODO handle the case when we've already flushed the initial bootstrap code
  // to the client and we're presented with an error.
  //
  if (err) {
    this.emit('end', err);
    this.pipe.status(this.req, this.res, 500, err);
    this.debug('Captured an error: %s, displaying error page instead', err);
    return this.ended = true;
  }

  //
  // Do not close the connection before the main page has sent headers.
  //
  if (page.n !== page.enabled.length) {
    this.debug('Not all pagelets have been written, (%s out of %s)',
      this.n, this.enabled.length
    );
    return false;
  }

  //
  // Write disabled pagelets so the client can remove all empty placeholders.
  //
  this.disabled.filter(function filter(pagelet) {
    return !!pagelet.remove;
  }).forEach(function each(pagelet) {
    page.debug('Instructing removal of the %s/%s pagelet'
      , pagelet.name, pagelet.id
    );

    page.write(pagelet);
  });

  //
  // Everything is processed, close the connection and free the Page instance.
  //
  this.res.end();
  this.emit('end');
  this.emit('free');

  return this.ended = true;
});

/**
 * Process the pagelet for an async or pipeline based render flow.
 *
 * @param {Pagelet} pagelet Pagelet instance.
 * @param {Mixed} data The data returned from Pagelet.render().
 * @param {Function} fn Optional callback to be called when data has been written.
 * @api private
 */
Page.readable('write', function write(pagelet, data, fn) {
  data = data || {};

  var view = this.temper.fetch(pagelet.view).server
    , frag = this.compiler.pagelet(pagelet)
    , template;

  this.debug('Writing pagelet %s/%s\'s response', pagelet.name, pagelet.id);

  frag.remove = pagelet.remove; // Does the front-end need to remove the pagelet.
  frag.id = pagelet.id;         // The internal id of the pagelet.
  frag.rpc = pagelet.RPC;       // RPC methods from the pagelet.
  frag.processed = ++this.n;    // Amount of pagelets processed.

  //
  // We've made it this far, but now we have to cross our fingers and HOPE that
  // our given template can actually handle the data correctly without throwing
  // an error. As the rendering is done synchronously, we wrap it in a try/catch
  // statement and hope that an error is thrown when the template fails to
  // render the content. If there's an error we will process the error template
  // instead.
  //
  try {
    template = view(data);
  } catch (e) {
    //
    // This is basically fly or die, if the supplied error template throws an
    // error while rendering we're basically fucked, your server will crash,
    // an angry mob of customers with pitchforks will kick in the doors of your
    // office and smear you with peck and feathers for not writing a more stable
    // application.
    //
    if (!pagelet.error) throw e;

    template = this.temper.fetch(pagelet.error).server(this.merge(data, {
      reason: 'Failed to render '+ pagelet.name +' as the template throws an error',
      message: e.message,
      stack: e.stack
    }));
  }

  this.queue.push(
    fragment
      .replace(/\{pagelet::name\}/g, pagelet.name)
      .replace(/\{pagelet::data\}/g, stringify(frag, sanitize))
      .replace(/\{pagelet::template\}/g, template.replace('-->', ''))
  );

  if (fn) this.once('flush', fn);
  return this.flush();
});

/**
 * Flush all queued rendered pagelets to the request object.
 *
 * @param {Boolean} flushing Should flush the queued data.
 * @api private
 */
Page.readable('flush', function flush(flushing) {
  var page = this;

  //
  // Only write the data to the response if we're allowed to flush.
  //
  if ('boolean' === typeof flushing) this.flushed = flushing;
  if (!this.flushed || !this.queue.length) return this;

  this.res.write(this.queue.join(''), 'utf-8', this.emits('flush'));
  this.queue.length = 0;

  //
  // Optional write confirmation, it got added in more recent versions of
  // node, so if it's not supported we're just going to call the callback
  // our selfs.
  //
  if (this.res.write.length !== 3) {
    this.emit('flush');
  }

  return this;
});

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
Page.readable('inject', function inject(base, name, view) {
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
});

/**
 * Helper to check if the page has pagelet by name, must use prototype.name
 * since pagelets are not always constructed yet.
 *
 * @param {String} name Name of the pagelet.
 * @param {String}
 * @returns {Pagelet} The constructor of a matching Pagelet.
 * @api public
 */
Page.readable('has', function has(name, enabled) {
  if (!name) return undefined;

  var pagelets = enabled ? this.enabled : this.pagelets
    , i = pagelets.length;

  while (i--) {
    if (
       pagelets[i].prototype && pagelets[i].prototype.name === name
    || pagelets[i].name === name
    ) break;
  }

  return pagelets[i];
});

/**
 * Get and initialise a given Pagelet.
 *
 * @param {String} name Name of the pagelet.
 * @returns {Pagelet} The created pagelet instance.
 * @api public
 */
Page.readable('get', function get(name) {
  var Pagelet = this.has(name) || this.has(name, true);

  //
  // It could be that Pagelet is undefined if nothing is initialised or it could
  // be previously initialised pagelet. As it's already initialised, we can
  // simply return it.
  //
  if ('function' !== typeof Pagelet) return Pagelet;
  return Pagelet.freelist.alloc().init({ page: this });
});

/**
 * The bootstrap method generates a string that needs to be included in the
 * template in order for pagelets to function.
 *
 * - It includes the pipe.js JavaScript client and initialises it.
 * - It includes "core" library files for the page.
 * - It includes "core" CSS for the page.
 * - It adds a noscript meta refresh to force our `sync` method which fully
 *   renders the HTML server side.
 *
 * @param {Error} err An Error has been received while receiving data.
 * @param {Object} data Data for the template.
 * @returns {Page} fluent interface
 * @api private
 */
Page.readable('bootstrap', function bootstrap(err, data) {
  var path = this.req.uri.pathname
    , charset = this.charset
    , head = [];

  //
  // It could be that the initialization handled the page rendering through
  // a `page.redirect()` or a `page.notFound()` call so we should terminate
  // the request once that happens.
  //
  if (this.res.finished) return this;
  if (err) return this.end(err);

  data = this.mixin(data || {}, this.data || {});

  //
  // Add a meta charset so the browser knows the encoding of the content so it
  // will not buffer it up in memory to make an educated guess. This will ensure
  // that the HTML is shown as fast as possible.
  //
  if (charset) head.push('<meta charset="' + charset + '">');

  //
  // BigPipe depends heavily on the support of JavaScript in browsers as the
  // rendering of the page's components is done through JavaScript. When the
  // user has JavaScript disabled they will see a blank page instead. To prevent
  // this from happening we're injecting a `noscript` tag in to the page which
  // forces the `sync` render mode.
  //
  // Also when we have JavaScript enabled make sure the user doesn't accidentally
  // force them selfs in to a `sync` render mode as the URL could have been
  // shared through social media
  //
  if (this.mode !== 'sync') {
    head.push(
      '<noscript>',
        '<meta http-equiv="refresh" content="0; URL='+ path +'?'+ qs.stringify(
          this.merge(this.req.query, { no_pagelet_js: 1 })
        )+'">',
      '</noscript>'
    );
  } else {
    head.push(
      '<script>',
        'if (~location.search.indexOf("no_pagelet_js=1"))',
        'location.href = location.href.replace(location.search, "")',
      '</script>'
    );
  }

  //
  // Add all required assets and dependencies to the HEAD of the page.
  //
  this.compiler.page(this, head);

  //
  // Initialise the library.
  //
  head.push(
    '<script>',
      'pipe = new BigPipe(undefined, ', stringify({
          pagelets: this.pagelets.length,     // Amount of pagelets to load
          id: this.id                         // Current Page id.
        }), ' );',
    '</script>'
  );

  // @TODO rel prefetch for resources that are used on the next page?
  // @TODO cache manifest.

  this.res.statusCode = this.statusCode;
  this.res.setHeader('Content-Type', this.contentType);

  //
  // Supply data to the view and render after. Make sure the defined head
  // key cannot be overwritten by any custom data.
  //
  Object.defineProperties(data, Page.predefine.create('bootstrap', {
    writable: false,
    enumerable: true,
    value: head.join('')
  }));

  this.queue.push(this.temper.fetch(this.view).server(data));
  return this.flush(true);
});

/**
 * Reset the instance to it's original state and initialise it.
 *
 * @param {ServerRequest} req HTTP server request.
 * @param {ServerResponse} res HTTP server response.
 * @api private
 */
Page.readable('configure', function configure(req, res) {
  //
  // Clear all properties that are set during rendering so they are all reset to
  // their "factory" settings.
  //
  this.removeAllListeners();
  this.queue.length = this.enabled.length = this.disabled.length = this.n = 0;
  this.flushed = this.ended = false;

  Page.predefine.remove(this.disabled);
  Page.predefine.remove(this.enabled);

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
       'no_pagelet_js' in req.query && +req.query.no_pagelet_js === 1
    || !(req.httpVersionMajor >= 1 && req.httpVersionMinor >= 1)
  ) {
    this.debug('forcing `sync` instead of %s due lack of HTTP 1.1 or JS', this.mode);
    this.mode = 'sync';
  }

  if (this.initialize) {
    if (this.initialize.length) {
      this.debug('Waiting for `initialize` method before rendering');
      this.initialize(this.render.bind(this));
    } else {
      this.initialize();
      this.render();
    }
  } else {
    this.render();
  }

  return this;
});

/**
 * Render execution flow.
 *
 * @api private
 */
Page.readable('render', function render() {
  var pagelet = this.get(this.req.query._pagelet)
    , method = this.req.method.toLowerCase()
    , page = this;

  if (~operations.indexOf(method)) {
    var reader = this.read();
    this.debug('Processing %s request', method);

    if (pagelet && method in pagelet) {
      if (pagelet.authorize) {
        pagelet.authorize(this.req, function auth(accepted) {
          if (!accepted) {
            if (method in page) {
              reader.before(page[method], page);
            } else {
              page[page.mode]();
            }
          } else {
            reader.before(pagelet[method], pagelet);
          }
        });
      } else {
        reader.before(pagelet[method], pagelet);
      }
    } else if (method in page) {
      reader.before(page[method], page);
    } else {
      this[this.mode]();
    }
  } else {
    this[this.mode]();
  }
});

/**
 * Simple logger module that prefixes debug with some extra information. It
 * prefixes the debug statement with the method that was used as well as the
 * entry path.
 *
 * @api private
 */
Page.readable('debug', function log(line) {
  var args = Array.prototype.slice.call(arguments, 1);

  debug.apply(debug, ['%s - %s: '+line, this.method, this.path].concat(args));
  return this;
});

/**
 * Expose a clean way of setting the proper directory for the templates and
 * relative resolving of pagelets.
 *
 * ```js
 * Page.extend({
 *   ..
 * }).on(module);
 * ```
 *
 * @param {Module} module The reference to the module object.
 * @api public
 */
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

/**
 * Optimize the prototypes of the Page to reduce work when we're actually
 * serving the requests.
 *
 * @param {BigPipe} pipe The BigPipe instance.
 * @api private
 */
Page.optimize = function optimize(pipe) {
  var method = this.prototype.method
    , router = this.prototype.path
    , Page = this;

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
      Page.prototype.pagelets = pipe.resolve(
        Page.prototype.pagelets,
        function map(Pagelet) {
          return Pagelet.optimize(pipe.temper, pipe.emits('transform::pagelet'));
        }
      );
    }

    //
    // The view property is a mandatory but it's quite silly to enforce this if
    // the page is just doing a redirect. We can check for this edge case by
    // checking if the set statusCode is in the 300~ range.
    //
    if (Page.prototype.view) {
      Page.prototype.view = path.resolve(Page.prototype.directory, Page.prototype.view);
      pipe.temper.prefetch(Page.prototype.view, Page.prototype.engine);
    } else if (!(Page.prototype.statusCode >= 300 && Page.prototype.statusCode < 400)) {
      throw new Error('The page for path '+ Page.prototype.path +' should have a .view property.');
    }

    //
    // Unique id per page. This is used to track back which page was actually
    // rendered for the front-end so we can retrieve pagelets much easier.
    //
    Page.prototype.id = [1, 1, 1, 1].map(function generator() {
      return Math.random().toString(36).substring(2).toUpperCase();
    }).join('');

    //
    // Add the properties to the page.
    //
    pipe.emit('transform::page', Page);                 // Emit transform event for plugins.
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

//
// Expose the constructor.
//
module.exports = Page;
