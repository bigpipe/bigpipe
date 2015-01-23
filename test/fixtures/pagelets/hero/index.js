'use strict';

require('pagelet').extend({
  js: 'hero.js',
  css: 'hero.css',
  view: 'hero.html',
  path: '/hero',
  render: function render(data, done) {
    setTimeout(function () {
      done(null, {
        foo: 'bar'
      });
    }, 10);
  }
}).on(module);
