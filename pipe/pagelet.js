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

  var pagelet = this;

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
  this.emit('initialise');

  //
  // Only load the client code in a sandbox when it exists. There no point in
  // spinning up a sandbox if it does nothing
  //
  if (!this.code) return;
  this.sandbox(this.prepare(this.code));
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

  this.pipe.emit(this.name +'::render', this);
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
