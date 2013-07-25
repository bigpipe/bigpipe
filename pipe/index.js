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
