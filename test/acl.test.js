describe('Access Control List', function () {
  'use strict';

  var common = require('./common')
    , Pipe = common.Pipe
    , expect = common.expect
    , Acl = require('../acl')
    , server = Pipe.createServer(1337, 'pages')
    , acl;

  beforeEach(function () {
    acl = new Acl(server);
  });

  it('exposes the ACL registry constructor', function () {
    expect(Acl).to.be.a('function');
  });

  it('receives resources collection from Pipe', function () {
    expect(acl.resources).to.be.an('object');
  });
});
