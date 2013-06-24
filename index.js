'use strict';

var Portal = require('./portal')
  , Route = require('routable')
  , Page = require('./page')
  , path = require('path')
  , url = require('url')
  , fs = require('fs');

function Pipe(server, pages, options) {
  options = options || {};

  this.statusCodes = Object.create(null);           // Stores error pages.
  this.stream = options.stream || process.stdout;   // Our log stream.
  this.pages = this.require(pages);                 // Our Page constructors.
  this.discover(this.pages);                        // Find error pages.
  this.cache = options.cache || null;               // Enable URL lookup caching.

  //
  // Now that everything is procesed, we can setup our server.
  //
  this.server = server;
  this.portal = new Portal(this.server, {
    using: options.transport || 'engine.io',
    parser: options.parser || 'json'
  });

  //
  // Start listening for incoming requests.
  //
  this.server.on('request', this.incoming.bind(this));
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
 * Load the are enabled.
 *
 * @param {String|Array} pages The pages.
 * @api private
 */
Pipe.prototype.require = function loading(pages) {
  if (!Array.isArray(pages)) {
    pages = fs.readdirSync(pages).map(function locate(file) {
      return path.resolve(pages, file);
    });
  }

  return pages.map(function map(page) {
    //
    // It's not required to supply us with Page instances, we can just
    // automatically require them if they are using the:
    //
    //   module.exports = Page.extend();
    //
    // pattern for defining the Pages.
    //
    if ('string' === typeof page) {
      page = require(page);
    }

    //
    // We didn't receive a proper page instance.
    //
    if ('function' !== typeof page) {
      this.log('𝓦'.red, 'Ignorning invalid page: '+ (JSON.stringify(page) || page.toString()));
      return undefined;
    }

    return this.transform(page);
  }, this).filter(Boolean);
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
    if (page.router.test('/400')) fourofour = page;
  });

  if (!fivehundered) fivehundered = require('./pages/500');
  if (!fourofour) fourofour = require('./pages/404');

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
Pipe.prototype.transform = function transform(page) {
  var method = page.prototype.method
    , router = page.prototype.path;

  //
  // Parse the methods to an array of accepted HTTP methods. We'll only accept
  // there requests and should deny every other possible method.
  //
  if (!Array.isArray(method)) method = method.split(/[\s,]+?/);
  method = method.filter(Boolean).map(function transformation(method) {
    return method.toUpperCase();
  });

  //
  // Add the properties to the page.
  //
  page.router = new Route(router);
  page.method = method;

  return page;
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
  var page = this.find(page);

  // example api:
  // this.post(req)(this.create(page))(this.querystring(req, page))
};

//
// Expose the constructor.
//
module.exports = Pipe;
