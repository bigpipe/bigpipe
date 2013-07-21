;(function(e,t,n){function i(n,s){if(!t[n]){if(!e[n]){var o=typeof require=="function"&&require;if(!s&&o)return o(n,!0);if(r)return r(n,!0);throw new Error("Cannot find module '"+n+"'")}var u=t[n]={exports:{}};e[n][0].call(u.exports,function(t){var r=e[n][1][t];return i(r?r:t)},u,u.exports)}return t[n].exports}var r=typeof require=="function"&&require;for(var s=0;s<n.length;s++)i(n[s]);return i})({1:[function(require,module,exports){
'use strict';

/**
 * Get an accurate type check for the given Object.
 *
 * @param {Mixed} obj The object that needs to be detected.
 * @returns {String} The object type
 * @api private
 */
function type(obj) {
  return Object.prototype.toString.call(obj).slice(8, -1).toLowerCase();
}

/**
 * Iterate over a collection.
 *
 * @param {Mixed} collection The object we want to iterate over.
 * @param {Function} iterator The function that's called for each iteration.
 * @param {Mixed} context The context of the function.
 * @api private
 */
function each(collection, iterator, context) {
  if ('function' === typeof collection.forEach) {
    return collection.forEach(iterator, context);
  }

  var i = 0;

  if ('array' === type(collection)) {
    for (; i < collection.length; i++) {
      iterator.call(context, collection[i], i, collection);
    }
  } else {
    for (i in collection) {
      iterator.call(context, i, collection[i]);
    }
  }
}

/**
 * Checks if the given object is empty. The only edge case here would be
 * objects. Most object's have a `length` attribute that indicate if there's
 * anything inside the object.
 *
 * @param {Mixed} collection The collection that needs to be checked.
 * @returns {Boolean}
 * @api private
 */
function empty(obj) {
  if (!obj) return false;
  return size(obj) === 0;
}

/**
 * Determin the size of a collection.
 *
 * @param {Mixed} collection The object we want to know the size of.
 * @returns {Number} The size of the collection.
 * @api private
 */
function size(collection) {
  var x, i = 0;

  if ('object' === type(collection)) {
    for (x in collection) i++;
    return i;
  }

  return +collection.length;
}

exports.empty = empty;
exports.size = size;
exports.type = type;
exports.each = each;

},{}],2:[function(require,module,exports){
/*globals Primus */
'use strict';

var collection = require('./collection')
  , Pagelet = require('./pagelet');

/**
 * Pipe.
 *
 * @constructor
 * @param {String} server The server address we need to connect to.
 * @param {Object} options Pipe configuration
 * @api public
 */
function Pipe(server, options) {
  options = options || {};

  this.stream = null;                   // Reference to the connected Primus socket.
  this.pagelets = {};                   // Collection of different pagelets.
  this.freelist = [];                   // Collection of unused Pagelet instances.
  this.maximum = 20;                    // Max Pagelet instances we can reuse.
  this.assets = {};                     // Asset cache.
  this.root = document.documentElement; // The <html> element.

  Primus.EventEmitter.call(this);

  this.configure(options);
  this.connect(server, options.primus);
}

//
// Inherit from Primus's EventEmitter.
//
Pipe.prototype = new Primus.EventEmitter();
Pipe.prototype.constructor = Pipe;

/**
 * Configure the Pipe.
 *
 * @api private
 */
Pipe.prototype.configure = function configure() {
  if (this.root.className.indexOf('no_js')) {
    this.root.className = this.root.className.replace('no_js', '');
  }
};

(function horror() {
  /**
   * Try to detect if this browser supports the onload events on the link tag.
   * It's a known cross browser bug that can affect WebKit, FireFox and Opera.
   * Internet Explorer is the only browser that supports the onload event
   * consistenly but it has other bigger issues that prevents us from using this
   * method.
   *
   * @param {Element} target
   * @api private
   */
  function detect(target) {
    if (detect.ran) return;
    detect.ran = true;

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'data:text/css;base64,';

    link.onload = function loaded() {
      link.parentNode.removeChild(link);
      link.onload = false;
      detect.onload = true;
    };

    target.appendChild(link);
  }

  /**
   * Check if all stylesheets have been correctly injected.
   *
   * @returns {Boolean}
   * @api private
   */
  function loaded() {
    var meta, url, style;

    for (url in metaqueue) {
      meta = metaqueue[url];

      if (new Date() - meta.start > timeout) {
        meta.fn(new Error('The styleSheet has timed out'));
        delete meta.fn;
      } else {
        style = window.getComputedStyle
          ? getComputedStyle(meta.tag, null)
          : meta.tag.currentStyle;

        //
        // We assume that the CSS set the height property of the for given id
        // selector.
        //
        if (style && meta.fn && parseInt(style.height, 10) > 1) {
          meta.fn();
          delete meta.fn;
        }
      }

      if (!meta.fn) {
        meta.tag.parentNode.removeChild(meta.tag);
        delete metaqueue[url];
      }
    }

    return collection.empty(metaqueue);
  }

  /**
   * Start polling for StyleSheet changes to detect if a StyleSheet has been
   * loaded. This is done by injecting a <meta> tag in to the page with
   * a dedicated `id` attribute that matches a selector that we've added in the
   * server side for example:
   *
   * ```css
   * #pagelet_af3f399qu { height: 45px }
   * ```
   *
   * @api private
   */
  function poll(url, root, fn) {
    var meta = document.createElement('meta');
    meta.id = 'pagelet_'+ url.split('/').pop().replace('.css').toLowerCase();
    root.appendChild(meta);

    metaqueue[url] = {
      now: +new Date(),
      tag: meta,
      fn: fn
    };

    if (loaded()) return;
    if (!poll.interval) poll.interval = setInterval(function interval() {
      if (loaded()) clearInterval(poll.interval);
    }, 20);
  }

  //
  // Internet Explorer can only have 31 style tags on a single page. One single
  // style tag is also limited to 31 @import statements so this gives us room to
  // have 961 stylesheets totally. So we should queue stylesheets.
  //
  // @see http://john.albin.net/ie-css-limits/two-style-test.html
  // @see http://support.microsoft.com/kb/262161
  //
  var styleSheets = []
    , metaqueue = {}
    , timeout = 5000;

  /**
   * Load a new stylesheet.
   *
   * @param {String} url The stylesheet url that needs to be loaded.
   * @param {Function} fn Completion callback.
   * @api private
   */
  Pipe.prototype.loadStyleSheet = function loadStyleSheet(url, fn) {
    if (url in this.assets) return;

    if (document.styleSheet) {
      for (var sheet, i = 0; i < styleSheets.length; i++) {
        if (styleSheets[i].imports.length < 31) {
          sheet = i;
          break;
        }
      }

      //
      // We didn't find suitable styleSheet to add another @import statement,
      // create a new one so we can leverage that instead.
      //
      // @TODO we should probably check the amount of document.styleSheets.length
      //       to check if we're allowed to add more stylesheets.
      //
      if (sheet === undefined) {
        styleSheets.push(document.createStyleSheet());
        sheet = styleSheets.length - 1;
      }

      styleSheets[sheet].addImport(url);
      this.assets[url] = styleSheets[sheet];
      return poll(url, this.root, fn);
    }

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = url;

    //
    // Only add the onload/onerror listeners when we've detected that's it's
    // supported in the browser.
    //
    if (detect.onload) {
      link.onerror = function onerror() {
        link.onerror = link.onload = null;
        fn(new Error('Failed to load the stylesheet'));
      };

      link.onload = function onload() {
        link.onerror = link.onload = null;
        fn();
      };
    } else {
      poll(url, this.root, fn);

      //
      // We don't have a detect.onload, make sure we've started our feature
      // detection.
      //
      if (!detect.ran) detect(this.root);
    }

    this.assets[url] = link;
    this.root.appendChild(link);
  };

  /**
   * Remove a stylesheet again.
   *
   * @param {String} url The stylesheet url that needs to be unloaded.
   * @api private
   */
  Pipe.prototype.unloadStyleSheet = function unloadStyleSheet(url) {
    if (!(url in this.assets)) return;

    var asset = this.assets[url];

    if (!asset.imports) {
      asset.onload = asset.onerror = null;
      asset.parentNode.removeChild(asset);
    } else {
      for (var i = 0, length = asset.imports.length; i < length; i++) {
        if (asset.imports[i].href === url) {
          asset.removeImport(i);
          break;
        }
      }
    }

    delete this.assets[url];
    delete metaqueue[url];
  };
}());

/**
 * Load a new Script.
 *
 * @param {String} url The script file that needs to be loaded in to the page.
 * @param {Function} fn The completion callback.
 * @api private
 */
Pipe.prototype.loadJavaScript = function loadJavaScript(url, fn) {
  if (url in this.assets) return;

  var script = document.createElement('script');
  script.async = true; // Required for FireFox 3.6 / Opera async loading.

  //
  // onerror is not triggered by all browsers, but should give us a clean
  // indication of failures.
  //
  script.onerror = function onerror() {
    script.onerror = script.onload = script.onreadystatechange = null;
    fn(new Error('Failed to load the script'));
  };

  //
  // All "latest" browser seem to support the onload event for detecting full
  // script loading. Internet Explorer 11 no longer needs to use the
  // onreadystatechange method for completion indication.
  //
  script.onload = function onload() {
    script.onerror = script.onload = script.onreadystatechange = null;
    fn();
  };

  //
  // Fallback for older IE versions, they do not support the onload event on the
  // script tag and we need to check the script readyState to see if it's
  // successfully loaded.
  //
  script.onreadystatechange = function onreadystatechange() {
    if (this.readyState in { loaded: 1, complete: 1 }) {
      script.onerror = script.onload = script.onreadystatechange = null;
      fn();
    }
  };

  //
  // The src needs to be set after the element has been added to the document.
  // If I remember correctly it had to do something with an IE8 bug.
  //
  this.root.appendChild(script);
  script.src = url;

  this.assets[url] = script;
};

/**
 * Remove the loaded script source again.
 *
 * @param {String} url The script url that needs to be unloaded
 * @api private
 */
Pipe.prototype.unloadJavaScript = function unloadJavaScript(url) {

};

/**
 * A new Pagelet is flushed by the server. We should register it and update the
 * content.
 *
 * @param {String} name The name of the pagelet.
 * @param {Object} data Pagelet data.
 * @api public
 */
Pipe.prototype.arrive = function arrive(name, data) {
  var pagelet = this.pagelets[name] = this.alloc();
  pagelet.configure(name, data);

  return this;
};

/**
 * Allocate a new Pagelet instance.
 *
 * @returns {Pagelet}
 */
Pipe.prototype.alloc = function alloc() {
  return this.freelist.length
    ? this.freelist.shift()
    : new Pagelet(this);
};

/**
 * Free an allocated Pagelet instance which can be re-used again to reduce
 * garbage collection.
 *
 * @param {Pagelet} pagelet The pagelet instance.
 * @api private
 */
Pipe.prototype.free = function free(pagelet) {
  if (this.freelist.length < this.maximum) this.freelist.push(pagelet);
};

/**
 * Setup a real-time connection to the pagelet server.
 *
 * @param {String} url The server address.
 * @param {Object} options The primus configuration.
 * @api private
 */
Pipe.prototype.connect = function connect(url, options) {
  this.stream = new Primus(url, options);
};


},{"./collection":1,"./pagelet":3}],3:[function(require,module,exports){
/*globals Primus, ActiveXObject, CollectGarbage */
'use strict';

/**
 * Representation of a single pagelet.
 *
 * @constructor
 * @param {Pipe} pipe The pipe.
 * @api public
 */
function Pagelet(pipe, name, data) {
  Primus.EventEmitter.call(this);

  this.pipe = pipe;
}

//
// Inherit from Primus's EventEmitter.
//
Pagelet.prototype = new Primus.EventEmitter();
Pagelet.prototype.constructor = Pagelet;

/**
 * Configure the Pagelet.
 *
 * @param {String} name The given name of the pagelet.
 * @param {Object} data The data of the pagelet.
 * @api private
 */
Pagelet.prototype.configure = function configure(name, data) {
  this.name = name;
};

/**
 * Find the element based on the attribute and value.
 *
 * @returns {Array|NodeList}
 * @api private
 */
Pagelet.prototype.$ = function $(attribute, value) {
  if (document && 'querySelectorAll' in document) {
    return document.querySelectorAll('['+ attribute +'="'+ value +'"]');
  }

  //
  // No querySelectorAll support, so we're going to do a full DOM scan.
  //
  var all = document.getElementsByTagName('*')
    , length = all.length
    , results = []
    , i = 0;

  for (; i < length; i++) {
    if (all[i].getAttribute(attribute) === value) {
      results.push(all[i]);
    }
  }

  return results;
};

/**
 * Create a sandboxed container for the pagelet to run in.
 *
 * @param {String} code The client side code that needs to be sandboxed.
 * @api private
 */
Pagelet.prototype.sandbox = function sandbox(code) {
  var script = document.getElementsByTagName('script')[0]
    , unique = this.name + (+new Date())
    , container;

  if (!this.htmlfile) {
    try {
      //
      // Internet Explorer 6/7 require a unique name attribute in order to work.
      //
      container = document.createElement('<iframe name="'+ unique +'">');
    } catch (e) {
      container = document.createElement('iframe');
      container.name = unique;
    }

    //
    // The iframe needs to be added in to the DOM before we can modify it, make
    // sure it's remains unseen.
    //
    container.style.top = container.style.left = -10000;
    container.style.position = 'absolute';
    container.style.display = 'none';
    script.parentNode.insertBefore(this.container, script);

    this.container = container.contentDocument || container.contentWindow.document;
    this.container.open();
  } else {
    this.container = new ActiveXObject('htmlfile');
  }

  this.container.write('<html><s'+'cript>'+ code +'</s'+'cript></html>');
  this.container.close();
};

/**
 * Prepare the JavaScript code for iframe injection and sandboxing.
 *
 * @param {String} code The client side code of the pagelet.
 * @returns {String}
 * @api private
 */
Pagelet.prototype.prepare = function prepare(code) {
  return [
    //
    // Force the same domain as our "root" script.
    //
    'document.domain="'+ document.domain +'";',
    '(function (o, h) {',

    //
    // Eliminate the browsers blocking dialogs, we're in a iframe not a browser.
    //
    'for (var i = 0; i < h.length; i++) o[h[i]] = function () {};',

    //
    // The actual client-side code that needs to be evaluated.
    //
    code,

    '})(this, ["alert", "prompt", "confirm"]);'
  ].join('\n');
};

/**
 * Does this browser support HTMLfile's. It's build upon the ActiveXObject and
 * allows us to embed a page within a page without triggering any loading
 * indicators. The added benefit is that it doesn't need to be added to the DOM
 * in order for the page and it's resources to load.
 *
 * It's detected using feature detection.
 *
 * @type {Boolean}
 * @private
 */
Pagelet.prototype.htmlfile = false;

try { Pagelet.prototype.htmlfile = !!new ActiveXObject('htmlfile'); }
catch (e) {}

/**
 * Destroy the pagelet and clean up all references so it can be re-used again in
 * the future.
 *
 * @TODO remove unused CSS files
 * @api public
 */
Pagelet.prototype.destroy = function destroy() {
  //
  // Automatically schedule this Pagelet instance for re-use.
  //
  this.pipe.free(this);

  if (!this.htmlfile) {
    this.container.parentNode.removeChild(this.container);
    this.container = null;
    return;
  }

  //
  // We need to ensure that all references to the created HTMLFile sandbox are
  // removed before we call the `CollectGarbage` method of Internet Explorer or
  // it will not be cleaned up properly.
  //
  this.container = null;
  CollectGarbage();
};

//
// Expose the module.
//
module.exports = Pagelet;

},{}]},{},[2])
;