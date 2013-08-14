describe('Pagelet', function () {
  'use strict';

  var common = require('./common')
    , Pagelet = common.Pagelet
    , expect = common.expect
    , pagelet;

  beforeEach(function () {
    pagelet = new Pagelet;
  });

  it ('rendering is asynchronously', function (done) {
    pagelet.render(pagelet.emit.bind(pagelet, 'called'));
    pagelet.on('called', done);
  });
});
