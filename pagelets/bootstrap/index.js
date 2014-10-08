'use strict';

var Pagelet = require('pagelet')
  , qs = require('querystring');

//
// BigPipe depends heavily on the support of JavaScript in browsers as the
// rendering of the page's components is done through JavaScript. When the
// user has JavaScript disabled they will see a blank page instead. To prevent
// this from happening we're injecting a `noscript` tag in to the page which
// forces the `sync` render mode.
//
var noscript = [
  '<noscript>',
  '<meta http-equiv="refresh" content="0; URL={path}?{query}">',
  '</noscript>'
].join('');

//
// Also when we have JavaScript enabled make sure the user doesn't accidentally
// force them selfs in to a `sync` render mode as the URL could have been
// shared through social media.
//
var script = [
  '<script>',
  'if (~location.search.indexOf("no_pagelet_js=1"))',
  'location.href = location.href.replace(location.search, "")',
  '</script>'
].join('');

//
// This basic HEAD/bootstrap pagelet can easily be extended.
// Bootstrap adds specific directives to the HEAD element, which are required
// for BigPipe to function.
//
// - Sets a default set of meta tags in the HEAD element
// - It includes the pipe.js JavaScript client and initializes it.
// - It includes "core" library files for the page (pagelet dependencies).
// - It includes "core" CSS for the page (pagelet dependencies).
// - It adds a noscript meta refresh to force a `sync` method which fully
//   renders the HTML server side.
//
Pagelet.extend({
  name: 'bootstrap',
  title: 'BigPipe',
  description: 'Default description for BigPipe\'s pagelets',
  keywords: ['BigPipe', 'pagelets', 'bootstrap'],
  robots: ['index', 'follow'],
  favicon: '/favicon.ico',
  author: 'BigPipe',
  dependencies: '',
  view: 'view.html',

  //
  // Name of the main or base pagelet. This pagelet was discovered by routing as
  // the parent of all child pagelets.
  //
  parent: '',

  //
  // Add a meta charset so the browser knows the encoding of the content so it
  // will not buffer it up in memory to make an educated guess. This will ensure
  // that the HTML is shown as fast as possible.
  //
  charset: 'utf-8',

  //
  // Used for proper client side library initialization.
  //
  length: 0,

  //
  // Set a number of properties on the response as it is available to all pagelets.
  // This will ensure the correct amount of pagelets are processed and that the
  // entire queue is written to the client.
  //
  flushed: false,
  ended: false,
  queue: [],
  n: 0,

  //
  // Set of keys used by the HTML renderer to deduce the required data.
  //
  keys: [
    'title', 'description', 'keywords', 'robots', 'favicon', 'author',
    'dependencies', 'fallback', 'charset', 'parent', 'length', 'id'
  ],

  /**
   * Render the HTML template with the data provided. Temper provides a minimal
   * templater to handle data in HTML templates. Data has to be specifically
   * provided, properties of `this` are not enumarable and would not be included.
   *
   * @return {String} Generated template.
   * @api public
   */
  html: function html() {
    var bootstrap = this
      , data = this.keys.reduce(function reduce(memo, key) {
          memo[key] = bootstrap[key];
          return memo;
        }, {});

    return this.temper.fetch(this.view).server(data);
  },

  /**
   * Extend the default constructor of the pagelet to set additional defaults
   * based on the provided options.
   *
   * @param {Pagelet} parent Main pagelet.
   * @param {Object} options
   * @api public
   */
  constructor: function constructor(parent, options) {
    Pagelet.prototype.constructor.call(this, options);

    //
    // Store the provided global dependencies and set additional properties.
    //
    this.dependencies = options.dependencies.join('');
    this.enchance(parent);
  },

  /**
   * Set specific options on the bootstrap paglet.
   *
   * @param {Pagelet} parent Main pagelet.
   * @api private
   */
  enchance: function enchance(parent) {
    //
    // Number of pagelets that should be written, increased with 1 as the parent
    // pagelet itself should be written as well.
    //
    this.length = parent.pagelets.length + 1;

    //
    // Name of the parent pagelet, used to set the correct data-pagelet
    // property on the `body` element.
    //
    this.parent = parent.name;

    //
    // Set the default fallback script, see explanation above.
    //
    this.fallback = 'sync' === parent.mode ? script : noscript.replace(
      '{path}',
      this.req.uri.pathname
    ).replace(
      '{query}',
      qs.stringify(this.merge({ no_pagelet_js: 1 }, this.req.query))
    );
  }
}).on(module);
