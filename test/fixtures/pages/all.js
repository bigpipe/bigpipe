'use strict';

var Page = require('../../../').Page;

//
// A simple index page test route.
//
Page.extend({
  method: '',
  path: '/all',
  view: '../view/all.ejs'
}).on(module);
