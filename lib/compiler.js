'use strict';

var debug = require('diagnostics')('bigpipe:compiler')
  , preprocess = require('smithy')
  , mkdirp = require('mkdirp')
  , crypto = require('crypto')
  , async = require('async')
  , File = require('./file')
  , path = require('path')
  , fs = require('fs');

//
// Find the pipe.js client library.
//
var pipejs = path.join(require.resolve('pipe.js'), '../dist/pipe.js')
  , local = path.resolve(__dirname, '../dist/pipe.js');

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

  // The pipe.js client code.
  this.client = fs.readFileSync(pipejs, 'utf-8');

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

/**
 * Create the BigPipe base front-end framework that's required for the handling
 * of the real-time connections and the initialization of the arriving pagelets.
 *
 * @param {String} client Core libraries that need to be loaded on every page.
 * @api private
 */
Compiler.prototype.bigPipe = function bigPipe(client) {
  var library = [
    '//',
    '// Powered by BigPipe v'+ this.pipe.version,
    '// https://github.com/bigpipe/bigpipe',
    '//',

    this.pipe.primus.library(),
    client,
    this.core.join('\n')
  ].join('\n');

  debug('creating the pipe.js front-end library which contains the Primus, client information and core');
  return this.register(new File(local, '.js', true, library));
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
    compiler.register(new File(filepath, compiler.type(filepath), false, code));
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
 * @param {File} file instance of File
 * @api private
 */
Compiler.prototype.register = function register(file) {
  var compiler = this;

  //
  // Add file to the buffer collection.
  //
  this.buffer[file.location] = file;

  //
  // Add file references to alias.
  //
  file.aliases.forEach(function add(alias) {
    compiler.alias[alias] = file.location;
  });

  this.emit('register', file);
  return this.save(file);
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
    if (/^(http:|https:)?\/\//.test(filepath)) return next(null, assemble);

    compiler.process(filepath, function store(error, code) {
      if (error) return next(error);

      var file = new File(
        filepath,
        compiler.type(filepath),
        list[filepath].dependency,
        code
      );

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
      compiler.namespace(assemble[hash], function namespaced(error, file) {
        if (error) return fn(error);

        compiler.register(file);
        fn();
      });
    }, next);
  }

  //
  // Check all pages for dependencies and files to add to the list.
  //
  pages.forEach(function each(Page) {
    var page = Page.prototype
      , dependencies = page.dependencies || [];

    /**
     * Add files to the process list.
     *
     * @param {String} name Pagelet name.
     * @param {String|Array} files Path to files.
     * @param {Boolean} dependency Push this file to global dependencies.
     * @api private
     */
    function add(name, files, dependency) {
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

    page.pagelets.forEach(function each(Pagelet) {
      var pagelet = Pagelet.prototype
        , view;

      if (pagelet.js) add(pagelet.name, pagelet.js);
      if (pagelet.css) add(pagelet.name, pagelet.css);
      add(pagelet.name, pagelet.dependencies, true);

      //
      // The views can be rendered on the client, but some of them require
      // a library, this library should be cached in the core library.
      //
      if (!pagelet.view) return;
      debug('Attempting to compile the view of '+ pagelet.name);
      view = temper.fetch(pagelet.view);

      if (view.library && !~core.indexOf(view.library)) {
        core.push(view.library);
      }

      compiler.register(new File(pagelet.view, '.js', false, view.client));
    });

    //
    // Add page level dependencies to the global list for preprocessing .
    //
    add(null, dependencies, true);

    //
    // Store the page level dependencies per file extension in the page.
    //
    page.dependencies = dependencies.concat(local).reduce(function reduce(memo, dependency) {
      var extname = path.extname(dependency);

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
  ], done);

  //
  // Last, but not least, update the pipe.js library.
  //
  this.bigPipe(this.client);
};

/**
 * Find all required dependencies for given page constructor.
 *
 * @param {Page} page The initialized page.
 * @param {Array} assets The array where the assets needs to be pushed in.
 * @returns {Object}
 * @api private
 */
Compiler.prototype.page = function find(page, assets) {
  var compiler = this;

  //
  // The page is rendered in `sync` mode, so add all the required CSS files from
  // the pagelet to the head of the page.
  //
  if (!('.css' in page.dependencies)) page.dependencies['.css'] = [];
  if ('sync' === page.mode) page.enabled.forEach(function enabled(pagelet) {
    Array.prototype.push.apply(page.dependencies['.css'], compiler.pagelet(pagelet).css);
  });

  preprocess.extensions.concat('.js').forEach(function map(type) {
    if (!(type in page.dependencies)) return;

    page.dependencies[type].forEach(function each(dependency) {
      dependency = compiler.html(compiler.resolve(dependency));
      if (!~assets.indexOf(dependency)) assets.push(dependency);
    });
  });

  return this;
};

/**
 * Generate HTML.
 *
 * @param {String} file The filename that needs to be added to a DOM.
 * @returns {String} A correctly wrapped HTML tag.
 * @api private
 */
Compiler.prototype.html = function html(file) {
  switch (path.extname(file)) {
    case '.css': return '<link rel=stylesheet href="'+ file +'" />';
    case '.js': return '<script src="'+ file +'"></script>';
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
  return this.alias[original] || original;
};

/**
 * A list of resources that need to be loaded for the given pagelet.
 *
 * @param {Pagelet} pagelet The initialized pagelet.
 * @param {Boolean} streaming The pagelet is streaming, so include the view.
 * @returns {Object}
 * @api private
 */
Compiler.prototype.pagelet = function find(pagelet, streaming) {
  var frag = {}
    , css = []
    , js = [];

  debug('Compiling data from pagelet %s/%s', pagelet.name, pagelet.id);

  if (pagelet.js) js = js.concat(pagelet.js.map(this.resolve.bind(this)));
  if (pagelet.css) css = css.concat(pagelet.css.map(this.resolve.bind(this)));
  if (streaming && pagelet.view) js.push(this.resolve(pagelet.view));

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
  var file = (this.compiler || this).buffer[req.uri.pathname];

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
