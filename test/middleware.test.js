describe('middleware', function () {
  'use strict';

  var common = require('./common')
    , http = require('http')
    , expect = common.expect
    , Pipe = common.Pipe
    , server
    , app;

  beforeEach(function (done) {
    server = http.createServer(function () {
      throw new Error('Unhandled request');
    });

    app = new Pipe(server, {
        pages: __dirname +'/fixtures/pages'
      , dist: '/tmp/dist'
    });

    server.portnumber = common.port;
    server.listen(server.portnumber, done);
  });

  afterEach(function (done) {
    server.close(done);
  });

  describe('#before', function () {
    it('is chainable', function () {
      expect(app.before('foo', function (req, res) {})).to.equal(app);
    });

    it('throws when no function is profided', function (done) {
      try { app.before('foo', new Date()); }
      catch (e) { done(); }
    });

    it('throws when function doesnt accept req/res args', function (done) {
      try { app.before('foo', function () { return function () {}; }); }
      catch (e) { done(); }
    });

    it('calls the function if it has less then 2 arguments', function (done) {
      app.before('example', function (options) {
        expect(this).to.equal(app);
        expect(options).to.be.a('object');
        expect(options.foo).to.equal('bar');

        done();

        return function (req, res) {};
      }, { foo: 'bar' });
    });

    it('extracts a name if none is given', function () {
      expect(app.indexOfLayer('connect')).to.equal(-1);

      app.before(function connect(req, res, bar) {});
      expect(app.indexOfLayer('connect')).to.be.above(-1);
    });

    it('stores the layer', function () {
      function foo(req, res, next) { }
      function bar(req, res) { }

      app.before('foo', foo).before('bar', bar);

      var index = app.indexOfLayer('foo')
        , layer = app.layers[index];

      expect(layer.name).to.equal('foo');
      expect(layer.enabled).to.equal(true);
      expect(layer.length).to.equal(3);
      expect(layer.fn).to.equal(foo);

      index = app.indexOfLayer('bar');
      layer = app.layers[index];
      expect(layer.length).to.equal(2);
    });

    it('overrides layers with the same name', function () {
      function foo(req, res, next) { }
      function bar(req, res) { }

      app.before('foo', foo);

      var index = app.indexOfLayer('foo')
        , layer = app.layers[index];

      expect(layer.name).to.equal('foo');
      expect(layer.enabled).to.equal(true);
      expect(layer.length).to.equal(3);
      expect(layer.fn).to.equal(foo);

      app.before('foo', bar);
      expect(app.indexOfLayer('foo')).to.equal(index);

      index = app.indexOfLayer('foo');
      layer = app.layers[index];

      expect(layer.name).to.equal('foo');
      expect(layer.enabled).to.equal(true);
      expect(layer.length).to.equal(2);
      expect(layer.fn).to.equal(bar);
    });
  });

  describe('#indexOfLayer', function () {
    it('returns the index based on name', function () {
      expect(app.indexOfLayer('foo')).to.equal(-1);

      app.before('foo', function (req, res) {
        throw new Error('Dont execute me');
      });

      expect(app.indexOfLayer('foo')).to.be.above(-1);
    });
  });

  describe('#remove', function () {
    it('removes the layer from the stack', function () {
      app.before('bar', function (req, res) {});
      app.before('foo', function (req, res) {
        throw new Error('boom');
      });

      expect(app.indexOfLayer('foo')).to.be.above(-1);
      expect(app.indexOfLayer('bar')).to.be.above(-1);

      app.remove('foo');
      expect(app.indexOfLayer('foo')).to.equal(-1);
      expect(app.indexOfLayer('bar')).to.be.above(-1);
    });
  });

  describe('#disable', function () {
    it('disables the middleware', function () {
      app.before('foo', function (req, res) {});

      var index = app.indexOfLayer('foo')
        , layer = app.layers[index];

      expect(layer.enabled).to.equal(true);
      app.disable('foo');
      expect(layer.enabled).to.equal(false);
    });
  });

  describe('#enable', function () {
    it('enables the middleware', function () {
      app.before('foo', function (req, res) {});

      var index = app.indexOfLayer('foo')
        , layer = app.layers[index];

      app.disable('foo');
      expect(layer.enabled).to.equal(false);

      app.enable('foo');
      expect(layer.enabled).to.equal(true);
    });
  });
});
