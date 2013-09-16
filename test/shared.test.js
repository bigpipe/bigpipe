describe('Shared helpers', function () {
  'use strict';

  var common = require('./common')
    , expect = common.expect
    , shared = Object.create(
          require('events').EventEmitter.prototype
        , common.shared.mixin({})
      );

  it('#emits returns emit function for flow control', function (done) {
    var fn = shared.emits('test');

    expect(fn).to.be.a('function');

    shared.on('test', function(argument) {
      expect(argument).to.equal('argument');
      done();
    });

    fn('argument');
  });

  it('#merge performs a deep merge on two objects', function () {
    var o1 = { test: 1, check: 2 }
      , o2 = { test: 3, check: 3, deep: { object: 'test'}}
      , result = shared.merge(o1, o2);

    expect(result).to.have.property('deep');
    expect(result).to.have.property('test', 3);
    expect(result.deep).to.have.property('object', 'test');
  });
});
