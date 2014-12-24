describe('Pipe', function () {
  'use strict';

  var common = require('./common')
    , Compiler = require('../lib/compiler')
    , http = require('http')
    , expect = common.expect
    , Pipe = common.Pipe
    , server
    , app;


  before(function (done) {
    server = http.createServer(function () {
      throw new Error('Unhandled request');
    });

    app = new Pipe(server, {
      pagelets: __dirname +'/fixtures/pagelets',
      dist: '/tmp/dist'
    }).listen(common.port, done);
  });

  it('exposes the Pagelet constructor', function () {
    expect(Pipe.Pagelet).to.be.a('function');
    expect(Pipe.Pagelet.extend).to.be.a('function');
  });

  it('is an EvenEmitter3', function () {
    expect(app).to.be.instanceOf(require('eventemitter3'));
  });

  it('correctly resolves `pagelets` as a string to an array', function () {
    expect(app.pagelets).to.be.a('array');
    expect(app.pagelets).to.have.length(4);
  });

  it('transforms pagelets', function () {
    var Pagelet = app.pagelets[0];

    expect(Pagelet.method).to.be.a('array');
  });

  it('has compiler for asset management', function () {
    var property = Object.getOwnPropertyDescriptor(app, 'compiler');

    expect(app).to.have.property('compiler');
    expect(app.compiler).to.be.an('object');
    expect(app.compiler).to.be.instanceof(Compiler);
    expect(property.writable).to.equal(false);
    expect(property.enumerable).to.equal(false);
    expect(property.configurable).to.equal(false);
  });

  describe('.options', function () {
    it('has queryable options with defaults', function () {
      expect(app.options).to.be.a('function');
      expect(app.options('host')).to.equal(undefined);
      expect(app.options('host', 'localhost')).to.equal('localhost');

      var pipe = new Pipe(http.createServer(), {
          pagelets: __dirname +'/fixtures/pagelets'
        , dist: '/tmp/dist'
        , host: '127.0.0.1'
      });

      expect(pipe.options('host')).to.equal('127.0.0.1');
    });

    it('additional options can be merged, per example from a plugin', function () {
      expect(app.options.merge).to.be.a('function');
      expect(app.options('test')).to.equal(undefined);

      var pipe = new Pipe(http.createServer(), {
          pagelets: __dirname +'/fixtures/pagelets'
        , dist: '/tmp/dist'
        , host: '127.0.0.1'
      });
      expect(pipe.options('host')).to.equal('127.0.0.1');
      pipe.options.merge({ test: 'additional' });
      expect(pipe.options('test')).to.equal('additional');
    });
  });

  describe('.router', function () {
    function Request(url, method) {
      this.url = url;
      this.uri = require('url').parse(url, true);
      this.query = this.uri.query || {};
      this.method = method || 'GET';
    }

    it('finds the / pagelet', function (done) {
      app.router(new Request('/'), {}, function (err, pagelet) {
        if (err) return done(err);

        expect(pagelet).to.be.instanceOf(Pipe.Pagelet);
        expect(pagelet.statusCode).to.equal(200);

        done();
      });
    });

    it('doesnt find / for POST requests', function (done) {
      app.router(new Request('/', 'POST'), {}, function (err, pagelet) {
        if (err) return done(err);

        expect(pagelet).to.be.instanceOf(Pipe.Pagelet);
        expect(pagelet.statusCode).to.equal(404);

        done();
      });
    });

    ['GET', 'POST', 'MOO'].forEach(function (method) {
      it('finds /all for '+ method, function (done) {
        app.router(new Request('/all', method), {}, function (err, pagelet) {
          if (err) return done(err);

          expect(pagelet).to.be.instanceOf(Pipe.Pagelet);
          expect(pagelet.statusCode).to.equal(200);

          done();
        });
      });
    });

    it('always returns a 404 page for unknown urls', function (done) {
      app.router(new Request('/'+ Math.random(), 'POST'), {}, function (err, pagelet) {
        if (err) return done(err);

        expect(pagelet).to.be.instanceOf(Pipe.Pagelet);
        expect(pagelet.statusCode).to.equal(404);

        done();
      });
    });

    it('adds and retrieves pagelets from a provided cache', function (done) {
      var cache = {
        get: function (url) {
          expect(url).to.equal('GET@/');
          pattern.push('get');
          return cache.pagelet;
        },
        set: function (url, pagelet) {
          expect(url).to.equal('GET@/');
          expect(pagelet).to.be.a('array');
          pattern.push('set');
          cache.pagelet = pagelet;
        }
      };

      var pattern = [];

      var local = new Pipe(server, {
        dist: '/tmp/dist',
        cache: cache
      });

      local.define(__dirname +'/fixtures/pagelets', function define() {
        local.router(new Request('/'), {}, function (err, pagelet) {
          if (err) return done(err);

          expect(pagelet).to.be.instanceOf(Pipe.Pagelet);
          expect(pagelet.statusCode).to.equal(200);

          local.router(new Request('/'), {}, function (err, pagelet) {
            if (err) return done(err);

            expect(pagelet).to.be.instanceOf(Pipe.Pagelet);
            expect(pagelet.statusCode).to.equal(200);
            expect(pattern.join()).to.equal('get,set,get');

            done();
          });
        });
      });
    });
  });

  describe('.define', function () {
    it('adds Pagelet to the pagelets collection', function (next) {
      var faq = require(__dirname + '/fixtures/pagelets/faq');

      app = new Pipe(server, {
        dist: '/tmp/dist'
      });

      app.define(faq, function (err) {
        if (err) return next(err);

        expect(app.pagelets).to.have.length(1);
        expect(app.pagelets[0]).to.be.an('function');
        faq.prototype.dependencies = [];

        next();
      });
    });

    it('will resolve and add the pagelets if directory', function (next) {
      app = new Pipe(server, {
        dist: '/tmp/dist'
      });

      app.define(__dirname + '/fixtures/pagelets', function (err) {
        if (err) return next(err);

        expect(app.pagelets).to.have.length(4);
        app.pagelets.forEach(function (pagelet) {
          expect(pagelet.prototype).to.have.property('id');
        });

        next();
      });
    });
  });

  describe('.discover', function () {
    it('provides default pagelets if no /404 or /500 is found', function () {
      expect(app.statusCodes[404]).to.equal(require('404-pagelet'));
      expect(app.statusCodes[500]).to.equal(require('500-pagelet'));
    });

    it('uses user provided 404 and 500 pagelets based on routes', function () {
      app = new Pipe(server, {
        pagelets: __dirname + '/fixtures/discover',
        dist: '/tmp/dist'
      });

      expect(app.pagelets).to.have.length(0);
      expect(app.statusCodes[404]).to.not.equal(require('404-pagelet'));
      expect(app.statusCodes[500]).to.not.equal(require('500-pagelet'));
    });
  });

  describe('.resolve', function () {
    it('omits any directories from the pagelets directory without an index.js', function () {
      app = new Pipe(server, {
        pagelets: __dirname + '/fixtures/discover',
        dist: '/tmp/dist'
      });

      app.pagelets.forEach(function (pagelets) {
        expect(pagelets.id).to.not.match(/^dummy/);
      });
    });
  });

  describe('.listen', function () {
    it('proxies event listeners', function (done) {
      //
      // Set a big timeout as we might need to lazy install dependencies
      //
      this.timeout(50E4);

      var pipe = new Pipe(http.createServer(), {
          dist: '/tmp/dist'
      });

      pipe.once('listening', function () {
        pipe.server.close(done);
      });

      pipe.listen(common.port);
    });
  });

  describe('.createServer', function () {
    it('will call .listen as soon as the server is completely initialized');
  });

  describe('.redirect', function () {
    it('redirects to specified location', function (done) {
      var property = Object.getOwnPropertyDescriptor(Pipe.prototype, 'redirect')
        , pagelet = new Pipe.Pagelet({res: {}, pipe: app });

      expect(Pipe.prototype).to.have.property('redirect');
      expect(Pipe.prototype.redirect).to.be.a('function');
      expect(property.writable).to.equal(false);
      expect(property.enumerable).to.equal(false);
      expect(property.configurable).to.equal(false);

      pagelet.res.setHeader = function setHeader(header, value) {
        expect(header).to.equal('Location');
        expect(value).to.equal('/redirected');
      };

      pagelet.res.end = function end() {
        expect(pagelet.res.statusCode).to.equal(301);
        done();
      };

      app.redirect(pagelet, '/redirected');
    });

    it('allows to set custom statusCode', function (done) {
      var pagelet = new Pipe.Pagelet({res: {}, pipe: app });

      pagelet.res.setHeader = function setHeader(header, value) {
        expect(header).to.equal('Location');
        expect(value).to.equal('/redirected');
      };

      pagelet.res.end = function end() {
        expect(pagelet.res.statusCode).to.equal(400);
        done();
      };

      app.redirect(pagelet, '/redirected', 400);
    });
  });
});
