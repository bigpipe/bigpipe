'use strict';

//
// A simple index page test route.
//
require('pagelet').extend({
  method: '',
  path: '/all',
  view: '../../view/all.html'
}).on(module);
