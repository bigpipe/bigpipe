describe('Shared helpers', function () {
  'use strict';

  var common = require('./common')
    , expect = common.expect
    , Resource = common.Resource
    , resource;

  beforeEach(function () {
    resource = new Resource;
    resource.configure();
  });

  afterEach(function () {
    resource = null;
  });

  it('resource listens to GET event', function (done) {
    resource.emit('get', { id: 1 }, function (err, data) {
      expect(err).to.be.equal('unable to read the data from the resource');
      expect(data).to.equal(undefined);
      done();
    });
  });

  it('resource listens to POST event', function (done) {
    resource.emit('post', { hello: 'world' }, function (err, result) {
      expect(err).to.be.equal('unable to create a new value in the resource');
      expect(result).to.equal(false);
      done();
    });
  });

  it('resource listens to PUT event', function (done) {
    resource.emit('put', { hello: 'world' }, { id: 1 }, function (err, result) {
      expect(err).to.be.equal('unable to update the queried value in the resource');
      expect(result).to.equal(false);
      done();
    });
  });

  it('resource listens to DELETE event', function (done) {
    resource.emit('delete', { id: 1 }, function (err, result) {
      expect(err).to.be.equal('unable to delete the value from the resource');
      expect(result).to.equal(false);
      done();
    });
  });
});
