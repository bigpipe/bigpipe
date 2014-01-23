'use strict';

var Page = require('../../page');

//
// Default 404, not found page.
//
Page.extend({
  path: '/pagelet/404',
  statusCode: 404,
  view: '404.ejs',
  pagelets: {
    'diagnostics': '../../pagelets/diagnostics'
  }
}).on(module);
