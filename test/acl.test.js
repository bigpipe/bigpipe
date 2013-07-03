describe('Access Control List', function () {
  'use strict';

  var common = require('./common')
    , expect = common.expect
    , Acl = require('../acl');

  it('exposes the ACL registry constructor', function () {
    expect(Acl).to.be.a('function');
  });
});
