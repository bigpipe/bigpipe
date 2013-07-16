'use strict';

var Pagelet = require('../../../../').Pagelet;

Pagelet.extend({
  js: 'hero.js',
  css: 'hero.css',
  view: 'hero.jade',
  render: function render(data, done) {
    setTimeout(function () {
      done(null, {
        foo: 'bar'
      });
    }, 10);
  }
}).on(module);
