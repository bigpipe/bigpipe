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
