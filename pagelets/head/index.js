'use strict';

//
// Default head pagelet, exposed to the client first.
//
require('pagelet').extend({
  view: 'head.ejs' // TODO make sure to support both sync and async methods.
}).on(module);
