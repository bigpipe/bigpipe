'use strict';

var Pagelet = require('../..').Pagelet;

Pagelet.extend({
  view: 'diagnostic.jade',
  css: 'diagnostic.styl',

  render: function render(done) {
    done();
  }
}).on(module);
