'use strict';

//
// Custom 404 error pagelet, not found page.
//
require('404-pagelet').extend({
  pagelets: {},
  view: '../../view/all.html'
}).on(module);
