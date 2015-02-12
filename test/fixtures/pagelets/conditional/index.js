'use strict';

//
// A simple index page test route.
//
require('pagelet').extend({
  method: 'GET',
  path: '/',
  view: '../../view/all.html',
  pagelets: {
    all: ['./if', '../base']
  }
}).on(module);
