'use strict';

//
// A simple index page test route.
//
require('pagelet').extend({
  view: '../../view/all.html',
  if: function (req, accepted) {
    setTimeout(function () {
      accepted(true);
    }, 10);
  }
}).on(module);
