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
    expect(app._pagelets).to.be.a('array');
    expect(app._pagelets).to.have.length(4);
  });

  it('transforms pagelets', function () {
    var Pagelet = app._pagelets[0];

    expect(Pagelet.method).to.be.a('array');
  });

  it('has supply middleware manager', function () {
    expect(app).to.have.property('middleware');
    expect(app.middleware).to.be.an('object');
    expect(app.middleware).to.be.instanceof(require('supply'));
  });

  it('has zipline to handle gzip compression', function () {
    expect(app).to.have.property('_zipline');
    expect(app._zipline).to.be.an('object');
    expect(app._zipline).to.be.instanceof(require('zipline'));
  });

  it('has compiler for asset management', function () {
    expect(app).to.have.property('_compiler');
    expect(app._compiler).to.be.an('object');
    expect(app._compiler).to.be.instanceof(Compiler);
  });

  it('does not cache by default', function () {
    expect(app).to.have.property('_cache');
    expect(app._cache).to.equal(false);
  });

  describe('_options', function () {
    it('has queryable options with defaults', function () {
      expect(app._options).to.be.a('function');
      expect(app._options('host')).to.equal(undefined);
      expect(app._options('host', 'localhost')).to.equal('localhost');

      var pipe = new Pipe(http.createServer(), {
          pagelets: __dirname +'/fixtures/pagelets'
        , dist: '/tmp/dist'
        , host: '127.0.0.1'
      });

      expect(pipe._options('host')).to.equal('127.0.0.1');
    });

    it('additional options can be merged, per example from a plugin', function () {
      expect(app._options.merge).to.be.a('function');
      expect(app._options('test')).to.equal(undefined);

      var pipe = new Pipe(http.createServer(), {
          pagelets: __dirname +'/fixtures/pagelets'
        , dist: '/tmp/dist'
        , host: '127.0.0.1'
      });

      expect(pipe._options('host')).to.equal('127.0.0.1');
      pipe._options.merge({ test: 'additional' });
      expect(pipe._options('test')).to.equal('additional');
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

        expect(app._pagelets).to.have.length(1);
        expect(app._pagelets[0]).to.be.an('function');

        next();
      });
    });

    it('will resolve and add the pagelets if directory', function (next) {
      app = new Pipe(server, {
        dist: '/tmp/dist'
      });

      app.define(__dirname + '/fixtures/pagelets', function (err) {
        if (err) return next(err);

        expect(app._pagelets).to.have.length(4);
        app._pagelets.forEach(function (pagelet) {
          expect(pagelet.prototype).to.have.property('id');
        });

        next();
      });
    });
  });

  describe('.discover', function () {
    it('provides default pagelets if no /404 or /500 is found', function () {
      expect(app._statusCodes[404]).to.equal(require('404-pagelet'));
      expect(app._statusCodes[500]).to.equal(require('500-pagelet'));
    });

    it('uses default bootstrap Pagelet if none is provided', function () {
      expect(app._bootstrap).to.equal(require('bootstrap-pagelet'));
    });

    it('uses provided 404 and 500 pagelets based on routes', function (done) {
      var custom = new Pipe(server, {
        dist: '/tmp/dist'
      }).define(__dirname + '/fixtures/discover', function () {
        var Fourofour = require('404-pagelet')
          , Fivehundred = require('500-pagelet');

        expect(custom._pagelets).to.have.length(0);
        expect(custom._statusCodes[404].prototype.view).to.not.equal(Fourofour.prototype.view);
        expect(custom._statusCodes[404].prototype.pagelets).to.not.equal(Fourofour.prototype.pagelets);

        expect(custom._statusCodes[500].prototype.view).to.not.equal(Fivehundred.prototype.view);
        expect(custom._statusCodes[500].prototype.pagelets).to.not.equal(Fivehundred.prototype.pagelets);
        done();
      });
    });

    it('uses provided bootstrap pagelet based on name', function (done) {
      var custom = new Pipe(server, {
        dist: '/tmp/dist'
      }).define(__dirname + '/fixtures/bootstrapper', function () {
        var Bootstrap = require('bootstrap-pagelet');

        expect(custom._pagelets).to.have.length(0);
        expect(custom._bootstrap.prototype.view).to.not.equal(Bootstrap.prototype.view);
        expect(custom._bootstrap.prototype.title).to.not.equal(Bootstrap.prototype.title);
        done();
      });;

      expect(custom._pagelets).to.have.length(0);
      expect(custom._bootstrap).to.not.equal(require('bootstrap-pagelet'));
    });
  });

  describe('.resolve', function () {
    it('omits any directories from the pagelets directory without an index.js', function () {
      app = new Pipe(server, {
        pagelets: __dirname + '/fixtures/discover',
        dist: '/tmp/dist'
      });

      app._pagelets.forEach(function (pagelets) {
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
        pipe._server.close(done);
      });

      pipe.listen(common.port);
    });
  });

  describe('.createServer', function () {
    it('is a function', function () {
      expect(Pipe.createServer).to.be.a('function');
      expect(Pipe.createServer.length).to.equal(2);
    });

    it('has optional port argument that defaults to 8080', function (done) {
      var pipe = Pipe.createServer({
        dist: '/tmp/dist'
      });

      expect(pipe._options('port')).to.equal(8080);
      pipe.once('listening', done);
    });

    it('will call .listen as soon as the server is completely initialized', function (done) {
      var pipe = Pipe.createServer(common.port, {
        dist: '/tmp/dist'
      });

      pipe.once('listening', done);
    });
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

      pagelet._res.setHeader = function setHeader(header, value) {
        expect(header).to.equal('Location');
        expect(value).to.equal('/redirected');
      };

      pagelet._res.end = function end() {
        expect(pagelet._res.statusCode).to.equal(301);
        done();
      };

      app.redirect(pagelet, '/redirected');
    });

    it('allows to set custom statusCode', function (done) {
      var pagelet = new Pipe.Pagelet({res: {}, pipe: app });

      pagelet._res.setHeader = function setHeader(header, value) {
        expect(header).to.equal('Location');
        expect(value).to.equal('/redirected');
      };

      pagelet._res.end = function end() {
        expect(pagelet._res.statusCode).to.equal(400);
        done();
      };

      app.redirect(pagelet, '/redirected', 400);
    });
  });
});
