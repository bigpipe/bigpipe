'use strict';

var Pagelet = require('pagelet');

//
// Default 500 error pagelet that will be served if none is provided.
//
Pagelet.extend({
  path: '/500',
  statusCode: 500,
  view: '500.html',
  env: process.env.NODE_ENV,
  data: {},
  pagelets: {
    'diagnostics': '../diagnostics'
  },

  /**
   * Return available data depending on environment settings.
   *
   * @param {Function} render Completion callback.
   * @api private
   */
  get: function get(render) {
    var self = this;

    render(null, {
      message: data.message,
      stack: self.env && self.env !== 'production' ? data.stack : ''
    })
  }
}).on(module);
