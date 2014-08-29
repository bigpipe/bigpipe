'use strict';

var Pagelet = require('pagelet');

//
// Default 500 error pagelet that will be served if none is provided.
//
Pagelet.extend({
  path: '/500',
  statusCode: 500,
  view: '500.ejs',
  pagelets: {
    'diagnostics': '../../pagelets/diagnostics'
  }
}).on(module);
