'use strict';

var crypto = require('crypto')
  , async = require('async')
  , preprocess = require('smithy')
  , File = require('./file')
  , path = require('path')
  , mkdirp = require('mkdirp')
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
  this.core = [];

  this.buffer = Object.create(null);
  this.alias = Object.create(null);
  this.origin = Object.create(null);

  //
  // Create the provided directory, will shortcircuit if present.
  //
  mkdirp.sync(directory);
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
 * @param {String} client Core libraries that need to be loaded on every page.
 * @api private
 */
Compiler.prototype.bigPipe = function bigPipe(client) {
  var library = this.pipe.primus.library() + client + this.core.join('\n')
    , name = this.hash(library);

  return this.register({
    alias: '/dist/pipe.js',
    pathname: this.pathname + name + '.js',
    code: library,
    origin: path.resolve(__dirname, '../dist/pipe.js')
  });
};

/**
 * Merge in objects.
 *
 * @param {Object} target The object that receives the props
 * @param {Object} additional Extra object that needs to be merged in the target
 * @api private
 */
Compiler.prototype.merge = function merge(target, additional) {
  var result = target
    , compiler = this
    , undefined;

  if (Array.isArray(target)) {
    compiler.forEach(additional, function arrayForEach(index) {
      if (JSON.stringify(target).indexOf(JSON.stringify(additional[index])) === -1) {
        result.push(additional[index]);
      }
    });
  } else if ('object' === typeof target) {
    compiler.forEach(additional, function objectForEach(key, value) {
      if (target[key] === undefined) {
        result[key] = value;
      } else {
        result[key] = compiler.merge(target[key], additional[key]);
      }
    });
  } else {
    result = additional;
  }

  return result;
};

/**
 * Iterate over a collection. When you return false, it will stop the iteration.
 *
 * @param {Mixed} collection Either an Array or Object.
 * @param {Function} iterator Function to be called for each item
 * @api private
 */
Compiler.prototype.forEach = function forEach(collection, iterator, context) {
  if (arguments.length === 1) {
    iterator = collection;
    collection = this;
  }

  var isArray = Array.isArray(collection || this)
    , length = collection.length
    , i = 0
    , value;

  if (context) {
    if (isArray) {
      for (; i < length; i++) {
        value = iterator.apply(collection[ i ], context);
        if (value === false) break;
      }
    } else {
      for (i in collection) {
        value = iterator.apply(collection[ i ], context);
        if (value === false) break;
      }
    }
  } else {
    if (isArray) {
      for (; i < length; i++) {
        value = iterator.call(collection[i], i, collection[i]);
        if (value === false) break;
      }
    } else {
      for (i in collection) {
        value = iterator.call(collection[i], i, collection[i]);
        if (value === false) break;
      }
    }
  }

  return this;
};

/**
 * Generate destination path.
 *
 * @param {String} filepath full path to file
 * @param {String} content parsed content
 * @api public
 */
Compiler.prototype.destination = function destination(filepath, content) {
  var processor = this.processor(filepath);

  return [
    this.pathname,
    this.hash(content),
    processor ? '.' + processor.export : path.extname(filepath)
  ].join('');
};

/**
 * Get preprocessor.
 *
 * @param {String} filepath
 * @returns {Function}
 * @api public
 */
Compiler.prototype.processor = function processor(filepath) {
  return preprocess[path.extname(filepath).substr(1)];
};

/**
 * Upsert new file in compiler cache.
 *
 * @param {String} filepath full path to file
 * @api private
 */
Compiler.prototype.put = function put(filepath) {
  var compiler = this
    , dest;

  compiler.process(filepath, function processed(error, code) {
    if (error) return compiler.emit('error', error);

    dest = compiler.destination(filepath, code);
    compiler.emit('preprocessed', filepath);
    compiler.register({
      alias: filepath,
      pathname: dest,
      code: code
    });
  });
};

/**
 * Read the file from disk and preprocess it depending on extension.
 *
 * @param {String} filepath full path to file
 * @param {Function} fn callback
 * @api private
 */
Compiler.prototype.process = function process(filepath, fn) {
  var processor = this.processor(filepath);

  fs.readFile(filepath, 'utf-8', function read(error, code) {
    if (error || !processor) return fn(error, code);

    //
    // Only preprocess the file if required.
    //
    processor(code, { location: filepath }, fn);
  });
};

/**
 * Create a hash of the code which can be used a filename. This allows us to
 * aggressively cache the data.
 *
 * @param {String} code The code that is send to the client.
 * @returns {String} The compiled hash.
 * @api private
 */
Compiler.prototype.hash = function hash(code) {
  return crypto.createHash('sha1').update(code).digest('hex').toString('hex');
};

/**
 * Register a new library with the compiler. The following traits can be
 * provided to register a specific file.
 *   - alias {String} How we know this dependency.
 *   - pathname {String} The exact matching pathname to serve the given code.
 *   - code {Mixed} The library that needs to be transfered.
 *   - origin {String} Optional the original pathname before compiling
 *
 * @param {Object} traits of compiled content to register
 * @api private
 */
Compiler.prototype.register = function register(traits) {
  var pathname = traits.pathname
    , filename = path.basename(pathname)
    , extname = path.extname(pathname)
    , alias = traits.alias
    , code = traits.code
    , origin = traits.origin || alias
    , file;

  //
  // Update the CSS with a selector that contains the filename which is
  // required for async loading of CSS.
  //
  if (extname === '.css') {
    code = code + '#pagelet_'+ this.hash(code) + ' { height: 42px }';
  }

  //
  // Make sure that the given code is a buffer.
  //
  if (!Buffer.isBuffer(code)) code = new Buffer(code);
  file = this.buffer[pathname] = new File(code, extname);

  //
  // Get file and dirname from alias, unique in 99.9% of the cases.
  //
  alias = path.sep + alias.split(path.sep).splice(-2).join(path.sep);

  //
  // Add file to alias and origin.
  //
  this.alias[alias] = pathname;
  this.origin[origin] = alias;
  this.emit('register', file, alias, pathname, origin);

  return this.save(filename, file);
};

/**
 * Catalog the pages. As we're not caching the file look ups, this method can be
 * called when a file changes so we will generate new.
 *
 * @param {Array} pages The array of pages.
 * @param {Function} done callback
 * @api private
 */
Compiler.prototype.catalog = function catalog(pages, done) {
  var temper = this.pipe.temper
    , compiler = this
    , assemble = []
    , core = compiler.core;

  /**
   * Process the dependencies.
   *
   * @param {String} filepath The location of a file.
   * @api private
   */
  function prefab(filepath, fn) {
    if (/^(http:|https:)?\/\//.test(filepath)) return fn();

    /**
     * Register the processed content.
     *
     * @param {Error} error
     * @param {String} content
     * @api private
     */
    compiler.process(filepath, function store(error, content) {
      if (error) return fn(error);
      compiler.register({
        alias: filepath,
        pathname: compiler.destination(filepath, content),
        code: content
      });

      fn(error, content);
    });
  }

  //
  // Check all pages for dependencies and files to assemble.
  //
  pages.forEach(function each(Page) {
    var dependencies = ['/dist/pipe.js']
      , page = Page.prototype;

    page.pagelets.forEach(function each(Pagelet) {
      var pagelet = Pagelet.prototype
        , view;

      if (pagelet.js) assemble.push(pagelet.js);
      if (pagelet.css) assemble.push(pagelet.css);

      pagelet.dependencies.forEach(function each(dependency) {
        assemble.push(dependency);

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

      compiler.register({
        alias: pagelet.view,
        pathname: compiler.pathname + compiler.hash(view.client) +'.js',
        code: view.client
      });
    });

    page.dependencies = dependencies.reduce(function reduce(memo, dependency) {
      var extname = path.extname(dependency);

      memo[extname] = memo[extname] || [];
      memo[extname].push(dependency);

      return memo;
    }, Object.create(null));

    //
    // Assemble the CSS/JS of the pagelet with prefab.
    //
  });

  async.each(assemble, prefab, done);

  //
  // Last, but not least, update the pipe.js library.
  //
  this.bigPipe(this.client);
};

/**
 * Find all required dependencies for given page constructor.
 *
 * @param {Page} page The initialised page.
 * @returns {Object}
 * @api private
 */
Compiler.prototype.page = function find(page) {
  return {
    css: (page.dependencies['.css'] || []).map(this.resolve.bind(this)),
    js: (page.dependencies['.js'] || []).map(this.resolve.bind(this))
  };
};

/**
 * Resolve all dependencies to their hashed versions.
 *
 * @param {String} original The original file path.
 * @returns {String} The hashed version.
 * @api private
 */
Compiler.prototype.resolve = function resolve(original) {
  return this.alias[original] || this.alias[this.origin[original]] || original;
};

/**
 * A list of resources that need to be loaded for the given pagelet.
 *
 * @param {Pagelet} pagelet The initialised pagelet.
 * @param {Boolean} streaming The pagelet is streaming, so include the view.
 * @returns {Object}
 * @api private
 */
Compiler.prototype.pagelet = function find(pagelet, streaming) {
  var css = []
    , js = [];

  if (pagelet.js) js.push(this.resolve(pagelet.js));
  if (pagelet.css) css.push(this.resolve(pagelet.css));
  if (streaming && pagelet.view) js.push(this.resolve(pagelet.view));

  return { css: css, js: js };
};

/**
 * Store the compiled files to disk. This a vital part of the compiler as we're
 * changing the file names every single time there is a change. But these files
 * can still be cached on the client and it would result in 404's and or broken
 * functionality.
 *
 * @param {String} name The file name that we're serving.
 * @param {File} file The file instance.
 * @api private
 */
Compiler.prototype.save = function save(name, file) {
  var directory = path.resolve(this.dir)
    , pathname = this.pathname;

  fs.writeFileSync(path.resolve(directory, name), file.buffer);

  this.list = fs.readdirSync(directory).reduce(function reduce(memo, file) {
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
