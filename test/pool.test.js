describe('Expirable pools', function () {
  'use strict';

  var common = require('./common')
    , expect = common.expect
    , Pool = require('../pool')
    , pool;

  beforeEach(function () {
    pool = new Pool({ type: 'test' });
  });

  afterEach(function () {
    pool = null;
  });

  it('exposes the Pool constructor', function () {
    expect(Pool).to.be.a('function');
  });
});
