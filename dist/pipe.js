(function(e){if("function"==typeof bootstrap)bootstrap("bigpipe",e);else if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else if("undefined"!=typeof ses){if(!ses.ok())return;ses.makeBigPipe=e}else"undefined"!=typeof window?window.BigPipe=e():global.BigPipe=e()})(function(){var define,ses,bootstrap,module,exports;
return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

// not implemented
// The reason for having an empty file and not throwing is to allow
// untraditional implementation of this module.

},{}],2:[function(require,module,exports){
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

},{}],3:[function(require,module,exports){
'use strict';

var Container = require('containerization')
  , EventEmitter = require('eventemitter3')
  , iframe = require('frames');

/**
 * Fortress: Container and Image management for front-end code.
 *
 * @constructor
 * @param {Object} options Fortress configuration
 * @api private
 */
function Fortress(options) {
  if (!(this instanceof Fortress)) return new Fortress(options);
  options = options || {};

  //
  // Create a small dedicated container that houses all our iframes. This might
  // add an extra DOM node to the page in addition to each iframe but it will
  // ultimately result in a cleaner DOM as everything is nicely tucked away.
  //
  var scripts = document.getElementsByTagName('script')
    , append = scripts[scripts.length - 1] || document.body
    , div = document.createElement('div');

  append.parentNode.insertBefore(div, append);

  this.global = (function global() { return this; })() || window;
  this.containers = {};
  this.mount = div;

  scripts = null;

  EventEmitter.call(this);
}

//
// Fortress inherits from EventEmitter3.
//
Fortress.prototype = new EventEmitter();
Fortress.prototype.constructor = Fortress;

/**
 * Detect the current globals that are loaded in to this page. This way we can
 * see if we are leaking data.
 *
 * @param {Array} old Optional array with previous or known leaks.
 * @returns {Array} Names of the leaked globals.
 * @api private
 */
Fortress.prototype.globals = function globals(old) {
  var i = iframe(this.mount, 'iframe_'+ (+new Date()))
    , windoh = i.add().window()
    , global = this.global
    , result = [];

  i.remove();

  //
  // Detect the globals and return them.
  //
  for (var key in global) {
    var introduced = !(key in windoh);

    //
    // We've been given an array, so we should use that as the source of previous
    // and acknowledged leaks and only return an array that contains newly
    // introduced leaks.
    //
    if (introduced) {
      if (old && old.length && !!~old.indexOf(key)) continue;

      result.push(key);
    }
  }

  return result;
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

  generated = 'fortress_'+ generated.join('_');

  //
  // Ensure that we didn't generate a pre-existing id, if we did, generate
  // another id.
  //
  if (generated in this.containers) return this.id();
  return generated;
};

/**
 * Create a new container.
 *
 * @param {String} code
 * @param {Object} options Options for the container
 * @returns {Container}
 * @api public
 */
Fortress.prototype.create = function create(code, options) {
  var container = new Container(this.mount, this.id(), code, options);
  this.containers[container.id] = container;

  return container;
};

/**
 * Get a container based on it's unique id.
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
 * the process and the state of the container.
 *
 * @param {String} id The container id.
 * @api public
 */
Fortress.prototype.inspect = Fortress.prototype.top = function inspect(id) {
  var container = this.get(id);
  if (!container) return {};

  return container.inspect();
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
 * @param {String} id The container id.
 * @param {String} method The log method name.
 * @param {Function} fn The function that needs to be called for each stream.
 * @api public
 */
Fortress.prototype.attach = function attach(id, method, fn) {
  var container = this.get(id);
  if (!container) return this;

  if ('function' === typeof method) {
    fn = method;
    method = 'attach';
  } else {
    method += 'attach::'+ method;
  }

  container.on(method, fn);

  return this;
};

/**
 * Stop streaming logging information and cached logs.
 *
 * @param {String} id The container id.
 * @param {String} method The log method name.
 * @param {Function} fn The function that needs to be called for each stream.
 * @api public
 */
Fortress.prototype.detach = function detach(id, method, fn) {
  var container = this.get(id);
  if (!container) return this;

  if ('function' === typeof method) {
    fn = method;
    method = 'attach';
  } else {
    method += 'attach::'+ method;
  }

  if (!fn) container.removeAllListeners(method);
  else container.on(method, fn);

  return this;
};

/**
 * Destroy all active containers and clean up all references. We expect no more
 * further calls to this Fortress instance.
 *
 * @api public
 */
Fortress.prototype.destroy = function destroy() {
  for (var id in this.containers) {
    this.kill(id);
  }

  this.mount.parentNode.removeChild(this.mount);
  this.global = this.mount = this.containers = null;
};

/**
 * Prepare a file or function to be loaded in to a Fortress based Container.
 * When the transfer boolean is set we assume that you want to load pass the
 * result of to a function or assign it a variable from the server to the client
 * side:
 *
 * ```
 * <script>
 * var code = <%- Fortress.stringify(code, true) %>
 * </script>
 * ```
 *
 * @param {String|Function} code The code that needs to be transformed.
 * @param {Boolean} transfer Prepare the code for transfer.
 * @returns {String}
 * @api public
 */
Fortress.stringify = function stringify(code, transfer) {
  if ('function' === typeof code) {
    //
    // We've been given a pure function, so we need to wrap it a little bit
    // after we've done a `toString` for the source retrieval so the function
    // will automatically execute when it's activated.
    //
    code = '('+ code.toString() +'())';
  } else {
    //
    // We've been given a string, so we're going to assume that it's path to file
    // that should be included instead.
    //
    code = require('fs').readFileSync(code, 'utf-8');
  }

  return transfer ? JSON.stringify(code) : code;
};

//
// Expose the module.
//
module.exports = Fortress;

},{"containerization":4,"eventemitter3":2,"frames":6,"fs":1}],4:[function(require,module,exports){
'use strict';

var EventEmitter = require('eventemitter3')
  , BaseImage = require('alcatraz')
  , slice = Array.prototype.slice
  , iframe = require('frames');

/**
 * Representation of a single container.
 *
 * Options:
 *
 * - retries; When an error occurs, how many times should we attempt to restart
 *   the code before we automatically stop() the container.
 * - stop; Stop the container when an error occurs.
 * - timeout; How long can a ping packet timeout before we assume that the
 *   container has died and should be restarted.
 *
 * @constructor
 * @param {Element} mount The element we should attach to.
 * @param {String} id A unique id for this container.
 * @param {String} code The actual that needs to run within the sandbox.
 * @param {Object} options Container configuration.
 * @api private
 */
function Container(mount, id, code, options) {
  if (!(this instanceof Container)) return new Container(mount, id, code, options);

  if ('object' === typeof code) {
    options = code;
    code = null;
  }

  options = options || {};

  this.i = iframe(mount, id);         // The generated iframe.
  this.mount = mount;                 // Mount point of the container.
  this.console = [];                  // Historic console.* output.
  this.setTimeout = {};               // Stores our setTimeout references.
  this.id = id;                       // Unique id.
  this.readyState = Container.CLOSED; // The readyState of the container.

  this.created = +new Date();         // Creation EPOCH.
  this.started = null;                // Start EPOCH.

  this.retries = 'retries' in options // How many times should we reload
    ? +options.retries || 3
    : 3;

  this.timeout = 'timeout' in options // Ping timeout before we reboot.
    ? +options.timeout || 1050
    : 1050;

  //
  // Initialise as an EventEmitter before we start loading in the code.
  //
  EventEmitter.call(this);

  //
  // Optional code to load in the container and start it directly.
  //
  if (code) this.load(code).start();
}

//
// The container inherits from the EventEmitter3.
//
Container.prototype = new EventEmitter();
Container.prototype.constructor = Container;

/**
 * Internal readyStates for the container.
 *
 * @type {Number}
 * @private
 */
Container.CLOSING = 1;
Container.OPENING = 2;
Container.CLOSED  = 3;
Container.OPEN    = 4;

/**
 * Start a new ping timeout.
 *
 * @api private
 */
Container.prototype.ping = function ping() {
  if (this.setTimeout.pong) clearTimeout(this.setTimeout.pong);

  var self = this;
  this.setTimeout.pong = setTimeout(function pong() {
    self.onmessage({
      type: 'error',
      scope: 'iframe.timeout',
      args: [
        'the iframe is no longer responding with ping packets'
      ]
    });
  }, this.timeout);

  return this;
};

/**
 * Retry loading the code in the iframe. The container will be restored to a new
 * state or completely reset the iframe.
 *
 * @api private
 */
Container.prototype.retry = function retry() {
  switch (this.retries) {
    //
    // This is our last attempt, we've tried to have the iframe restart the code
    // it self, so for our last attempt we're going to completely create a new
    // iframe and re-compile the code for it.
    //
    case 1:
      this.stop(); // Clear old iframe and nuke it's references
      this.i = iframe(this.mount, this.id);
      this.load(this.image.source).start();
    break;

    //
    // No more attempts left.
    //
    case 0:
      this.stop();
      this.emit('end');
    return;

    //
    // By starting and stopping (and there for removing and adding it back to
    // the DOM) the iframe will reload it's HTML and the added code.
    //
    default:
      this.stop().start();
    break;
  }

  this.emit('retry', this.retries);
  this.retries--;

  return this;
};

/**
 * Inspect the container to get some useful statistics about it and it's health.
 *
 * @returns {Object}
 * @api public
 */
Container.prototype.inspect = function inspect() {
  if (!this.i.attached()) return {};

  var date = new Date()
    , memory;

  //
  // Try to read out the `performance` information from the iframe.
  //
  if (this.i.window() && this.i.window().performance) {
    memory = this.i.window().performance.memory;
  }

  memory = memory || {};

  return {
    readyState: this.readyState,
    retries: this.retries,
    uptime: this.started ? (+date) - this.started : 0,
    date: date,
    memory: {
      limit: memory.jsHeapSizeLimit || 0,
      total: memory.totalJSHeapSize || 0,
      used: memory.usedJSHeapSize || 0
    }
  };
};


/**
 * Parse and process incoming messages from the iframe. The incoming messages
 * should be objects that have a `type` property. The main reason why we have
 * this as a separate method is to give us flexibility. We are leveraging iframes
 * at the moment, but in the future we might want to leverage WebWorkers for the
 * sand boxing of JavaScript.
 *
 * @param {Object} packet The incoming message.
 * @returns {Boolean} Message was handled y/n.
 * @api private
 */
Container.prototype.onmessage = function onmessage(packet) {
  if ('object' !== typeof packet) return false;
  if (!('type' in packet)) return false;

  packet.args = packet.args || [];

  switch (packet.type) {
    //
    // The code in the iframe used the `console` method.
    //
    case 'console':
      this.console.push({
        scope: packet.scope,
        epoch: +new Date(),
        args: packet.args
      });

      if (packet.attach) {
        this.emit.apply(this, ['attach::'+ packet.scope].concat(packet.args));
        this.emit.apply(this, ['attach', packet.scope].concat(packet.args));
      }
    break;

    //
    // An error happened in the iframe, process it.
    //
    case 'error':
      var failure = packet.args[0].stack ? packet.args[0] : new Error(packet.args[0]);
      failure.scope = packet.scope || 'generic';

      this.emit('error', failure);
      this.retry();
    break;

    //
    // The iframe and it's code has been loaded.
    //
    case 'load':
      if (this.readyState !== Container.OPEN) {
        this.readyState = Container.OPEN;
        this.emit('start');
      }
    break;

    //
    // The iframe is unloading, attaching
    //
    case 'unload':
      if (this.readyState !== Container.CLOSED) {
        this.readyState = Container.CLOSED;
        this.emit('stop');
      }
    break;

    //
    // We've received a ping response from the iframe, so we know it's still
    // running as intended.
    //
    case 'ping':
      this.ping();
      this.emit('ping');
    break;

    //
    // Handle unknown package types by just returning false after we've emitted
    // it as an `regular` message.
    //
    default:
      this.emit.apply(this, ['message'].concat(packet.args));
    return false;
  }

  return true;
};

/**
 * Small wrapper around sandbox evaluation.
 *
 * @param {String} cmd The command to executed in the iframe.
 * @param {Function} fn Callback
 * @api public
 */
Container.prototype.eval = function evil(cmd, fn) {
  var data;

  try {
    data = this.i.add().window().eval(cmd);
  } catch (e) {
    return fn(e);
  }

  return fn(undefined, data);
};

/**
 * Start the container.
 *
 * @returns {Container}
 * @api public
 */
Container.prototype.start = function start() {
  this.readyState = Container.OPENING;

  var self = this;

  /**
   * Simple argument proxy.
   *
   * @api private
   */
  function onmessage() {
    self.onmessage.apply(self, arguments);
  }

  //
  // Code loading is an sync process, but this COULD cause huge stack traces
  // and really odd feedback loops in the stack trace. So we deliberately want
  // to destroy the stack trace here.
  //
  this.setTimeout.start = setTimeout(function async() {
    var doc = self.i.document();

    //
    // No doc.open, the iframe has already been destroyed!
    //
    if (!doc.open || !self.i) return;

    //
    // We need to open and close the iframe in order for it to trigger an onload
    // event. Certain scripts might require in order to execute properly.
    //
    doc.open();
    doc.write('<!doctype html>'); // Smallest, valid HTML5 document possible.

    //
    // Introduce our messaging variable, this needs to be done before we eval
    // our code. If we set this value before the setTimeout, it doesn't work in
    // Opera due to reasons.
    //
    self.i.window()[self.id] = onmessage;
    self.eval(self.image.toString(), function evil(err) {
      if (err) return self.onmessage({
        type: 'error',
        scope: 'iframe.eval',
        args: [ err ]
      });
    });

    //
    // If executing the code results to an error we could actually be stopping
    // and removing the iframe from the source before we're able to close it.
    // This is because executing the code inside the iframe is actually an sync
    // operation.
    //
    if (doc.close) doc.close();
  }, 0);

  //
  // We can only write to the iframe if it's actually in the DOM. The `i.add()`
  // method ensures that the iframe is added to the DOM.
  //
  this.i.add();
  this.started = +new Date();

  return this;
};

/**
 * Stop running the code inside the container.
 *
 * @returns {Container}
 * @api private
 */
Container.prototype.stop = function stop() {
  if (this.readyState !== Container.CLOSED && this.readyState !== Container.CLOSING) {
    this.readyState = Container.CLOSING;
  }

  this.i.remove();

  //
  // Opera doesn't support unload events. So adding an listener inside the
  // iframe for `unload` doesn't work. This is the only way around it.
  //
  this.onmessage({ type: 'unload' });

  //
  // It's super important that this removed AFTER we've cleaned up all other
  // references as we might need to communicate back to our container when we
  // are unloading or when an `unload` event causes an error.
  //
  this.i.window()[this.id] = null;

  //
  // Clear the timeouts.
  //
  for (var timeout in this.setTimeout) {
    clearTimeout(this.setTimeout[timeout]);
    delete this.setTimeout[timeout];
  }

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
  this.image = new BaseImage(this.id, code);

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
  if (!this.i) return this;
  this.stop();

  //
  // Remove all possible references to release as much memory as possible.
  //
  this.mount = this.image = this.id = this.i = this.created = null;
  this.console.length = 0;

  this.removeAllListeners();

  return this;
};

//
// Expose the module.
//
module.exports = Container;

},{"alcatraz":5,"eventemitter3":2,"frames":6}],5:[function(require,module,exports){
'use strict';

/**
 * Alcatraz is our source code sandboxing.
 *
 * @constructor
 * @param {String} id The of the method that is exposed as global.
 * @param {String} source The actual code.
 * @api private
 */
function Alcatraz(id, source) {
  if (!(this instanceof Alcatraz)) return new Alcatraz(id, source);

  this.compiled = null;
  this.source = source;
  this.id = id;
}

/**
 * Assume that the source of the Alcatraz is loaded using toString() so it will be
 * automatically transformed when the Alcatraz instance is concatenated or added to
 * the DOM.
 *
 * @returns {String}
 * @api public
 */
Alcatraz.prototype.toString = function toString() {
  if (this.compiled) return this.compiled;
  return this.compiled = this.transform();
};

/**
 * Apply source code transformations to the code so it can work inside an
 * iframe.
 *
 * @TODO allow custom code transformations.
 * @returns {String}
 * @api private
 */
Alcatraz.prototype.transform = function transform() {
  var code = ('('+ (function fort(global) {
    //
    // When you toString a function which is created while in strict mode,
    // firefox will add "use strict"; to the body of the function. Chrome leaves
    // the source intact. Knowing this, we cannot blindly assume that we can
    // inject code after the first opening bracked `{`.
    //
    this.fort();

    /**
     * Simple helper function to do nothing.
     *
     * @type {Function}
     * @api private
     */
    function noop() { /* I do nothing useful */ }

    /**
     * AddListener polyfill
     *
     * @param {Mixed} thing What ever we want to listen on.
     * @param {String} evt The event we're listening for.
     * @param {Function} fn The function that gets executed.
     * @api private
     */
    function on(thing, evt, fn) {
      if (thing.attachEvent) {
        thing.attachEvent('on'+ evt, fn);
      } else if (thing.addEventListener) {
        thing.addEventListener(evt, fn, false);
      }

      return { on: on };
    }

    //
    // Force the same domain as our 'root' script.
    //
    try { document.domain = '_fortress_domain_'; }
    catch (e) { /* FireFox 26 throws an Security error for this as we use eval */ }

    //
    // Prevent common iframe detection scripts that do frame busting.
    //
    try { global.top = global.self = global.parent = global; }
    catch (e) { /* Damn, read-only */ }

    //
    // Add a error listener. Adding it on the iframe it self doesn't make it
    // bubble up to the container. So in order to capture errors and notifying
    // the container we need to add a `window.onerror` listener inside the
    // iframe it self.
    // @TODO add proper stack trace tool here?
    //
    global.onerror = function onerror() {
      var a = Array.prototype.slice.call(arguments, 0);
      this._fortress_id_({ type: 'error', scope: 'window.onerror', args: a });
      return true;
    };

    //
    // Eliminate the browsers blocking dialogs, we're in a iframe not a browser.
    //
    var blocking = ['alert', 'prompt', 'confirm', 'print', 'open'];
    for (var i = 0; i < blocking.length; i++) {
      try { global[blocking[i]] = noop; }
      catch (e) {}
    }

    //
    // Override the build-in console.log so we can transport the logging messages to
    // the actual page.
    //
    // @see https://github.com/DeveloperToolsWG/console-object/blob/master/api.md
    // for the minimum supported console.* methods.
    //
    var methods = [
        'debug', 'error', 'info', 'log', 'warn', 'dir', 'dirxml', 'table', 'trace'
      , 'assert', 'count', 'markTimeline', 'profile', 'profileEnd', 'time'
      , 'timeEnd', 'timeStamp', 'timeline', 'timelineEnd', 'group'
      , 'groupCollapsed', 'groupEnd', 'clear', 'select', 'exception'
      , 'isIndependentlyComposed'
    ], fconsole = typeof console !== 'undefined' ? console : {};
    global.console = {};

    /**
     * Helper method to polyfill our global console method so we can proxy it's
     * usage to the
     *
     * @param {String} method The console method we want to polyfill.
     * @api private
     */
    function polyconsole(method) {
      var attach = { debug: 1, error: 1, log: 1, warn: 1 };

      //
      // Ensure that this host environment always has working console.
      //
      global.console[method] = function polyfilled() {
        var args = Array.prototype.slice.call(arguments, 0);

        //
        // If the host supports this given method natively, execute it.
        //
        if (method in fconsole) fconsole[method].apply(fconsole, args);

        //
        // Proxy messages to the container.
        //
        this._fortress_id_({
          attach: method in attach,
          type: 'console',
          scope: method,
          args: args
        });
      };
    }

    for (i = 0; i < methods.length; i++) {
      polyconsole(methods[i]);
    }

    //
    // The setInterval allows us to detect if the iframe is still running of if
    // it has crashed or maybe it's just freezing up. We will be missing pings
    // or get extremely slow responses. Browsers will kill long running scripts
    // after 5 seconds of freezing:
    //
    // http://www.nczonline.net/blog/2009/01/05/what-determines-that-a-script-is-long-running/
    //
    setInterval(function ping() {
      this._fortress_id_({ type: 'ping' });
    }, 1000);

    //
    // Add load listeners so we know when the iframe is alive and working.
    //
    on(global, 'load', function () {
      this._fortress_id_({ type: 'load' });
    });

    //
    // Ideally we load this code after our `load` event so we know that our own
    // bootstrapping has been loaded completely. But the problem is that we
    // actually cause full browser crashes in chrome when we execute this.
    //
    var self = this;
    setTimeout(function timeout() {
      try { self.fort(); }
      catch (e) {
        this._fortress_id_({ type: 'error', scope: 'iframe.start', args: [e] });
      }
    }, 0);
  })+').call({}, this)');

  //
  // Replace our "template tags" with the actual content.
  //
  return code
    .replace(/_fortress_domain_/g, document.domain)
    .replace(/this\._fortress_id_/g, this.id)
    .replace(/this\.fort\(\);/g, 'this.fort=function fort() {'+ this.source +'};');
};

//
// Expose module.
//
module.exports = Alcatraz;

},{}],6:[function(require,module,exports){
'use strict';

/**
 * Create a new pre-configured iframe.
 *
 * Options:
 *
 * visible: (boolean) Don't hide the iframe by default.
 * sandbox: (array) Sandbox properties.
 *
 * @param {Element} el DOM element where the iframe should be added on.
 * @param {String} id A unique name/id for the iframe.
 * @param {String} options Options.
 * @return {Object}
 * @api private
 */
module.exports = function iframe(el, id, options) {
  var i;

  options = options || {};
  options.sandbox = options.sandbox || [
    'allow-pointer-lock',
    'allow-same-origin',
    'allow-scripts',
    'allow-popups',
    'allow-forms'
  ];

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
  if (!options.visible) {
    i.style.top = i.style.left = -10000;
    i.style.position = 'absolute';
    i.style.display = 'none';
  }

  i.setAttribute('frameBorder', 0);

  if (options.sandbox.length) {
    i.setAttribute('sandbox', (options.sandbox).join(' '));
  }

  i.id = id;

  return {
    /**
     * Return the document which we can use to inject or modify the HTML.
     *
     * @returns {Document}
     * @api public
     */
    document: function doc() {
      return this.window().document;
    },

    /**
     * Return the global or the window from the iframe.
     *
     * @returns {Window}
     * @api public
     */
    window: function win() {
      return i.contentWindow || (i.contentDocument
        ? i.contentDocument.parentWindow || {}
        : {}
      );
    },

    /**
     * Add the iframe to the DOM, use insertBefore first child to avoid
     * `Operation Aborted` error in IE6.
     *
     * @api public
     */
    add: function add() {
      if (!this.attached()) {
        el.insertBefore(i, el.firstChild);
      }

      return this;
    },

    /**
     * Remove the iframe from the DOM.
     *
     * @api public
     */
    remove: function remove() {
      if (this.attached()) {
        el.removeChild(i);
      }

      return this;
    },

    /**
     * Checks if the iframe is currently attached to the DOM.
     *
     * @returns {Boolean} The container is attached to the mount point.
     * @api private
     */
    attached: function attached() {
      return !!document.getElementById(id);
    },

    /**
     * Reference to the iframe element.
     *
     * @type {HTMLIFRAMEElement}
     * @public
     */
    frame: i
  };
};

},{}],7:[function(require,module,exports){
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

},{"./collection":8}],8:[function(require,module,exports){
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

},{}],9:[function(require,module,exports){
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
  this.id = options.id;                 // Unique ID of the page.

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
  root.addEventListener('submit', this.submit, false);
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

  while (src.parentNode) {
    src = src.parentNode;
    if ('getAttribute' in src) name = src.getAttribute('data-pagelet');
    if (name) break;
  }

  if (name) {
    action = form.getAttribute('action');
    form.setAttribute('action', [
      action,
      ~action.indexOf('?') ? '&' : '?',
      '_pagelet=',
      name
    ].join(''));
  }
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
  if (this.freelist.length < this.maximum) {
    this.freelist.push(pagelet);
  }
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
  this.orchestrate = this.stream.substream('pipe::orchestrate');
};

//
// Expose the pipe
//
module.exports = Pipe;

},{"./collection":8,"./loader":10,"./pagelet":11,"eventemitter3":2}],10:[function(require,module,exports){
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

},{"./collection":8}],11:[function(require,module,exports){
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
    page: this.pipe.id,                     // Unique id of the page.
    url: this.pipe.url,                     // The current URL
    type: 'configure',                      // Message type
    pagelet: data.id,                       // Unique id of the pagelet.
    name: name                              // Pagelet name.
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

},{"./async":7,"./collection":8,"eventemitter3":2,"fortress":3}]},{},[9])
(9)
});
;