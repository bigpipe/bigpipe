'use strict';

var Pagelet = require('pagelet');

//
// Default 404, not found pagelet.
//
Pagelet.extend({
  path: '/404',
  statusCode: 404,
  view: '404.html',
  pagelets: {
    diagnostics: '../diagnostics'
  }
}).on(module);