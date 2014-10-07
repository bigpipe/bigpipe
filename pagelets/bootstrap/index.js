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
  '<meta http-equiv="refresh" content="0; URL={{path}}?{{query}}">',
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
// Default head pagelet, injected into the pagelet that is the target of the
// router. This basic HEAD/bootstrap pagelet can easily be extended.
//
Pagelet.extend({
  name: 'bootstrap',
  title: 'BigPipe',
  description: 'Default description for BigPipe\'s pagelets',
  keywords: ['BigPipe', 'pagelets', 'bootstrap'],
  robots: ['index', 'follow'],
  favicon: '/favicon.ico',
  author: 'BigPipe',
  dependencies: [],
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
  // Used for proper client side initialization of the library.
  //
  length: 0,

  /**
   * Render the HTML template with the data provided. Temper provides a minimal
   * templater to handle data in HTML templates. Data has to be specifically
   * provided, properties of `this` are not enumarable and would not be included.
   *
   * @return {String} Generated template.
   * @api public
   */
  html: function html() {
    return this.temper.fetch(this.view).server({
      title: this.title,
      description: this.description,
      keywords: this.keywords,
      robots: this.robots,
      favicon: this.favicon,
      author: this.author,
      dependencies: this.dependencies.join(''),
      fallback: this.fallback,
      charset: this.charset,
      parent: this.parent,
      length: this.length,
      id: this.id
    });
  },

  /**
   * Extend the default constructor of the pagelet to set additional defaults
   * based on the provided options.
   *
   * @param {Object} options
   * @api public
   */
  constructor: function constructor(options) {
    Pagelet.prototype.constructor.apply(this, arguments);

    //
    // Merge provided options.
    //
    options = options || {};
    for (var key in options) this[key] = options[key];

    //
    // Set the default fallback script, see explanation above.
    //
    this.fallback = 'sync' === options.mode ? script : noscript.replace(
      '{{path}}',
      options.path
    ).replace(
      '{{query}}',
      qs.stringify(this.merge({ no_pagelet_js: 1 }, options.query))
    );
  }
}).on(module);
