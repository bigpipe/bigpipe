describe('Shared helpers', function () {
  'use strict';

  var common = require('./common')
    , expect = common.expect
    , shared = Object.create(
          require('events').EventEmitter.prototype
        , common.shared.mixin({})
      );

  it('emits returns emit function for flow control', function (done) {
    var fn = shared.emits('test');

    expect(fn).to.be.a('function');

    shared.on('test', function(argument) {
      expect(argument).to.equal('argument');
      done();
    });

    fn('argument');
  });
});
