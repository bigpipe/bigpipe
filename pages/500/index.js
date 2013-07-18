'use strict';

var Page = require('../../page');

//
// Default 500 error page that will be served if none is provided.
//
Page.extend({
  statusCode: 500,
  pagelets: {
    'diagnostics': '../../pagelets/diagnostics'
  }
}).on(module);
