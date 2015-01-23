'use strict';

//
// A simple FAQ page test route.
//
require('pagelet').extend({
  method: 'GET',
  path: '/faq',
  view: '../../view/all.html',
  pagelets: {
    test: require('pagelet').extend({
      view: '../../view/all.html'
    }).on(module)
  }
}).on(module);
