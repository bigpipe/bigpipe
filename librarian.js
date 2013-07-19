'use strict';

var crypto = require('crypto')
  , fs = require('fs');

/**
 * The librarian manages all the assets that we have inside our pagelets. It's
 * able to identify the most commonly included libraries and compiles them in
 * a single core file.
 *
 * All non-common assets are also compiled and saved to disk so we don't have to
 * recompile everything during a request.
 *
 * Options:
 *
 * - threshold, the precentage of pages it's included on for it to be consided
 *   a candicate for the core file. Default to 80%.
 *
 * @constructor
 * @param {Pipe} pipe Reference to the Pipe
 * @api public
 */
function Librarian(pipe, options) {
  options = options || {};

  this.threshold = parseInt(options.threshold || 80, 10); // Threshold for core.
  this.appendix = Object.create(null);                    // List of core files.
  this.buffer = Object.create(null);                      // File lookup table.
  this.pipe = pipe;
}

//
// Proxy some of the pipe's properties directly in to our librarian.
//
['log', 'pages', 'temper'].forEach(function proxy(api) {
  Object.defineProperty(Librarian.prototype, api, {
    get: function get() {
      return this.pipe[api];
    }
  });
});

//
// Provide a pre-parsed interface to the pagelet for easy modification.
//
Object.defineProperty(Librarian.prototype, 'parsed', {
  get: function pagelets() {
    var authorization = {}
      , pagelet = {};

    var pages = this.pipe.pages.reduce(function each(memo, Page) {
      memo[Page.id] = Page.prototype.pagelets.map(function normalize(Pagelet) {
        var proto = Pagelet.prototype;

        return {
          dependencies: proto.dependencies,   // Array of pagelet dependencies.
          authorized: !!proto.authorize,      // Is authorization required.
          view: proto.view,                   // Location of the view.
          name: proto.name,                   // Name of the pagelet.
          css: proto.css,                     // Location of the CSS.
          js: proto.view,                     // Location of the JS.
          id: Page.id,                        // Id of the page.
          amount: 1                           // How many times we've seen it.
        };
      }).reduce(function sort(pagelets, data) {
        if (data.authorized) authorization[data.name] = data;
        else if (pagelet[data.name]) {
          //
          // We've already seen this pagelet, so mark it as a duplicate.
          //
          pagelet[data.name].amount++;
        } else {
          pagelet[data.name] = data;
        }

        pagelets[data.name] = data;
        return pagelets;
      }, {});

      return memo;
    }, {});

    //
    // Add some easy to use iterators.
    //
    [authorization, pagelet, pages].forEach(function each(data) {
      Object.defineProperty(data, 'forEach', {
        value: function (fn) {
          Object.keys(data).forEach(function (key) {
            fn(data[key], key, data);
          });
        }
      });
    });

    return {
      authorized: authorization,
      pagelets: pagelet,
      pages: pages
    };
  }
});

Librarian.prototype.catalog = function catalog() {
  var meta = this.meta();
};

/**
 * Scan the supplied pages for duplicate pagelet definitions. Some rules for
 * scanning:
 *
 * - Pagelets that require authorization should never be included in the core
 *   file. This includes the template engines they leverage. As this code
 *   shouldn't be exposed to the general public.
 *
 * @api public
 */
Librarian.prototype.meta = function metagenerator() {
  var temper = this.temper
    , data = this.parsed
    , meta = {};

  /**
   * Increment a metric.
   *
   * @param {String} what Name of the metrics.
   * @param {Number} howmany How many of these should be incremented.
   * @api private
   */
  function incr(what, howmany) {
    howmany = howmany || 1;

    if (what in meta) meta['counter::'+ what] = meta['counter::'+ what] + howmany;
    else meta['counter::'+ what] = howmany;

    return incr;
  }

  data.pagelets.forEach(function each(pagelet) {
    var template = temper.fetch(pagelet.view);
    meta[template.engine] = template.library;

    incr('library::'+ template.engine, pagelet.amount);
    incr('view::'+ pagelet.view, pagelet.amount);
    incr('css::'+ pagelet.css, pagelet.amount);
    incr('js::'+ pagelet.js, pagelet.amount);
  });

  return meta;
};

/**
 * Returns a list of files that should be embed in to the page.
 *
 * @param {Page} page A page instance.
 * @returns {Object} JavaScript and CSS that needs to be included in the page.
 * @api public
 */
Librarian.prototype.lend = function lend(page) {
  return {};
};

/**
 * Serve the content over the HTTP connection.
 *
 * @param {Request} req The HTTP request.
 * @param {Response} res The HTTP response.
 * @returns {Boolean} Served by the librarian.
 * @api public
 */
Librarian.prototype.serve = function serve(req, res) {
  if (!(req.url in this.buffer)) return false;

  return true;
};

/**
 * Create a versioned filename from the content. This allows cache busting when
 * the content has changed.
 *
 * @param {String} extension The file extension returned from path.extname.
 * @param {String} content The content.
 * @returns {String} The versioned filename
 * @api private
 */
Librarian.prototype.version = function version(extension, content) {
  return crypto.createHash('sha1')
    .update(content)
    .digest()
    .toString('hex') + extension;
};

/**
 * Read a file location.
 *
 * @param {String} path Location of the file.
 * @api private
 */
Librarian.prototype.read = function read(path) {
  if (path in this.buffer) return this.buffer[path];

  return this.buffer[path] = fs.readFileSync(path, 'utf-8');
};

//
// Initialize.
//
module.exports = Librarian;
