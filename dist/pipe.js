(function(e){if("function"==typeof bootstrap)bootstrap("bigpipe",e);else if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else if("undefined"!=typeof ses){if(!ses.ok())return;ses.makeBigPipe=e}else"undefined"!=typeof window?window.BigPipe=e():global.BigPipe=e()})(function(){var define,ses,bootstrap,module,exports;
return (function(e,t,n){function i(n,s){if(!t[n]){if(!e[n]){var o=typeof require=="function"&&require;if(!s&&o)return o(n,!0);if(r)return r(n,!0);throw new Error("Cannot find module '"+n+"'")}var u=t[n]={exports:{}};e[n][0].call(u.exports,function(t){var r=e[n][1][t];return i(r?r:t)},u,u.exports)}return t[n].exports}var r=typeof require=="function"&&require;for(var s=0;s<n.length;s++)i(n[s]);return i})({1:[function(require,module,exports){
'use strict';

var collection = require('./collection');

//
// Pointless function that will replace callbacks once they are executed to
// prevent double execution from ever happening.
//
function noop() {}

/**
 * Asyncronously iterate over the given data.
 *
 * @param {Mixed} data The data we need to iterate over
 * @param {Function} iterator Function that's called for each item.
 * @param {Function} fn The completion callback
 * @param {Object} options Async options.
 * @api public
 */
exports.each = function each(data, iterator, fn, options) {
  options = options || {};

  var size = collection.size(data)
    , completed = 0
    , timeout;

  if (!size) return fn();

  collection.each(data, function iterating(item) {
    iterator.call(options.context, item, function done(err) {
      if (err) {
        fn(err);
        return fn = noop;
      }

      if (++completed === size) {
        fn();
        if (timeout) clearTimeout(timeout);
        return fn = noop;
      }
    });
  });

  //
  // Optional timeout for when the operation takes to long.
  //
  if (options.timeout) timeout = setTimeout(function kill() {
    fn(new Error('Operation timed out'));
    fn = noop;
  }, options.timeout);
};

},{"./collection":2}],2:[function(require,module,exports){
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
      iterator.call(context, collection[i], i);
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

/**
 * Wrap the given object in an array if it's not an array allready.
 *
 * @param {Mixed} obj The thing we might need to wrap.
 * @returns {Array} We promise!
 * @api private
 */
function array(obj) {
  if ('array' === type(obj)) return obj;

  return obj  // Only transform objects in to an array when they exist.
    ? [ obj ]
    : [];
}

//
// Expose the collection utilities.
//
exports.array = array;
exports.empty = empty;
exports.size = size;
exports.type = type;
exports.each = each;

},{}],3:[function(require,module,exports){
/*globals Primus */
'use strict';

var collection = require('./collection')
  , Pagelet = require('./pagelet')
  , loader = require('./loader');

/**
 * Pipe.
 *
 * @constructor
 * @param {String} server The server address we need to connect to.
 * @param {Object} options Pipe configuration
 * @api public
 */
function Pipe(server, options) {
  if (!(this instanceof Pipe)) return new Pipe(server, options);

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

/**
 * Horrible hack, but needed to prevent memory leaks while maintaing sublime
 * performance. See Pagelet.prototype.IEV for more information.
 *
 * @type {Number}
 * @private
 */
Pipe.prototype.IEV = Pagelet.prototype.IEV;

/**
 * A new Pagelet is flushed by the server. We should register it and update the
 * content.
 *
 * @param {String} name The name of the pagelet.
 * @param {Object} data Pagelet data.
 * @api public
 */
Pipe.prototype.arrive = function arrive(name, data) {
  if (!this.has(name)) this.create(name, data);
  return this;
};

/**
 * Create a new Pagelet instance.
 *
 * @api private
 */
Pipe.prototype.create = function create(name, data) {
  var pagelet = this.pagelets[name] = this.alloc();
  pagelet.configure(name, data);
};

/**
 * Check if the pagelet has already been loaded.
 *
 * @param {String} name The name of the pagelet.
 * @returns {Boolean}
 * @api public
 */
Pipe.prototype.has = function has(name) {
  return name in this.pagelets;
};

/**
 * Remove the pagelet.
 *
 * @param {String} name The name of the pagelet that needs to be removed.
 * @api public
 */
Pipe.prototype.remove = function remove(name) {
  if (this.has(name)) {
    this.pagelets[name].destroy();
    delete this.pagelets[name];
  }

  return this;
};

/**
 * Load a new resource.
 *
 * @param {Element} root The root node where we should insert stuff in.
 * @param {String} url The location of the asset.
 * @param {Function} fn Completion callback.
 * @api private
 */
Pipe.prototype.load = loader.load;

/**
 * Unload a new resource.
 *
 * @param {String} url The location of the asset.
 * @api private
 */
Pipe.prototype.unload = loader.unload;

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

//
// Expose the pipe
//
module.exports = Pipe;

},{"./collection":2,"./loader":4,"./pagelet":5}],4:[function(require,module,exports){
'use strict';

var collection = require('./collection')
  , styleSheets = []
  , metaQueue = {}
  , timeout = 5000
  , assets = {};

/**
 * Check if all style sheets have been correctly injected by looping over the
 * metaQueue.
 *
 * @returns {Boolean} All style sheets have been loaded.
 * @api private
 */
function loaded() {
  var meta, url, style;

  for (url in metaQueue) {
    meta = metaQueue[url];

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
      delete metaQueue[url];
    }
  }

  return collection.empty(metaQueue);
}

/**
 * Start polling for Style Sheet changes to detect if a Style Sheet has been
 * loaded. This is done by injecting a <meta> tag in to the page with
 * a dedicated `id` attribute that matches a selector that we've added in the
 * server side for example:
 *
 * ```css
 * #pagelet_af3f399qu { height: 42 }
 * ```
 *
 * @api private
 */
function poll(url, root, fn) {
  var meta = document.createElement('meta');
  meta.id = 'pagelet_'+ url.split('/').pop().replace('.css', '').toLowerCase();
  root.appendChild(meta);

  metaQueue[url] = {
    start: +new Date(),
    tag: meta,
    fn: fn
  };

  //
  // Do a quick check before trying to poll, it could be that style sheet was
  // cached and was loaded instantly on the page.
  //
  if (loaded()) return;

  if (!poll.interval) poll.interval = setInterval(function interval() {
    if (loaded()) clearInterval(poll.interval);
  }, 20);
}

/**
 * Try to detect if this browser supports the onload events on the link tag.
 * It's a known cross browser bug that can affect WebKit, FireFox and Opera.
 * Internet Explorer is the only browser that supports the onload event
 * consistency but it has other bigger issues that prevents us from using this
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
 * Load a new style sheet.
 *
 * @param {String} url The style sheet URL that needs to be loaded.
 * @param {Function} fn Completion callback.
 * @api private
 */
function loadStyleSheet(root, url, fn) {
  if (url in assets) return fn();

  //
  // Internet Explorer can only have 31 style tags on a single page. One single
  // style tag is also limited to 31 @import statements so this gives us room to
  // have 961 style sheets totally. So we should queue style sheets. This
  // limitation has been removed in Internet Explorer 10.
  //
  // @see http://john.albin.net/ie-css-limits/two-style-test.html
  // @see http://support.microsoft.com/kb/262161
  // @see http://blogs.msdn.com/b/ieinternals/archive/2011/05/14/internet-explorer-stylesheet-rule-selector-import-sheet-limit-maximum.aspx
  //
  if (document.styleSheet) {
    for (var sheet, i = 0; i < styleSheets.length; i++) {
      if (styleSheets[i].imports.length < 31) {
        sheet = i;
        break;
      }
    }

    //
    // We didn't find suitable style Sheet to add another @import statement,
    // create a new one so we can leverage that instead.
    //
    // @TODO we should probably check the amount of `document.styleSheets.length`
    //       to check if we're allowed to add more style sheets.
    //
    if (sheet === undefined) {
      styleSheets.push(document.createStyleSheet());
      sheet = styleSheets.length - 1;
    }

    styleSheets[sheet].addImport(url);
    assets[url] = styleSheets[sheet];
    return poll(url, root, fn);
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
      fn(new Error('Failed to load the stylesheet.'));
    };

    link.onload = function onload() {
      link.onerror = link.onload = null;
      fn();
    };
  } else {
    poll(url, root, fn);

    //
    // We don't have a detect.onload, make sure we've started our feature
    // detection.
    //
    if (!detect.ran) detect(root);
  }

  assets[url] = link;
  root.appendChild(link);
}

/**
 * Remove a style sheet again.
 *
 * @param {String} url The style sheet URL that needs to be unloaded.
 * @api private
 */
function unloadStyleSheet(url) {
  if (!(url in assets)) return;

  var asset = assets[url];

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

  delete assets[url];
  delete metaQueue[url];
}

/**
 * Load a new Script.
 *
 * @param {String} url The script file that needs to be loaded in to the page.
 * @param {Function} fn The completion callback.
 * @api private
 */
function loadJavaScript(root, url, fn) {
  if (url in assets) return fn();

  var script = document.createElement('script');
  script.async = true; // Required for FireFox 3.6 / Opera async loading.

  //
  // onerror is not triggered by all browsers, but should give us a clean
  // indication of failures.
  //
  script.onerror = function onerror() {
    script.onerror = script.onload = script.onreadystatechange = null;
    fn(new Error('Failed to load the script.'));
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
  // Fall-back for older IE versions, they do not support the onload event on the
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
  root.appendChild(script);
  script.src = url;

  assets[url] = script;
}

/**
 * Remove the loaded script source again.
 *
 * @param {String} url The script URL that needs to be unloaded
 * @api private
 */
function unloadJavaScript(url) {
  if (!(url in assets)) return;

  var asset = assets[url];
  asset.onload = asset.onerror = asset.onreadystatechange = null;
  asset.parentNode.removeChild(asset);

  delete assets[url];
}

/**
 * Load a new resource.
 *
 * @param {Element} root The root node where we should insert stuff in.
 * @param {String} url The location of the asset.
 * @param {Function} fn Completion callback.
 * @api public
 */
exports.load = function load(root, url, fn) {
  if ('js' !== url.split('.').pop()) return loadStyleSheet(root, url, fn);
  loadJavaScript(root, url, fn);
};

/**
 * Unload a new resource.
 *
 * @param {String} url The location of the asset.
 * @api public
 */
exports.unload = function unload(url) {
  if ('js' !== url.split('.').pop()) return unloadStyleSheet(url);
  unloadJavaScript(url);
};

},{"./collection":2}],5:[function(require,module,exports){
/*globals Primus, ActiveXObject, CollectGarbage */
'use strict';

var collection = require('./collection')
  , async = require('./async');

/**
 * Representation of a single pagelet.
 *
 * @constructor
 * @param {Pipe} pipe The pipe.
 * @api public
 */
function Pagelet(pipe) {
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
  this.placeholders = this.$('data-pagelet', name);
  this.name = name;

  this.css = collection.array(data.css);    // CSS for the Page.
  this.js = collection.array(data.js);      // Dependencies for the page.
  this.run = data.run;                      // Pagelet client code.

  var pagelet = this.broadcast('configured', data);

  async.each(this.css.concat(this.js), function download(asset, next) {
    this.load(document.body, asset, next);
  }, function done(err) {
    if (err) return pagelet.emit('error', err);
    pagelet.emit('loaded');

    pagelet.render(pagelet.parse());
    pagelet.initialise();
  }, { context: this.pipe, timeout: 25 * 1000 });
};

/**
 * The pagelet's resource has all been loaded.
 *
 * @api private
 */
Pagelet.prototype.initialise = function initialise() {
  this.broadcast('initialise');

  //
  // Only load the client code in a sandbox when it exists. There no point in
  // spinning up a sandbox if it does nothing
  //
  if (!this.code) return;
  this.sandbox(this.prepare(this.code));
};

/**
 * Broadcast an event that will be emitted on the pagelet and the page.
 *
 * @param {String} event The name of the event we should emit
 * @api private
 */
Pagelet.prototype.broadcast = function broadcast(event) {
  this.emit.apply(this, arguments);
  this.pipe.emit.apply(this.pipe, [
    this.name +'::'+ event,
    this.pipe
  ].concat(Array.prototype.slice.call(arguments, 1)));

  return this;
};

/**
 * Find the element based on the attribute and value.
 *
 * @returns {Array|NodeList}
 * @api private
 */
Pagelet.prototype.$ = function $(attribute, value) {
  if (document && 'querySelectorAll' in document) {
    return Array.prototype.slice.call(document.querySelectorAll('['+ attribute +'="'+ value +'"]'), 0);
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
    , pagelet = this
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
    script.parentNode.insertBefore(container, script);

    //
    // Add an error listener so we can register errors with the client code and
    // know when the code has gone in a fubar state.
    //
    container.contentWindow = onerror = function onerror(err) {
      pagelet.emit('error', err);
    };

    this.container = container.contentDocument || container.contentWindow.document;
    this.container.open();
  } else {
    this.container = new ActiveXObject('htmlfile');
  }

  this.container.write('<html><s'+'cript>'+ code +'</s'+'cript></html>');
  this.container.close();

  this.emit('sandboxed', code, this.container);
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
    // @TODO wrap the client side code with some pagelet references.
    //
    code,

    '})(this, ["alert", "prompt", "confirm"]);'
  ].join('\n');
};

/**
 * Render the HTML template in to the placeholders.
 *
 * @param {String} html The HTML that needs to be added in the placeholders.
 * @returns {Boolean} Successfully rendered a pagelet.
 * @api private
 */
Pagelet.prototype.render = function render(html) {
  if (!this.placeholders.length || !html) return false;

  collection.each(this.placeholders, function (root) {
    var fragment = document.createDocumentFragment()
      , div = document.createElement('div')
      , borked = this.IEV < 7;

    if (borked) root.appendChild(div);

    div.innerHTML = html;

    while (div.firstChild) {
      fragment.appendChild(div.firstChild);
    }

    root.appendChild(fragment);
    if (borked) root.removeChild(div);
  }, this);

  this.broadcast('render', html);
  return true;
};

/**
 * Horrible hack, but needed to prevent memory leaks and other issues in Internet
 * Explorer that's caused by the use of document.createDocumentFragment()
 *
 * @type {Number}
 * @private
 */
Pagelet.prototype.IEV = document.documentMode || +(/MSIE.(\d+)/.exec(navigator.userAgent) || [])[1];

/**
 * Parse the included template from the comment node so it can be injected in to
 * the page as initial rendered view.
 *
 * @returns {String} View.
 * @api private
 */
Pagelet.prototype.parse = function parse() {
  var node = this.$('data-pagelet-fragment', this.name)[0]
    , comment;

  //
  // The firstChild of the fragment should have been a HTML comment, this is to
  // prevent the browser from rendering and parsing the template.
  //
  if (!node.firstChild || node.firstChild.nodeType !== 8) return;

  comment = node.firstChild.nodeValue;

  return comment
    .substring(1, comment.length -1)
    .replace(/\\([\s\S]|$)/g, '$1');
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
  this.pipe.free(this); // Automatically schedule this Pagelet instance for re-use.
  this.emit('destroy'); // Execute any extra destroy hooks.

  //
  // Remove all the HTML from the placeholders.
  //
  if (this.placeholders) collection.each(this.placeholders, function (root) {
    while (root.firstChild) root.removeChild(root.firstChild);
  });

  this.placeholders = null;

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

},{"./async":1,"./collection":2}]},{},[3])(3)
});
;