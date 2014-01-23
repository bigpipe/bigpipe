'use strict';

var Page = require('../../page');

//
// Default 500 error page that will be served if none is provided.
//
Page.extend({
  path: '/pagelets/500',
  statusCode: 500,
  view: '500.ejs',
  pagelets: {
    'diagnostics': '../../pagelets/diagnostics'
  }
}).on(module);
