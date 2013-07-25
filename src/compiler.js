'use strict';

var crypto = require('crypto')
  , File = require('./file')
  , path = require('path')
  , fs = require('fs');

/**
 * Asset compiler and management.
 *
 * @constructor
 * @param {String} directory The directory where we save our static files.
 * @param {Pipe} pipe The configured Pipe instance.
 * @param {Object} options Configuration.
 * @api private
 */
function Compiler(directory, pipe, options) {
  options = options || {};

  this.pathname = options.pathname || '/';
  this.dir = directory;
  this.pipe = pipe;
  this.list = [];

  this.buffer = Object.create(null);
  this.alias = Object.create(null);
}

Compiler.prototype.__proto__ = require('events').EventEmitter.prototype;

//
// Lazy read the pipe.js JavaScript client. It's already pre-compiled by
// browserify.
//
Object.defineProperty(Compiler.prototype, 'client', {
  get: function read() {
    read.pipe = read.pipe || fs.readFileSync(path.resolve(__dirname, '../dist/pipe.js'), 'utf-8');
    return read.pipe;
  }
});

/**
 * Create the BigPipe base front-end framework that's required for the handling
 * of the real-time connections and the initialisation of the arriving pagelets.
 *
 * @param {String} core Core libraries that need to be loaded on every page.
 * @api private
 */
Compiler.prototype.bigPipe = function bigPipe(core) {
  var library = this.pipe.primus.library() + this.client + (core || '')
    , name = this.hash(library);

  return this.register('/pipe.js', this.pathname + name +'.js', library);
};

/**
 * Create a hash of the code which can be used a filename. This allows us to
 * agressively cache the data.
 *
 * @param {String} code The code that is send to the client.
 * @returns {String} The compiled hash.
 * @api private
 */
Compiler.prototype.hash = function hash(code) {
  return crypto.createHash('sha1').update(code).digest('hex').toString('hex');
};

/**
 * Register a new library with the compiler.
 *
 * @param {String} alias How we know this dependency.
 * @param {String} pathname The exact matching pathname to serve the given code.
 * @param {Mixed} code The library that needs to be transferd.
 * @api private
 */
Compiler.prototype.register = function register(alias, pathname, code) {
  var filename = path.basename(pathname)
    , extname = path.extname(pathname)
    , file;

  //
  // Make sure that the given code is a buffer.
  //
  if (!Buffer.isBuffer(code)) code = new Buffer(code);

  file = this.buffer[pathname] = new File(code, extname);

  this.alias[alias] = pathname;
  this.emit('register', file, alias, pathname);

  return this.save(filename, file);
};

/**
 * Catalog the pages. As we're not caching the file look ups, this method can be
 * called when a file changes so we will generate new.
 *
 * @param {Array} pages The array of pages.
 * @api private
 */
Compiler.prototype.catalog = function catalog(pages) {
  var temper = this.pipe.temper
    , compiler = this
    , core = [];

  /**
   * Process the dependencies.
   *
   * @param {String} filepath The location of a file.
   * @api private
   */
  function prefab(filepath) {
    if (/^(http:|https:)?\/\//.test(filepath)) return;

    var code = fs.readFileSync(filepath, 'utf-8')
      , extname = path.extname(filepath)
      , filename = compiler.hash(code);

    //
    // Update the CSS with a selector that contains the filename which is
    // required for async loading of CSS.
    //
    if ('.css' === extname) {
      code = code + '#pagelet_'+ filename + '{ height: 45px }';
    }

    compiler.register(filepath, compiler.pathname + filename + extname, code);
  }

  pages.forEach(function each(Page) {
    var dependencies = ['/pipe.js']
      , page = Page.prototype;

    page.pagelets.forEach(function each(Pagelet) {
      var pagelet = Pagelet.prototype
        , view;

      if (pagelet.js) prefab(pagelet.js);
      if (pagelet.css) prefab(pagelet.css);

      pagelet.dependencies.forEach(function each(dependency) {
        prefab(dependency);

        if (!~dependencies.indexOf(dependency)) {
          dependencies.push(dependency);
        }
      });

      if (!pagelet.view) return;

      //
      // The views can be rendered on the client, but some of them require
      // a library, this library should be cached in the core library.
      //
      view = temper.fetch(pagelet.view);
      if (view.library && !~core.indexOf(view.library)) core.push(view.library);
    });

    page.dependencies = dependencies.reduce(function reduce(memo, dependency) {
      var extname = path.extname(dependency);

      memo[extname] = memo[extname] || [];
      memo[extname].push(dependency);

      return memo;
    }, Object.create(null));
  });

  //
  // Last, but not least, update the pipe.js library.
  //
  this.bigPipe(core.join('\n'));
};

/**
 * Find all required dependencies for given page constructor.
 *
 * @param {Page} page The initialised page.
 * @returns {Object}
 * @api private
 */
Compiler.prototype.page = function find(page) {
  var compiler = this;

  /**
   * Resolve all dependencies to their hashed versions.
   *
   * @param {String} original The original file path.
   * @returns {String} The hashed version.
   * @api private
   */
  function alias(original) {
    return compiler.alias[original] || original;
  }

  return {
    css: (page.dependencies['.css'] || []).map(alias),
    js: (page.dependencies['.js'] || []).map(alias)
  };
};

/**
 * Store the compiled files to disk. This a vital part of the compiler as we're
 * changing the file names every single time there is a change. But these files
 * can still be cached on the client and it would result in 404's and or broken
 * functionaility.
 *
 * @param {String} name The file name that we're serving.
 * @param {File} file The file instance.
 * @api private
 */
Compiler.prototype.save = function save(name, file) {
  var directory = path.resolve(this.dir)
    , pathname = this.pathname;

  fs.writeFileSync(path.resolve(directory, name), file.code);

  this.list = fs.readdirSync(directory).reduce(function (memo, file) {
    var extname = path.extname(file);

    if (extname) memo[pathname + file] = path.resolve(directory, file);

    return memo;
  }, {});

  return this;
};

/**
 * Serve the file.
 *
 * @param {Request} req Incoming HTTP request.
 * @param {Response} res Outgoing HTTP response.
 * @returns {Boolean} The request is handled by the compiler.
 * @api private
 */
Compiler.prototype.serve = function serve(req, res) {
  if (!(req.uri.pathname in this.buffer)) return false;

  var file = this.buffer[req.uri.pathname];

  res.setHeader('Content-Type', file.type);
  res.setHeader('Content-Length', file.length);
  res.end(file.buffer);

  return true;
};

//
// Expose the module.
//
module.exports = Compiler;
