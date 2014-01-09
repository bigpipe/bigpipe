'use strict';

var Formidable = require('formidable').IncomingForm
  , debug = require('debug')('bigpipe:page')
  , predefine = require('predefine')
  , async = require('async')
  , fuse = require('./fuse')
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
  var writable = predefine(this, predefine.WRITABLE)
    , readable = predefine(this);

  readable('temper', pipe.temper);            // Reference to our template compiler.
  readable('compiler', pipe.compiler);        // Assert management.
  readable('pipe', pipe);                     // Actual pipe instance.
  writable('disabled', []);                   // Contains all disable pagelets.
  writable('enabled', []);                    // Contains all enabled pagelets.
  writable('queue', []);                      // Write queue that will be flushed.
  writable('_events', Object.create(null));   // Required for EventEmitter.
  writable('req', null);                      // Incoming HTTP request.
  writable('res', null);                      // Incoming HTTP response.
  writable('n', 0);                           // Number of processed pagelets.
  writable('params', {});                     // Param extracted from the route.

  //
  // Don't allow any further extensions of the object. This improves performance
  // and forces people to stop maintaining state on the "page". As Object.seal
  // impacts the performance negatively, we're just gonna enable it for
  // development only so people will be caught early on.
  //
  if ('development' === this.env) Object.seal(this);
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
Page.writable('data', null);

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
 * Well, actually, never mind, we shouldn't accept this page so we should
 * render our 404 page instead.
 *
 * @api public
 */
Page.readable('notFound', function notFound() {
  this.emit('free').pipe.status(this.req, this.res, 404);
  if (this.listeners('end').length) this.emit('end');

  return this.debug('Not found, returning Page to freelist and 404-ing');
});

/**
 * We've gotten a captured error and we should show a error page.
 *
 * @param {Error} err The error message.
 * @api public
 */
Page.readable('error', function error(err) {
  err = err || new Error('Internal Server Error');
  this.emit('free').pipe.status(this.req, this.res, 500, err);

  if (this.listeners('end').length) this.emit('end');
  return this.debug('Captured an error: %s, displaying error page instead', err);
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
 * @param {String} base The generated base template.
 * @returns {Page} fluent interface
 * @api private
 */
Page.readable('sync', function render(base) {
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
 * @api private
 */
Page.readable('async', function render(data) {
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
 * @api private
 */
Page.readable('pipeline', function render() {
  return this.debug('Rendering the pagelets in `pipeline` mode');
});

/**
 *
 * @param {Function} fn Completion callback.
 * @returns {Form}
 * @api private
 */
Page.readable('read', function read(fn) {
  var form = new Formidable(this.req)
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
    if (fn) fn(err);

    fields = files = {};
  }).on('end', function end() {
    form.removeAllListeners();

    if (before) {
      before.call(context, fields, files, fn);
    }
  });

  /**
   * Add a hook for adding a completion callback.
   *
   * @param {Function} callback
   * @returns {Form}
   * @api public
   */
  form.before = function befores(callback, context) {
    if (form.listeners('end').length)  {
      form.resume();      // Resume a possiblely buffered post.

      before = callback;
      context = context;
      return form;
    }

    callback.call(context, fields, files, fn);
    return form;
  };

  return form;
});

/**
 * Close the connection once the main page was sent.
 *
 * @returns {Boolean} Closed the connection.
 * @api private
 */
Page.readable('end', function end() {
  var page = this;

  //
  // Do not close the connection before the main page has sent headers.
  //
  if (page.n !== page.enabled.length) {
    this.debug('%s - %s not all pagelets have been written, (%s out of %s)',
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
  // Send the remaining trailer headers if we have them queued.
  //
  if (page.res.trailer) {
    this.debug('Adding trailer headers');
    page.res.addTrailers(page.res.trailers);

    page.res.setHeader = page.res.__setHeader;
    delete page.res.__setHeader;  // Remove reference to previous function.
    delete page.res.trailers;     // Remove newly added object.
    delete page.res.trailer;      // Remove boolean flag.
  }

  //
  // Everything is processed, close the connection.
  //
  this.res.end();
  return true;
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
    , frag = this.compiler.pagelet(pagelet);

  this.debug('%s - %s writing pagelet %s/%s\'s response',
    pagelet.name, pagelet.id
  );

  frag.remove = pagelet.remove; // Does the front-end need to remove the pagelet.
  frag.id = pagelet.id;         // The internal id of the pagelet.
  frag.data = data;             // Template data for the pagelet.
  frag.rpc = pagelet.RPC;       // RPC methods from the pagelet.
  frag.processed = ++this.n;    // Amount of pagelets processed.

  this.queue.push(
    fragment
      .replace(/\{pagelet::name\}/g, pagelet.name)
      .replace(/\{pagelet::data\}/g, JSON.stringify(frag))
      .replace(/\{pagelet::template\}/g, view(data).replace('-->', ''))
  );

  if (fn) this.once('flush', fn);
  return this.flush();
});

/**
 * Flush all queued rendered pagelets to the request object.
 *
 * @api private
 */
Page.readable('flush', function flush() {
  var page = this;

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
 * We've been initialized, proceed with rendering if needed.
 * @TODO free the page if initialization already terminated the request
 *
 * @api private
 */
Page.readable('setup', function setup() {
  var method = this.req.method.toLowerCase()
    , pagelet
    , main
    , sub;

  //
  // It could be that the initialization handled the page rendering through
  // a `page.redirect()` or a `page.notFound()` call so we should terminate
  // the request once that happens.
  //
  if (this.res.finished) return this.req.destroy();
  this.debug('Initialising');

  //
  // Check if the HTTP method is targeted at a specific pagelet inside the
  // page. If so, only execute the logic contained in pagelet#method.
  // If no pagelet is targeted, check if the page has an implementation, if
  // all else fails make sure we destroy the request.
  //
  if (~operations.indexOf(method)) {
    if ('_pagelet' in this.req.query) {
      pagelet = this.has(this.req.query._pagelet);
    }

    if (pagelet && (method in pagelet.prototype)) {
      sub = this.fetch(function found() {
        var args = arguments;

        //
        // Find the pagelet and pass off the data.
        //
        this.enabled.some(function (instance) {
          var match = instance instanceof pagelet;

          if (match) instance[method].apply(instance, args);
          return match;
        });
      });

      sub.pagelet = pagelet.prototype.name;
    } else if (method in this) {
      main = this.fetch(this[method]);
    } else {
      this.req.destroy();
    }
  }

  //
  // Fire the main paths for rendering and dispatching content. Both emits
  // can be supplied with a different set of parameters.
  //
  //  - trigger rendering of page: bootstrap
  //  - trigger rendering of all pagelets: discover
  //
  this.bootstrap(main);
  this.discover(sub);
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
  var Pagelet = this.has(name) || this.has(name, true)
    , pagelet;

  //
  // It could be that Pagelet is undefined if nothing is initialised or it could
  // be previously initialised pagelet. As it's already initialised, we can
  // simply return it.
  //
  if ('function' !== typeof Pagelet) return Pagelet;

  pagelet = Pagelet.freelist.alloc().configure(this);

  return pagelet;
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
 * @param {Object} data Data for the template.
 * @returns {Page} fluent interface
 * @api private
 */
Page.readable('bootstrap', function bootstrap(data) {
  var path = this.req.uri.pathname
    , charset = this.charset
    , head = [];

  data = data || {};

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

  //
  // Add all required assets and dependencies to the HEAD of the page.
  //
  this.compiler.page(this, head);

  //
  // Initialise the library.
  //
  head.push(
    '<script>',
      'pipe = new BigPipe(undefined, ', JSON.stringify({
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
  Object.defineProperties(data, predefine.create(this.pipe.bootstrap, {
    writable: false,
    enumerable: true,
    value: head.join('')
  }));

  this.queue.push(this.temper.fetch(this.view).server(data));

  //
  // Hack: As we've already send out our initial headers, all other headers
  // need to be send as "trailing" headers. But none of the modules in the
  // node's ecosystem are written in a way that they support trailing
  // headers. They are all focused on a simple request/response pattern so
  // we need to override the `setHeader` method so it sends trailer headers
  // instead.
  //
  this.res.trailers = {};
  this.res.trailer = false;
  this.res.__setHeader = this.res.setHeader;
  this.res.setHeader = function setHeader(name, value) {
    if (this._header) {
      this.trailers[name] = value;
      this.trailer = true;
    } else {
      //
      // All data is still queued and we haven't written any headers yet, so
      // add more headers.
      //
      this.__setHeader(name, value);
    }
  };

  this.flush();
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
  // Clear any previous listeners, the counter and added pagelets.
  //
  this.removeAllListeners();
  this.queue.length = this.n = 0;

  predefine.remove(this.enabled);
  predefine.remove(this.disabled);

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
    this.debug('forcing `sync` mode instead of %s due lack of HTTP 1.1', this.mode);
    this.mode = 'sync';
  }

  var pagelet = this.get(this.req.query._pagelet)
    , method = this.req.method.toLowerCase()
    , page = this;

  if (~operations.indexOf(method)) {
    var reader = this.read();

    if (pagelet && method in pagelet) {
      pagelet.authorize(this.req, function auth(accepted) {
        if (!accepted) {
          if (method in page) {
            reader.before(page[method], page);
          } else {
            page.req.destroy();
          }
        }
      });
    } else if (method in page) {
      reader.before(page[method], page);
    } else {
      this.req.destroy();
      this[this.mode]();
    }
  } else {
    this[this.mode]();
  }

  return this;
});

/**
 * Simple logger module that prefixes debug with some extra information. It
 * prefixes the debug statement with the method that was used as well as the
 * entry path.
 *
 * @api private
 */
Page.readable('debug', function log() {
  var args = Array.prototype.slice.call(1, arguments);

  debug.apply(debug, ['%s - %s: '+ arguments[0], this.method, this.path].concat(args));
  return this;
});

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
