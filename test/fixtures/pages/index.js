'use strict';

var Page = require('../../../').Page;

//
// A simple index page test route.
//
Page.extend({
  method: 'GET',
  path: '/',
  view: '../view/all.ejs'
}).on(module);
