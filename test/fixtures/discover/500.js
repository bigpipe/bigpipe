'use strict';

var Page = require('../../../page');

//
// Custom 500 error page, internal server fuckup.
//
Page.extend({
  statusCode: 500,
  path: '/500',
  pagelets: {
    hero: '../pagelets/hero'
  },
  view: '../view/all.ejs'
}).on(module);
