'use strict';

var debug = require('diagnostics')('bigpipe:compiler')
  , Collection = require('./collection')
  , browserify = require('browserify')
  , preprocess = require('smithy')
  , mkdirp = require('mkdirp')
  , crypto = require('crypto')
  , stream = require('stream')
  , async = require('async')
  , File = require('./file')
  , path = require('path')
  , fs = require('fs');

/**
 * Small extension of a Readable Stream to push content into the browserify build.
 *
 * @Constructor
 * @param {Mixed} str file content
 * @api private
 */
function Content(str) {
  stream.Readable.call(this);

  this.push(Array.isArray(str) ? str.join('') : str);
  this.push(null);
}

//
// Inherit from Readable Stream and provide a _read stub.
//
require('util').inherits(Content, stream.Readable);
Content.prototype._read = function noop () {};

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
  this.pipe = pipe;

  // The namespace where we can download files.
  this.pathname = options.pathname || '/';

  // Directory to save the compiled files.
  this.dir = directory;

  // List of pre-compiled or previous compiled files.
  this.list = [];

  // Contains template engines that are used to render.
  this.core = [];

  this.buffer = Object.create(null); // Precompiled asset cache
  this.alias = Object.create(null);  // Path aliases.

  //
  // Create the provided directory, will short circuit if present.
  //
  mkdirp.sync(directory);
}

Compiler.prototype.__proto__ = require('eventemitter3').prototype;
Compiler.prototype.asyncemit = require('asyncemit');

/**
 * Create the BigPipe base front-end framework that's required for the handling
 * of the real-time connections and the initialization of the arriving pagelets.
 *
 * @param {Function} done Completion callback.
 * @api private
 */
Compiler.prototype.bigPipe = function bigPipe(done) {
  var framework = this.pipe._framework
    , library
    , plugin
    , name
    , file;

  debug('Creating the bigpipe.js front-end library');

  library = browserify();
  framework.get('library').forEach(function each(file) {
    library.require(file.path, { expose: file.expose });
  });

  if (this.core.length) library.require(new Content(this.core));

  for (name in this.pipe._plugins) {
    plugin = this.pipe._plugins[name];

    if (plugin.library) {
      library.require(plugin.library.path, { expose: plugin.library.name });
    }

    if (!plugin.client || !plugin.path) continue;
    debug('Adding the client code of the %s plugin to the client file', name);

    library.require(new Content(framework.get('plugin', {
      client: plugin.client.toString(),
      name: name
    })), { file: plugin.path, entry: true });
  }

  library.bundle(done);
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
    , compiler = this;

  if (Array.isArray(target)) {
    compiler.forEach(additional, function arrayForEach(index) {
      if (JSON.stringify(target).indexOf(JSON.stringify(additional[index])) === -1) {
        result.push(additional[index]);
      }
    });
  } else if ('object' === typeof target) {
    compiler.forEach(additional, function objectForEach(key, value) {
      if (target[key] === void 0) {
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
        value = iterator.apply(collection[i], context);
        if (value === false) break;
      }
    } else {
      for (i in collection) {
        value = iterator.apply(collection[i], context);
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
 * Get the processed extension for a certain file.
 *
 * @param {String} filepath full path to file
 * @api public
 */
Compiler.prototype.type = function type(filepath) {
  var processor = this.processor(filepath);
  return processor ? '.' + processor.export : path.extname(filepath);
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
  var compiler = this;

  compiler.process(filepath, function processed(error, code) {
    if (error) return compiler.emit('error', error);

    compiler.emit('preprocessed', filepath);
    compiler.register(new File(filepath, {
      extname: compiler.type(filepath),
      code: code
    }));
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
  var processor = this.processor(filepath)
    , paths = [ path.dirname(filepath) ];

  fs.readFile(filepath, 'utf-8', function read(error, code) {
    if (error || !processor) return fn(error, code);

    //
    // Only preprocess the file if required.
    //
    processor(code, { location: filepath, paths: paths }, fn);
  });
};

/**
 * Prefix selectors of CSS with [data-pagelet='name'] to contain CSS to
 * specific pagelets. File can have the following properties.
 *
 * @param {File} file instance of File
 * @param {Function} fn completion callback.
 * @api public
 */
Compiler.prototype.namespace = function prefix(file, fn) {
  //
  // Only prefix if the code is CSS content and not a page dependency.
  //
  if (!file.is('css') || file.dependency) return fn(null, file);
  debug('namespacing %s to pagelets %s', file.hash, file.pagelets);

  var processor = preprocess.css
    , options = {}
    , pagelets;

  //
  // Transform the pagelets names to data selectors.
  //
  pagelets = file.pagelets.map(function prepare(pagelet) {
    return '[data-pagelet="'+ pagelet +'"]';
  });

  options.plugins = [ processor.plugins.namespace(pagelets) ];
  processor(file.code, options, function done(error, code) {
    if (error) return fn(error);
    fn(null, file.set(code, true));
  });
};

/**
 * Register a new library with the compiler. The following traits can be
 * provided to register a specific file.
 *
 * @param {File} file instance of File.
 * @param {Boolean} origin Flag to store file with original filepath as reference.
 * @api private
 */
Compiler.prototype.register = function register(file, origin) {
  if (!file.length) return debug('Skipped registering empty file %j', file.aliases);
  var compiler = this;

  //
  // Add file to the buffer collection.
  //
  this.buffer[origin ? file.origin : file.location] = file;

  //
  // Add file references to alias.
  //
  file.aliases.forEach(function add(alias) {
    if (!alias) return;

    this.alias[alias] = file.location;
  }, this);

  this.asyncemit('register', file, function (error) {
    if (error) return compiler.emit('error', error);
    compiler.save(file);
  });
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
  var framework = this.pipe._framework
    , temper = this.pipe._temper
    , core = this.core
    , compiler = this
    , list = {};

  /**
   * Process the dependencies.
   *
   * @param {Object} assemble generated collection of file properties.
   * @param {String} filepath The location of a file.
   * @param {Function} next completion callback.
   * @api private
   */
  function prefab(assemble, filepath, next) {
    if (compiler.http(filepath)) return next(null, assemble);

    compiler.process(filepath, function store(error, code) {
      if (error) return next(error);

      var file = new File(filepath, {
        extname: compiler.type(filepath),
        dependency: list[filepath].dependency,
        code: code
      });

      file = file.hash in assemble ? assemble[file.hash] : file;
      file.pagelets = (file.pagelets || []).concat(list[filepath].pagelets);
      file.alias(filepath);

      assemble[file.hash] = file;
      debug('finished pre-processing %s to hash %s', path.basename(filepath), file.hash);
      next(null, assemble);
    });
  }

  /**
   * Register the files in the assembly, prefix CSS first.
   *
   * @param {Object} assemble generated collection of file properties.
   * @param {Function} next completion callback.
   * @api private
   */
  function register(assemble, next) {
    async.each(Object.keys(assemble), function prefix(hash, fn) {
      compiler.asyncemit('assembly', assemble[hash], function (err) {
        if (err) return fn(err);

        compiler.register(assemble[hash]);
        fn();
      });
    }, next);
  }

  //
  // Check all pages for dependencies and files to add to the list.
  //
  pages.forEach(function each(Page) {
    var page = Page.prototype
      , dependencies = Array.isArray(page.dependencies) ? page.dependencies : [];

    /**
     * Add files to the process list.
     *
     * @param {String} name Pagelet name.
     * @param {String|Array} files Path to files.
     * @param {Boolean} dependency Push this file to global dependencies.
     * @api private
     */
    function add(name, files, dependency) {
      //
      // Check if files is an object and return, this Pagelet has already
      // been cataloged and the dependencies overwritten.
      //
      if ('object' === typeof files && !Array.isArray(files)) return;
      files = Array.isArray(files) ? files : [ files ];
      files.forEach(function loopFiles(file) {
        if (dependency && !~dependencies.indexOf(file)) dependencies.push(file);

        //
        // Use stored file or create a new one based on the filepath.
        //
        file = list[file] = list[file] || { dependency: false, pagelets: [] };
        if (name && !~file.pagelets.indexOf(name)) file.pagelets.push(name);
        if (dependency) file.dependency = true;
      });
    }

    /**
     * Register a new view.
     *
     * @param {String} path Location of the template file
     * @param {String} error
     * @api private
     */
    function view(page, type) {
      var path = page[type]
        , data;

      debug('Attempting to compile the view %s', path);
      data = temper.fetch(path);

      //
      // The views can be rendered on the client, but some of them require
      // a library, this library should be cached in the core library.
      //
      if (data.library && !~core.indexOf(data.library)) {
        core.push(data.library);
      }

      if (!data.hash) data.hash = {
        client: crypto.createHash('md5').update(data.client).digest('hex')
      };

      compiler.register(new File(path, {
        extname: '.js',
        code: framework.get('template', {
          name: data.hash.client,
          client: data.client
        })
      }));
    }

    //
    // Note: quick fix, now that routed pages have become pagelets
    // we should also resolve the Page assets.
    //
    page._children.concat(Page).forEach(function each(Pagelet) {
      if (Array.isArray(Pagelet)) return Pagelet.forEach(each);

      var pagelet = Pagelet.prototype;

      if (pagelet.js) add(pagelet.name, pagelet.js);
      if (pagelet.css) add(pagelet.name, pagelet.css);

      add(pagelet.name, pagelet.dependencies, true);

      if (pagelet.view) view(pagelet, 'view');
      if (pagelet.error) view(pagelet, 'error');
    });

    //
    // Store the page level dependencies per file extension in the page.
    // If the file extension cannot be determined, the dependency will be tagged
    // as foreign, so other functions like `html` and `page` can do additional
    // checks to include the file.
    //
    page._dependencies = dependencies.concat(framework.get('name')).reduce(function reduce(memo, dependency) {
      var extname = path.extname(dependency) || 'foreign';

      memo[extname] = memo[extname] || [];
      memo[extname].push(dependency);

      return memo;
    }, Object.create(null));
  });

  //
  // Process and register the CSS/JS of all the pagelets.
  //
  async.waterfall([
    async.apply(async.reduce, Object.keys(list), {}, prefab),
    register
  ], function completed(err, data) {
    if (err) return done(err);

    compiler.bigPipe(function browserified(err, buffer) {
      if (err) return done(err);
      debug('Finished creating browserify build');

      var file = new File(framework.get('name'), {
        dependency: true,
        extname: '.js',
        code: buffer
      });

      //
      // Also register the file under the name of the fittings so
      // it can also be loaded _without_ knowing the md5.
      //
      compiler.register(file);
      compiler.register(file, true);

      done(err, data);
    });
  });
};

/**
 * Find all required dependencies for given page constructor.
 *
 * @param {Page} page The initialized page.
 * @returns {Object}
 * @api private
 */
Compiler.prototype.page = function find(page) {
  var compiler = this
    , assets = new Collection({ toString: this.html });

  //
  // The page is rendered in `sync` mode, so add all the required CSS files from
  // the pagelet to the head of the page.
  //
  if (!('.css' in page._dependencies)) page._dependencies['.css'] = [];
  if ('sync' === page.mode) page._enabled.forEach(function enabled(pagelet) {
    Array.prototype.push.apply(page._dependencies['.css'], compiler.pagelet(pagelet).css);
  });

  //
  // Push dependencies into the page. JS is pushed as extension after CSS,
  // still adheres to the CSS before JS pattern, although it is less important
  // in newer browser. See http://stackoverflow.com/questions/9271276/ for more
  // details. Foreign extensions are added last to allow unidentified files to
  // be included if possible.
  //
  preprocess.extensions.concat('.js', 'foreign').forEach(function map(type) {
    if (!(type in page._dependencies)) return;

    page._dependencies[type].forEach(function each(dependency) {
      if (compiler.http(dependency)) {
        return assets.push(new File(dependency, {
          extname: compiler.type(dependency),
          dependency: true,
          external: true
        }));
      }

      dependency = compiler.resolve(dependency);
      if (!dependency) return;

      assets.push(compiler.buffer[dependency]);
    });
  });

  return assets;
};

/**
 * Check if the path is a http(s) url.
 *
 * @param {String} filepath Url to file.
 * @return {Boolean}
 * @api private
 */
Compiler.prototype.http = function http(filepath) {
  return /^(http:|https:)?\/\//.test(filepath);
};

/**
 * Generate HTML.
 *
 * @param {String} file The filename that needs to be added to a DOM.
 * @returns {String} A correctly wrapped HTML tag.
 * @api private
 */
Compiler.prototype.html = function html(file) {
  switch (file.extname) {
    case '.css': return '<link rel=stylesheet href="'+ file.location +'" />';
    case '.js': return '<script src="'+ file.location +'"></script>';
    default: return '';
  }
};

/**
 * Resolve all dependencies to their hashed versions.
 *
 * @param {String} original The original file path.
 * @returns {String} The hashed version.
 * @api private
 */
Compiler.prototype.resolve = function resolve(original) {
  return this.alias[original] || false;
};

/**
 * A list of resources that need to be loaded for the given pagelet.
 *
 * @param {Pagelet} pagelet The initialized pagelet.
 * @returns {Object}
 * @api private
 */
Compiler.prototype.pagelet = function find(pagelet) {
  var error = this.resolve(pagelet.error)
    , view = this.resolve(pagelet.view)
    , frag = {}
    , css = []
    , js = [];

  debug('Compiling data from pagelet %s/%s', pagelet.name, pagelet.id);

  if (pagelet.js.length) js = js.concat(pagelet.js.map(this.resolve, this));
  if (pagelet.css.length) css = css.concat(pagelet.css.map(this.resolve, this));
  if (view) js.push(view);
  if (error) js.push(error);

  frag.css = css;               // Add the compiled css.
  frag.js = js;                 // Add the required js.

  return frag;
};

/**
 * Store the compiled files to disk. This a vital part of the compiler as we're
 * changing the file names every single time there is a change. But these files
 * can still be cached on the client and it would result in 404's and or broken
 * functionality.
 *
 * @param {File} file The file instance.
 * @api private
 */
Compiler.prototype.save = function save(file) {
  var directory = path.resolve(this.dir)
    , pathname = this.pathname;

  fs.writeFileSync(path.join(directory, file.location), file.buffer);

  this.list = fs.readdirSync(directory).reduce(function reduce(memo, file) {
    if (path.extname(file)) {
      memo[pathname + file] = path.resolve(directory, file);
    }

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
  var file = (this._compiler || this).buffer[req.uri.pathname];

  if (!file) return undefined;

  res.setHeader('Content-Type', file.type);
  res.setHeader('Content-Length', file.length);
  res.end(file.buffer);

  return true;
};

//
// Expose the module.
//
module.exports = Compiler;
