'use strict';

var FreeList = require('freelist').FreeList
  , Librarian = require('./librarian')
  , Resource = require('./resource')
  , Route = require('routable')
  , Primus = require('primus')
  , Page = require('./page')
  , Acl = require('./acl')
  , path = require('path')
  , url = require('url')
  , fs = require('fs');

/**
 * Our pagelet managment.
 *
 * The following options are available:
 *
 * - transport: The transport engine we should use for real-time.
 * - cache: A object were we store our url->page mapping.
 * - stream: Where we should write our logs to.
 * - parser: Which parser should be used to send data in real-time.
 *
 * @constructor
 * @param {Server} server HTTP/S based server instance.
 * @param {Mixed} pages String or array of pages we serve.
 * @param {Object} options Configuration.
 * @api public
 */
function Pipe(server, pages, options) {
  options = options || {};

  this.statusCodes = Object.create(null);               // Stores error pages.
  this.resources = Object.create(null);                 // Resource pool
  this.stream = options.stream || process.stdout;       // Our log stream.
  this.pages = this.resolve(pages, this.transform);     // Our Page constructors.
  this.discover(this.pages);                            // Find error pages.
  this.cache = options.cache || null;                   // Enable URL lookup caching.

  //
  // Now that everything is procesed, we can setup our internals.
  //
  this.server = server;
  this.primus = new Primus(this.server, {
    transformer: options.transport || 'engine.io',
    parser: options.parser || 'json'
  });

  //
  // Setup our CSS/JS library
  //
  this.library = new Librarian(this);

  //
  // Setup ACL.
  //
  this.acl = new Acl(this);

  //
  // Start listening for incoming requests.
  //
  this.server.on('request', this.incoming.bind(this));
  this.primus.on('connection', this.connection.bind(this));
}

Pipe.prototype.__proto__ = require('events').EventEmitter.prototype;

/**
 * Simple log method.
 *
 * @param {String} type The log type.
 * @api private
 */
Pipe.prototype.log = function log(type) {
  this.stream.write(
    ['  '+ type].concat(                          // Add some padding.
      Array.prototype.slice.call(arguments, 1)    // Concat it with all args.
    ).join(' ') + '\n'                            // Join it as pretty string.
  );

  return this;
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
  if ('string' === typeof files) {
    files = fs.readdirSync(files).map(function locate(file) {
      return path.resolve(files, file);
    });
  } else if (!Array.isArray(files)) {
    files = Object.keys(files).map(function merge(name) {
      var constructor = files[name];
      constructor.prototype.name = constructor.prototype.name || name;

      return constructor;
    });
  }

  files = files.map(function map(constructor) {
    //
    // It's not required to supply us with instances, we can just
    // automatically require them if they are using the:
    //
    //   module.exports = base.extend();
    //
    // pattern for defining the pages/pagelets.
    //
    if ('string' === typeof constructor) {
      constructor = require(constructor);
    }

    //
    // We didn't receive a proper page instance.
    //
    if ('function' !== typeof constructor) {
      var invalid = (JSON.stringify(constructor) || constructor.toString());
      this.log('𝓦'.red, 'Ignorning invalid constructor: '+ invalid);
      return undefined;
    }
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
 * @api private
 */
Pipe.prototype.discover = function discover(pages) {
  var fivehundered
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
  if (!fivehundered) fivehundered = this.transform(require('./pages/500'));
  if (!fourofour) fourofour = this.transform(require('./pages/404'));

  this.statusCodes[500] = fivehundered;
  this.statusCodes[404] = fourofour;

  return this;
};

/**
 * We need to extract items from the Page prototype and transform it in to
 * something useful.
 *
 * @param {Page} page Page constructor.
 * @return {Page} The upgrade page.
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
    var pagelets = this.resovle(Page.prototype.pagelets, function map(Pagelet) {
      //
      // This pagelet has already been processed before as pages can share
      // pagelets.
      //
      if (Pagelet.properties) return Pagelet;

      var prototype = Pagelet.prototype
        , dir = prototype.directory;

      if (prototype.view) Pagelet.prototype.view = path.resolve(dir, prototype.view);
      if (prototype.css) Pagelet.prototype.css = path.resolve(dir, prototype.css);
      if (prototype.js) Pagelet.prototype.js = path.resolve(dir, prototype.js);

      //
      // Make sure that all our dependencies are also directly mapped to an
      // absolute url.
      //
      if (prototype.dependencies) {
        Pagelet.prototype.dependencies = prototype.dependencies.map(function (dep) {
          return path.resolve(dir, dep);
        });
      }

      Pagelet.properties = Object.keys(Pagelet.prototype);

      return Pagelet;
    });

    //
    // Save the transformed pagelets.
    //
    Page.prototype.pagelets = pagelets;
  }

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
  Page.collection = new FreeList('page', Page.prototype.freelist || 1000, function () {
    return new Page(pipe);
  });

  return Page;
};

/**
 * Find the correct Page constructor based on the given url.
 *
 * @param {String} url The url we need to find.
 * @returns {Mixed} either a Page constructor or undefined;
 * @api public
 */
Pipe.prototype.find = function find(url) {
  if (this.cache && url in this.cache) return this.cache[url];

  for (var i = 0, found, length = this.pages.length; i < length; i++) {
    if (this.pages[i].router.test(url)) {

      if (this.cache) this.cache[url] = this.pages[i];
      return this.pages[i];
    }
  }

  return undefined;
};

/**
 * Handle incoming requests.
 *
 * @param {Request} req HTTP request.
 * @param {Resposne} res HTTP response.
 * @api private
 */
Pipe.prototype.incoming = function incoming(req, res) {
  var page = this.find(page) || this.statusCodes[404];

  // example api:
  // this.post(req)(this.create(page))(this.querystring(req, page))
};

/**
 * Handle incoming real-time requests.
 *
 * @param {Spark} socket A real-time "socket"
 */
Pipe.prototype.connection = function connection(socket) {

};

/**
 * Create a new Pagelet/Pipe server.
 *
 * @param {Number} port Port number we should listen on.
 * @param {Array} pages List with pages.
 * @param {Object} options Configuration.
 * @returns {Pipe}
 * @api public
 */
Pipe.createServer = function createServer(port, pages, options) {
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
  var pipe = new Pipe(server, pages || options.pages, options);
  server.listen(port);

  return pipe;
};

//
// Expose the constructor.
//
module.exports = Pipe;
