describe('Resource', function () {
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
      expect(err).to.be.an.instanceof(Error);
      expect(err.message).to.equal('unable to call get on the resource');
      expect(data).to.equal(undefined);
      done();
    });
  });

  it('resource listens to POST event', function (done) {
    resource.emit('post', { hello: 'world' }, function (err, result) {
      expect(err).to.be.an.instanceof(Error);
      expect(err.message).to.equal('unable to call post on the resource');
      expect(result).to.equal(undefined);
      done();
    });
  });

  it('resource listens to PUT event', function (done) {
    resource.emit('put', { hello: 'world' }, { id: 1 }, function (err, result) {
      expect(err).to.be.an.instanceof(Error);
      expect(err.message).to.equal('unable to call put on the resource');
      expect(result).to.equal(undefined);
      done();
    });
  });

  it('resource listens to DELETE event', function (done) {
    resource.emit('delete', { id: 1 }, function (err, result) {
      expect(err).to.be.an.instanceof(Error);
      expect(err.message).to.equal('unable to call delete on the resource');
      expect(result).to.equal(undefined);
      done();
    });
  });

  describe('#find', function () {
    it('returns empty list if cache is unavailable', function () {
      resource.cache = null;

      var cached = resource.find({ random: 'query' });
      expect(cached).to.be.an('array');
      expect(cached.length).to.equal(0);
    });

    it('returns empty list if query is not of type Object', function () {
      resource.cache = [{ random: 'data' }];

      var cached = resource.find('query');
      expect(cached).to.be.an('array');
      expect(cached.length).to.equal(0);
    });

    it('returns indices of objects matching query', function () {
      resource.cache = [{ name: 'Jake' }, { name: 'Jeff' }, { name: 'Jake' }];

      var cached = resource.find({ name: 'Jake' });
      expect(cached).to.be.an('array');
      expect(cached.length).to.equal(2);
      expect(cached).to.include(0);
      expect(cached).to.include(2);
    });

    it('returns empty indices list if restrictive query has no matches', function () {
      resource.cache = [{ id: 0, name: 'Jake' }, { id: 1, name: 'Jake' }];

      var cached = resource.find({ id: 3, name: 'Jake' });
      expect(cached).to.be.an('array');
      expect(cached.length).to.equal(0);
    });
  });

  describe('#aquire', function () {
    it('returns empty list if indices do not exist on cache', function () {
      resource.cache = [{ random: 'data' }];

      var indices = resource.aquire([1, 2]);
      expect(indices).to.be.an('array');
      expect(indices.length).to.equal(0);
    });

    it('returns empty list if cache is unavailable', function () {
      resource.cache = null;

      var indices = resource.aquire([1, 2]);
      expect(indices).to.be.an('array');
      expect(indices.length).to.equal(0);
    });

    it('returns cached objects in correspondence with indices', function () {
      resource.cache = [{ random: 'data' }];

      var indices = resource.aquire([0]);
      expect(indices).to.be.an('array');
      expect(indices.length).to.equal(1);
      expect(indices[0]).to.be.an('object');
      expect(indices[0]).to.have.property('random', 'data');
    });
  });

  describe('#GET', function () {
    it('cache proxy returns cached values if available', function () {
      var query = {more: 'stuff'}, i = 0;
      resource.cache = [{ random: 'data' }, {id: 2, more: 'stuff'}];
      resource.get = function () { i++; };

      resource._get(query, function (err, data) {
        expect(err).to.equal(null);
        expect(data).to.be.an('array');
        expect(data[0]).to.have.property('id', 2);
        expect(data[0]).to.have.property('more', 'stuff');
        expect(i).to.equal(0);
      });
    });

    it('cache proxy calls supplied GET if no cache', function (done) {
      resource.cache = null;
      resource.get = function (query, fn) {
        fn();
      };

      resource._get({id: 1}, done);
    });
  });

  describe('#POST', function () {
    it('will insert data in cache on succesful POST', function (done) {
      var i = 0;

      resource.cache = [{ random: 'data' }];
      resource.post = function (data, fn) { i++; fn(undefined, true); };

      resource._post({id: 2, more: 'stuff'}, function (err, result) {
        expect(resource.cache.length).to.equal(2);
        expect(resource.cache[1]).to.have.property('id', 2);
        expect(resource.cache[1]).to.have.property('more', 'stuff');
        expect(i).to.equal(1);
        expect(result).to.equal(true);
        done();
      });
    });

    it('will not cache values on failure', function (done) {
      resource.post = function (data, fn) {
        fn('POST errored somewhere');
      };

      resource._post({random: 'data'}, function (err, result) {
        // Error will be an instance of Error if POST is triggered by event.
        expect(err).to.be.equal('POST errored somewhere');
        expect(result).to.equal(false);
        done();
      });
    });
  });

  describe('#DELETE', function () {
    it('removes indices from cache', function (done) {
      var i = 0;

      resource.cache = [{id: 1}, { random: 'data' }, {id: 2}];
      resource.delete = function (query, fn) { i++; fn(undefined, true); };

      resource._delete({random: 'data'}, function (err, result) {
        expect(result).to.equal(true);
        expect(resource.cache.length).to.equal(2);
        expect(resource.cache[1]).to.have.property('id', 2);
        expect(i).to.equal(1);
        done();
      });
    });

    it('returns true if nothing was deleted and if there are no errors', function (done) {
      resource.delete = function (query, fn) { fn(undefined, true); };
      resource.cache = [{id: 1}, { random: 'data' }, {id: 2}];

      resource._delete({not: 'in cache'}, function (err, result) {
        expect(result).to.equal(true);
        expect(resource.cache.length).to.equal(3);
        done();
      });
    });
  });

  describe('#proxyMethod', function () {
    it('returns a callable callback', function () {
      expect(resource.proxyMethod()).to.be.an('function');
    });

    it('checks for availability of developer supplied REST method', function (done) {
      var callback = resource.proxyMethod('post');

      callback(function (err, data) {
        expect(err).to.be.an.instanceof(Error);
        expect(err.message).to.equal('unable to call post on the resource');
        expect(data).to.equal(undefined);
        done();
      });
    });
  });

  describe('#proxy', function () {
    it('returns a callable callback', function () {
      expect(resource.proxy()).to.be.an('function');
    });

    it('ensures callback is deferred regardless of implementation', function (done) {
      var final = resource.proxy(done);
      final();
    });

    it('exposes supplied error and data', function (done) {
      var final = resource.proxy(function callback(err, data) {
        expect(data).to.be.an('object');
        expect(data).to.have.property('test', 1);
        expect(err).to.be.an.instanceof(Error);
        expect(err.message).to.be.equal('I errored');
        done();
      });

      final('I errored', { test: 1 });
    });
  });
});
