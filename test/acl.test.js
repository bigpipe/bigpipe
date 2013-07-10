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

  afterEach(function () {
    acl = null;
  });

  it('exposes the ACL registry constructor', function () {
    expect(Acl).to.be.a('function');
  });

  it('receives resources collection from Pipe', function () {
    expect(acl.resources).to.be.an('object');
    // add additional expectation after adding a resource to acl.
  });

  describe('#grant', function () {
    it('creates grantee if it does not exist yet', function () {
      acl.grant('guest', 'login');

      expect(acl.store).to.have.property('guest');
      expect(acl.store.guest).to.be.an('array');
    });

    it('adds resource to the list of the grantee', function () {
      acl.grant('guest', 'login');
      acl.grant('guest', 'faq');

      expect(acl.store.guest.length).to.equal(2);
      expect(acl.store.guest[0]).to.equal('login');
      expect(acl.store.guest[1]).to.equal('faq');
    });
  });

  describe('#revoke', function () {
    it('removes specific rights of the grantee', function () {
      acl.grant('guest', 'login');
      acl.grant('guest', 'faq');

      // Revoke the rights of guests to login
      acl.revoke('guest', 'login');
      expect(acl.store).to.be.an('object');
      expect(acl.store.guest.length).to.equal(1);
    });

    it('removes grantee if no resources remain', function () {
      acl.grant('guest', 'login');
      acl.revoke('guest', 'login');

      expect(acl.store).to.be.an('object');
      expect(acl.store).to.not.have.property('guest');
    });

    it('ignores revoking of falsy rights', function () {
      var result = acl.revoke('random', 'login');
      expect(result).to.be.an('object');
    });
  });

  describe('#assert', function () {
    it('returns true if the grantee has the resource as right', function (done) {
      acl.grant('guest', 'login');

      acl.assert('guest', 'login', function (err, result) {
        expect(result).to.equal.true;
        done();
      });
    });

    it('returns false if the grantee has no rights', function (done) {
      acl.assert('guest', 'login', function (err, result) {
        expect(result).to.equal.false;
        done();
      });
    });

    it('calls the assert function of the resource if available');
  });
});
