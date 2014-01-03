(function(e){if("function"==typeof bootstrap)bootstrap("bigpipe",e);else if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else if("undefined"!=typeof ses){if(!ses.ok())return;ses.makeBigPipe=e}else"undefined"!=typeof window?window.BigPipe=e():global.BigPipe=e()})(function(){var define,ses,bootstrap,module,exports;
return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

/**
 * Minimal EventEmitter interface that is molded against the Node.js
 * EventEmitter interface.
 *
 * @constructor
 * @api public
 */
function EventEmitter() {
  this._events = {};
}

/**
 * Return a list of assigned event listeners.
 *
 * @param {String} event The events that should be listed.
 * @returns {Array}
 * @api public
 */
EventEmitter.prototype.listeners = function listeners(event) {
  return Array.apply(this, this._events[event] || []);
};

/**
 * Emit an event to all registered event listeners.
 *
 * @param {String} event The name of the event.
 * @returns {Boolean} Indication if we've emitted an event.
 * @api public
 */
EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
  if (!this._events || !this._events[event]) return false;

  var listeners = this._events[event]
    , length = listeners.length
    , handler = listeners[0]
    , len = arguments.length
    , args
    , i;

  if (1 === length) {
    switch (len) {
      case 1:
        handler.call(this);
      break;
      case 2:
        handler.call(this, a1);
      break;
      case 3:
        handler.call(this, a1, a2);
      break;
      case 4:
        handler.call(this, a1, a2, a3);
      break;
      case 5:
        handler.call(this, a1, a2, a3, a4);
      break;
      case 6:
        handler.call(this, a1, a2, a3, a4, a5);
      break;

      default:
        for (i = 1, args = new Array(len -1); i < len; i++) {
          args[i - 1] = arguments[i];
        }

        handler.apply(this, args);
    }

    if (handler.once) this.removeListener(event, handler);
  } else {
    for (i = 1, args = new Array(len -1); i < len; i++) {
      args[i - 1] = arguments[i];
    }

    for (i = 0; i < length; i++) {
      listeners[i].apply(this, args);
      if (listeners[i].once) this.removeListener(event, handler[i]);
    }
  }

  return true;
};

/**
 * Register a new EventListener for the given event.
 *
 * @param {String} event Name of the event.
 * @param {Functon} fn Callback function.
 * @api public
 */
EventEmitter.prototype.on = function on(event, fn) {
  if (!this._events) this._events = {};
  if (!this._events[event]) this._events[event] = [];
  this._events[event].push(fn);

  return this;
};

/**
 * Add an EventListener that's only called once.
 *
 * @param {String} event Name of the event.
 * @param {Function} fn Callback function.
 * @api public
 */
EventEmitter.prototype.once = function once(event, fn) {
  fn.once = true;
  return this.on(event, fn);
};

/**
 * Remove event listeners.
 *
 * @param {String} event The event we want to remove.
 * @param {Function} fn The listener that we need to find.
 * @api public
 */
EventEmitter.prototype.removeListener = function removeListener(event, fn) {
  if (!this._events || !this._events[event]) return this;

  var listeners = this._events[event]
    , events = [];

  for (var i = 0, length = listeners.length; i < length; i++) {
    if (fn && listeners[i] !== fn && listeners[i].fn !== fn) {
      events.push(listeners[i]);
    }
  }

  //
  // Reset the array, or remove it completely if we have no more listeners.
  //
  if (events.length) this._events[event] = events;
  else this._events[event] = null;

  return this;
};

/**
 * Remove all listeners or only the listeners for the specified event.
 *
 * @param {String} event The event want to remove all listeners for.
 * @api public
 */
EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
  if (!this._events) return this;

  if (event) this._events[event] = null;
  else this._events = {};

  return this;
};

//
// Alias methods names because people roll like that.
//
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
EventEmitter.prototype.addListener = EventEmitter.prototype.on;

//
// This function doesn't apply anymore.
//
EventEmitter.prototype.setMaxListeners = function setMaxListeners() {
  return this;
};

//
// Expose the module.
//
EventEmitter.EventEmitter = EventEmitter;
EventEmitter.EventEmitter2 = EventEmitter;
EventEmitter.EventEmitter3 = EventEmitter;

try { module.exports = EventEmitter; }
catch (e) {}

},{}],2:[function(require,module,exports){
'use strict';

/**
 * Create a new pre-configured iframe.
 *
 * @TODO add support for the HTML5 sandbox attribute.
 * @param {Element} el DOM element where the iframe should be added on.
 * @param {String} id A unique name/id for the iframe.
 * @return {Object}
 * @api private
 */
function iframe(el, id) {
  var i;

  try {
    //
    // Internet Explorer 6/7 require a unique name attribute in order to work.
    // In addition to that, dynamic name attributes cannot be added using
    // `i.name` as it will just ignore it. Creating it using this oddly <iframe>
    // element fixes these issues.
    //
    i = document.createElement('<iframe name="'+ id +'">');
  } catch (e) {
    i = document.createElement('iframe');
    i.name = id;
  }

  //
  // The iframe needs to be added in to the DOM before we can modify it, make
  // sure it's remains unseen.
  //
  i.style.top = i.style.left = -10000;
  i.style.position = 'absolute';
  i.style.display = 'none';
  i.id = id;

  //
  // Insert before first child to avoid `Operation Aborted` error in IE6.
  //
  el.insertBefore(i, el.firstChild);

  return {
    document: i.contentDocument || i.contentWindow.document,
    window: i.contentWindow || i.contentDocument,
    frame: i
  };
}

/**
 * Representation of a single container.
 *
 * @constructor
 * @param {Element} mount The element we should attach to.
 * @param {String} id A unique id for this container.
 * @param {String} code The actual that needs to run within the sandbox.
 * @api private
 */
function Container(mount, id, code) {
  this.created = new Date();      // Creation date.
  this.mount = mount;             // Mount point of the container.
  this.id = id;                   // Unique id
  this.i = iframe(mount, id);     // The generated iframe.

  //
  // Optional code to load in the container and start it directly
  //
  if (code) {
    this.image = new Image(code);
    this.start();
  }
}

/**
 * Start the container.
 *
 * @returns {Container}
 * @api private
 */
Container.prototype.start = function start() {
  //
  // If the container is already in the HTML we're going to assume that we still
  // have to load it with the Image. But if it's not in the mount point (DOM) we
  // assume that the iframe has been removed to release memory and what ever,
  // but when we re-add it to the mount point, it will automatically restart the
  // JavaScript that was originally loaded in the container.
  //
  if (!this.mount.getElementById(this.id)) {
    this.mount.appendChild(this.i.frame);
  } else {
    var doc = this.i.document;

    doc.open();
    doc.write('<html><s'+'cript>'+ this.image +'</s'+'cript></html>');
    doc.close();
  }

  return this;
};

/**
 * Stop running the code inside the container.
 *
 * @returns {Container}
 * @api private
 */
Container.prototype.stop = function stop() {
  if (!this.mount.getElementById(this.id)) return this;

  this.mount.removeChild(this.i.frame);
  return this;
};

/**
 * Load the given code as image on to the container.
 *
 * @param {String} code The code that should run on the container.
 * @returns {Container}
 * @api public
 */
Container.prototype.load = function load(code) {
  this.image = new Image(code);

  return this;
};

/**
 * Completely destroy the given container and ensure that all references are
 * nuked so we can clean up as much memory as possible.
 *
 * @returns {Container}
 * @api private
 */
Container.prototype.destroy = function destroy() {
  this.stop();

  //
  // Remove all possible references.
  //
  this.mount = this.image = this.id = this.i = this.created = null;

  return this;
};

/**
 * The Image that is loaded on to the container.
 *
 * @constructor
 * @param {String} source The actual code.
 * @api private
 */
function Image(source) {
  this.original = source;
  this.source = source;
}

/**
 * As we are running the code in a sandboxed iframe we need to make sure that
 * UI blocking code is removed or patched correctly. In addition to that we need
 * to make sure that the iframe points to the same domain as our host page in
 * order cross origin based requests to work correctly.
 *
 * @api private
 */
Image.prototype.patch = function patch() {
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
    '})(this, ["alert", "prompt", "confirm"]);'
  ].join('\n');
};

/**
 * Override the build-in console.log so we can transport the logging messages to
 * the actual page.
 *
 * @api private
 */
Image.prototype.console = function console() {
  return;
};

/**
 * Limit the access scope of local storage. We are sharing the browser with
 * a couple of other scripts and we don't want them to access our local storage
 * and session storage.
 *
 * @param {Number} size The total storage this has.
 * @api private
 */
Image.prototype.storage = function storage(size) {

};

/**
 * Return the actual contents as the image is concatenated with some other
 * strings.
 *
 * @return {String}
 * @api private
 */
Image.prototype.toString = function toString() {
  return this.source;
};

/**
 * Fortress: Container and Image management for front-end code.
 *
 * @constructor
 * @param {Object} options Fortress configuration
 * @api private
 */
function Fortress(options) {
  options = options || {};

  var scripts = document.getElementsByTagName('script');

  this.global = (function () { return this; })() || window;
  this.mount = scripts[scripts.length - 1] || document.body;
  this.containers = {};

  scripts = null;
}

Fortress.prototype.htmlfile = false;

try { Fortress.prototype.htmlfile = !!new ActiveXObject('htmlfile'); }
catch (e) {}

/**
 * Detect the current globals that are loaded in to this page. This way we can
 * see if we are leaking data.
 *
 * @returns {Array} Names of the leaked globals.
 * @api private
 */
Fortress.prototype.globals = function globals() {
  var i = iframe(this.mount, Date.now())
    , global = this.global;

  this.mount.removeChild(i.frame);

  //
  // Detect the globals and return them.
  //
  return Object.keys(global).filter(function filter(key) {
    return !(key in i.window);
  });
};

/**
 * List all active containers.
 *
 * @returns {Array} Active containers.
 * @api public
 */
Fortress.prototype.all = function all() {
  var everything = [];

  for (var id in this.containers) {
    everything.push(this.containers[id]);
  }

  return everything;
};

/**
 * Generate an unique, unknown id that we can use for our container storage.
 *
 * @returns {String}
 * @api private
 */
Fortress.prototype.id = function id() {
  for (var i = 0, generated = []; i < 4; i++) {
    generated.push(Math.random().toString(36).substring(2));
  }

  generated = generated.join('_');

  //
  // Ensure that we didn't generate a pre-existing id, if we did, generate
  // another id.
  //
  if (generated in this.containers) return id();
  return generated;
};

/**
 * Create a new container.
 *
 * @param {String} code
 * @returns {Container}
 * @api public
 */
Fortress.prototype.create = function create(code) {
  var container = new Container(this.mount, this.id(), code);
  this.containers[container.id] = container;

  return container;
};

/**
 * Inspect a running Container in order to get more detailed information about
 * the process.
 *
 * @param {String} id The container id.
 * @returns {Container}
 * @api public
 */
Fortress.prototype.get = function get(id) {
  return this.containers[id];
};

/**
 * Inspect a running Container in order to get more detailed information about
 * the process. In recent browsers we can access:
 *
 * - console.memory(), performance.memory
 *
 * @param {String} id The container id.
 * @api public
 */
Fortress.prototype.inspect = function inspect(id) {
  return this;
};

/**
 * Start the container with the given id.
 *
 * @param {String} id The container id.
 * @api public
 */
Fortress.prototype.start = function start(id) {
  var container = this.get(id);
  if (!container) return this;

  container.start();
  return this;
};

/**
 * Stop a running container, this does not fully destroy the container. It
 * merely stops it from running. Stopping an container will cause the container
 * to start from the beginning again once it's started. This is not a pause
 * function.
 *
 * @param {String} id The container id.
 * @api public
 */
Fortress.prototype.stop = function stop(id) {
  var container = this.get(id);
  if (!container) return this;

  container.stop();
  return this;
};

/**
 * Restart a container. Basically, just a start and stop.
 *
 * @param {String} id The container id.
 * @api public
 */
Fortress.prototype.restart = function restart(id) {
  var container = this.get(id);
  if (!container) return this;

  container.stop().start();

  return this;
};

/**
 * Completely remove and shutdown the given container id.
 *
 * @param {String} id The container id.
 * @api public
 */
Fortress.prototype.kill = function kill(id) {
  var container = this.get(id);
  if (!container) return this;

  container.destroy();
  delete this.containers[id];

  return this;
};

/**
 * Start streaming logging information and cached logs.
 *
 * @param {String} id
 * @api public
 */
Fortress.prototype.attach = function attach(id) {
  return this;
};

},{}],3:[function(require,module,exports){
'use strict';

var collection = require('./collection');

//
// Pointless function that will replace callbacks once they are executed to
// prevent double execution from ever happening.
//
function noop() { /* you waste your time by reading this, see, i told you.. */ }

/**
 * Asynchronously iterate over the given data.
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

},{"./collection":4}],4:[function(require,module,exports){
'use strict';

/**
 * Get an accurate type check for the given Object.
 *
 * @param {Mixed} obj The object that needs to be detected.
 * @returns {String} The object type.
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
 * Determine the size of a collection.
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
 * Wrap the given object in an array if it's not an array already.
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

},{}],5:[function(require,module,exports){
/*globals Primus */
'use strict';

var EventEmitter = require('eventemitter3')
  , collection = require('./collection')
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
  this.url = location.pathname;         // The current URL.
  this.assets = {};                     // Asset cache.
  this.root = document.documentElement; // The <html> element.

  EventEmitter.call(this);

  this.configure(options);
  this.connect(server, options.primus);
}

//
// Inherit from EventEmitter3.
//
Pipe.prototype = new EventEmitter();
Pipe.prototype.constructor = Pipe;

/**
 * Configure the Pipe.
 *
 * @api private
 */
Pipe.prototype.configure = function configure(options) {
  var root = this.root;

  if (root.className.indexOf('no_js')) {
    root.className = root.className.replace('no_js', '');
  }

  //
  // Catch all form submits.
  //
  root.addEventListener('submit', this.submit.bind(this), false);
};

/**
 * Horrible hack, but needed to prevent memory leaks while maintaining sublime
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
 * Catch all form submits and add reference to originating pagelet.
 *
 * @param {Event} event
 * @api public
 */
Pipe.prototype.submit = function submit(event) {
  var src = event.target || event.srcElement
    , form = src
    , action
    , name;

  event.preventDefault();
  while (src.parentNode) {
    src = src.parentNode;
    if ('getAttribute' in src) name = src.getAttribute('data-pagelet');
    if (name) break;
  }

  if (this.has(name)) {
    action = form.getAttribute('action');
    form.setAttribute('action', [
      action,
      ~action.indexOf('?') ? '&' : '?',
      '_pagelet=',
      name
    ].join(''));
  }

  form.submit();
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
 * Broadcast an event to all connected pagelets.
 *
 * @param {String} event The event that needs to be broadcasted.
 * @api private
 */
Pipe.prototype.broadcast = function broadcast(event) {
  for (var pagelet in this.pagelets) {
    this.pagelets[pagelet].emit.apply(this.pagelets[pagelet], arguments);
  }
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
 * @param {Object} options The Primus configuration.
 * @api private
 */
Pipe.prototype.connect = function connect(url, options) {
  this.stream = new Primus(url, options);
  var orchestrator = this.orchestrate = this.stream.substream('pipe::orchestrate');
};

//
// Expose the pipe
//
module.exports = Pipe;

},{"./collection":4,"./loader":6,"./pagelet":7,"eventemitter3":1}],6:[function(require,module,exports){
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
      // We assume that the CSS set the height property for the given id selector.
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
 * #pagelet_af3f399qu { height: 42px }
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
  if ('js' !== url.split('.').pop()) {
    return loadStyleSheet(root, url, fn);
  }

  loadJavaScript(root, url, fn);
};

/**
 * Unload a new resource.
 *
 * @param {String} url The location of the asset.
 * @api public
 */
exports.unload = function unload(url) {
  if ('js' !== url.split('.').pop()) {
    return unloadStyleSheet(url);
  }

  unloadJavaScript(url);
};

},{"./collection":4}],7:[function(require,module,exports){
/*globals */
'use strict';

var EventEmitter = require('eventemitter3')
  , collection = require('./collection')
  , Fortress = require('fortress')
  , async = require('./async');

//
// Create one single Fortress instance that orchestrates all iframe based client
// code. This sandbox variable should never be exposed to the outside world in
// order to prevent leaking
//
var sandbox = new Fortress();

/**
 * Representation of a single pagelet.
 *
 * @constructor
 * @param {Pipe} pipe The pipe.
 * @api public
 */
function Pagelet(pipe) {
  EventEmitter.call(this);

  this.orchestrate = pipe.orchestrate;
  this.stream = pipe.stream;
  this.pipe = pipe;
}

//
// Inherit from EventEmitter.
//
Pagelet.prototype = new EventEmitter();
Pagelet.prototype.constructor = Pagelet;

/**
 * Configure the Pagelet.
 *
 * @param {String} name The given name of the pagelet.
 * @param {Object} data The data of the pagelet.
 * @api private
 */
Pagelet.prototype.configure = function configure(name, data) {
  var pagelet = this;

  this.placeholders = this.$('data-pagelet', name);

  //
  // Pagelet identification.
  //
  this.id = data.id;
  this.name = name;

  //
  // Create a real-time Substream over which we can communicate over without.
  //
  this.substream = this.stream.substream('pagelet::'+ this.name);
  this.substream.on('data', function data(packet) { pagelet.processor(packet); });
  this.orchestrate.write({
    type: 'configure', id: data.id,
    name: name, url: this.pipe.url
  });

  this.css = collection.array(data.css);    // CSS for the Page.
  this.js = collection.array(data.js);      // Dependencies for the page.
  this.run = data.run;                      // Pagelet client code.
  this.rpc = data.rpc;                      // Pagelet RPC methods.
  this.data = data.data;                    // All the template data.
  this.container = sandbox.create();        // Create an application sandbox.

  //
  // Generate the RPC methods that we're given by the server. We will make the
  // assumption that:
  //
  // - A callback function is always given as last argument.
  // - The function should return it self in order to chain.
  // - The function given supports and uses error first callback styles.
  // - Does not override the build-in prototypes of the Pagelet.
  //
  collection.each(this.rpc, function rpc(method) {
    var pagelet = this
      , counter = 0;

    //
    // Never override build-in methods as this WILL affect the way a Pagelet is
    // working.
    //
    if (method in Pagelet.prototype) return;

    this[method] = function rpcfactory() {
      var args = Array.prototype.slice.call(arguments, 0)
        , id = method +'#'+ (++counter);

      pagelet.once('rpc::'+ id, args.pop());
      pagelet.substream.write({
        method: method,
        type: 'rpc',
        args: args,
        id: id
      });

      return pagelet;
    };
  }, this);

  //
  // Should be called before we create `rpc` hooks.
  //
  this.broadcast('configured', data);

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
 * Process the incoming messages from our SubStream.
 *
 * @param {Object} packet The decoded message.
 * @api private
 */
Pagelet.prototype.processor = function processor(packet) {
  switch (packet.type) {
    case 'rpc':
      this.emit.apply(this, ['rpc::'+ packet.id].concat(packet.args || []));
    break;

    case 'event':
      if (packet.args && packet.args.length) {
        this.emit.apply(this, packet.args);
      }
    break;
  }
};

/**
 * The pagelet's resource has all been loaded.
 *
 * @api private
 */
Pagelet.prototype.initialise = function initialise() {
  this.broadcast('initialise', this);

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
    return Array.prototype.slice.call(
        document.querySelectorAll('['+ attribute +'="'+ value +'"]')
      , 0
    );
  }

  //
  // No querySelectorAll support, so we're going to do a full DOM scan.
  //
  var all = document.getElementsByTagName('*')
    , length = all.length
    , results = []
    , i = 0;

  for (; i < length; i++) {
    if (value === all[i].getAttribute(attribute)) {
      results.push(all[i]);
    }
  }

  return results;
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

  //
  // Remove the added RPC handlers, make sure we don't delete prototypes.
  //
  collection.each(this.rpc, function nuke(method) {
    if (method in Pagelet.prototype) return;

    delete this[method];
  }, this);

  //
  // Remove the sandboxing
  //
  sandbox.kill(this.container.id);
  this.container = null;
};

//
// Expose the module.
//
module.exports = Pagelet;

},{"./async":3,"./collection":4,"eventemitter3":1,"fortress":2}]},{},[5])
(5)
});
;