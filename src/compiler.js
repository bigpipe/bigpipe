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
 * @param {Primus} primus The configured primus instance.
 * @param {Object} options Configuration.
 * @api private
 */
function Compiler(directory, primus, options) {
  options = options || {};

  this.primus = primus;
  this.dir = directory;
  this.list = [];
  this.pathname = options.pathname || '/';

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
    read.pipe = read.pipe || fs.readFileSync(__dirname + '/dist/pipe.js', 'utf-8');
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
  var library = this.primus.library() + this.client + (core || '')
    , name = this.hash(library);

  return this.register('pipe.js', this.pathname + name +'.js', library);
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
  return crypto.createHash('sha1').update(code).digest().toString('hex');
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
  this.alias[alias] = this.buffer[pathname];
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
Compiler.prototoype.catalog = function catalog(pages) {
  var temper = this.pipe.temper
    , compiler = this
    , core = [];

  /**
   * Process the dependencies.
   *
   * @api private
   */
  function prefab(filepath) {
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

    compiler.register(filepath, compiler.pathname +'/'+ filename + extname, code);
  }

  pages.forEach(function each(Page) {
    var page = Page.prototype
      , dependencies = [];

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
      // a library, this libary should be cached in the core library.
      //
      view = temper.fetch(pagelet.view);
      if (view.library && !~core.indexOf(view.library)) core.push(view.library);
    });

    page.dependencies = dependencies.reduce(function reduce(memo, dependency) {
      var extname = path.extname(dependency);

      memo[extname] = memo[extname] || [];
      memo[extname].push(dependency);
    });

    //
    // Register the Pipe.js library as first script file that needs to be
    // loaded.
    //
    page.dependencies['.js'].unshift('/pipe.js');
  });

  //
  // Last, but not least, update the pipe.js library.
  //
  this.bigPipe(core.join('\n'));
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
    memo[pathname + file] = path.resolve(directory, file);
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
