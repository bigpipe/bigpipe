'use strict';

//
// Custom 500 error pagelet, internal server fuckup.
//
require('500-pagelet').extend({
  pagelets: {},
  view: '../../view/all.html'
}).on(module);
