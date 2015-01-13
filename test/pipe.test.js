describe('Pipe', function () {
  'use strict';

  var common = require('./common')
    , Compiler = require('../lib/compiler')
    , http = require('http')
    , assume = require('assume')
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
    assume(Pipe.Pagelet).to.be.a('function');
    assume(Pipe.Pagelet.extend).to.be.a('function');
  });

  it('is an EvenEmitter3', function () {
    assume(app).to.be.instanceOf(require('eventemitter3'));
  });

  it('correctly resolves `pagelets` as a string to an array', function () {
    assume(app._pagelets).to.be.a('array');
    assume(app._pagelets).to.have.length(4);
  });

  it('transforms pagelets', function () {
    var Pagelet = app._pagelets[0];

    assume(Pagelet.method).to.be.a('array');
  });

  it('has supply middleware manager', function () {
    assume(app).to.have.property('middleware');
    assume(app.middleware).to.be.an('object');
    assume(app.middleware).to.be.instanceof(require('supply'));
  });

  it('has zipline to handle gzip compression', function () {
    assume(app).to.have.property('_zipline');
    assume(app._zipline).to.be.an('object');
    assume(app._zipline).to.be.instanceof(require('zipline'));
  });

  it('has compiler for asset management', function () {
    assume(app).to.have.property('_compiler');
    assume(app._compiler).to.be.an('object');
    assume(app._compiler).to.be.instanceof(Compiler);
  });

  it('has temper instance for template rendering', function () {
    assume(app).to.have.property('_temper');
    assume(app._temper).to.be.an('object');
    assume(app._temper).to.be.instanceof(require('temper'));
  });

  it('does not cache by default', function () {
    assume(app).to.have.property('_cache');
    assume(app._cache).to.equal(false);
  });

  describe('_options', function () {
    it('has queryable options with defaults', function () {
      assume(app._options).to.be.a('function');
      assume(app._options('host')).to.equal(undefined);
      assume(app._options('host', 'localhost')).to.equal('localhost');

      var pipe = new Pipe(http.createServer(), {
        pagelets: __dirname +'/fixtures/pagelets',
        dist: '/tmp/dist',
        host: '127.0.0.1'
      });

      assume(pipe._options('host')).to.equal('127.0.0.1');
    });

    it('additional options can be merged, per example from a plugin', function () {
      assume(app._options.merge).to.be.a('function');
      assume(app._options('test')).to.equal(undefined);

      var pipe = new Pipe(http.createServer(), {
        pagelets: __dirname +'/fixtures/pagelets',
        dist: '/tmp/dist',
        host: '127.0.0.1'
      });

      assume(pipe._options('host')).to.equal('127.0.0.1');
      pipe._options.merge({ test: 'additional' });
      assume(pipe._options('test')).to.equal('additional');
    });
  });

  describe('.initialize', function () {
    it('loads default middleware', function () {
      assume(app.middleware.layers[0]).to.have.property('name', 'defaults');
      assume(app.middleware.layers[1]).to.have.property('name', 'zipline');
      assume(app.middleware.layers[2]).to.have.property('name', 'compiler');
    });

    it('plugs in the provided plugins', function () {
      app.initialize(function optionStub() {
        return [{
          name: 'test',
          server: function noop() { }
        }];
      });

      assume(app._plugins).is.an('object');
      assume(app._plugins.test).is.a('object');
      assume(app._plugins.test).to.have.property('name', 'test');
      assume(app._plugins.test.server).to.be.a('function');
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

        assume(pagelet).to.be.instanceOf(Pipe.Pagelet);
        assume(pagelet.statusCode).to.equal(200);

        done();
      });
    });

    it('doesnt find / for POST requests', function (done) {
      app.router(new Request('/', 'POST'), {}, function (err, pagelet) {
        if (err) return done(err);

        assume(pagelet).to.be.instanceOf(Pipe.Pagelet);
        assume(pagelet.statusCode).to.equal(404);

        done();
      });
    });

    ['GET', 'POST', 'MOO'].forEach(function (method) {
      it('finds /all for '+ method, function (done) {
        app.router(new Request('/all', method), {}, function (err, pagelet) {
          if (err) return done(err);

          assume(pagelet).to.be.instanceOf(Pipe.Pagelet);
          assume(pagelet.statusCode).to.equal(200);

          done();
        });
      });
    });

    it('always returns a 404 page for unknown urls', function (done) {
      app.router(new Request('/'+ Math.random(), 'POST'), {}, function (err, pagelet) {
        if (err) return done(err);

        assume(pagelet).to.be.instanceOf(Pipe.Pagelet);
        assume(pagelet.statusCode).to.equal(404);

        done();
      });
    });

    it('adds and retrieves pagelets from a provided cache', function (done) {
      var cache = {
        get: function (url) {
          assume(url).to.equal('GET@/');
          pattern.push('get');
          return cache.pagelet;
        },
        set: function (url, pagelet) {
          assume(url).to.equal('GET@/');
          assume(pagelet).to.be.a('array');
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

          assume(pagelet).to.be.instanceOf(Pipe.Pagelet);
          assume(pagelet.statusCode).to.equal(200);

          local.router(new Request('/'), {}, function (err, pagelet) {
            if (err) return done(err);

            assume(pagelet).to.be.instanceOf(Pipe.Pagelet);
            assume(pagelet.statusCode).to.equal(200);
            assume(pattern.join()).to.equal('get,set,get');

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

        assume(app._pagelets).to.have.length(1);
        assume(app._pagelets[0]).to.be.an('function');

        next();
      });
    });

    it('will resolve and add the pagelets if directory', function (next) {
      app = new Pipe(server, {
        dist: '/tmp/dist'
      });

      app.define(__dirname + '/fixtures/pagelets', function (err) {
        if (err) return next(err);

        assume(app._pagelets).to.have.length(4);
        app._pagelets.forEach(function (pagelet) {
          assume(pagelet.prototype).to.have.property('id');
        });

        next();
      });
    });
  });

  describe('.discover', function () {
    it('provides default pagelets if no /404 or /500 is found', function () {
      assume(app._statusCodes[404]).to.equal(require('404-pagelet'));
      assume(app._statusCodes[500]).to.equal(require('500-pagelet'));
    });

    it('uses default bootstrap Pagelet if none is provided', function () {
      assume(app._bootstrap).to.equal(require('bootstrap-pagelet'));
    });

    it('uses provided 404 and 500 pagelets based on routes', function (done) {
      var custom = new Pipe(server, {
        dist: '/tmp/dist'
      }).define(__dirname + '/fixtures/discover', function () {
        var Fourofour = require('404-pagelet')
          , Fivehundred = require('500-pagelet');

        assume(custom._pagelets).to.have.length(0);
        assume(custom._statusCodes[404].prototype.view).to.not.equal(Fourofour.prototype.view);
        assume(custom._statusCodes[404].prototype.pagelets).to.not.equal(Fourofour.prototype.pagelets);

        assume(custom._statusCodes[500].prototype.view).to.not.equal(Fivehundred.prototype.view);
        assume(custom._statusCodes[500].prototype.pagelets).to.not.equal(Fivehundred.prototype.pagelets);
        done();
      });
    });

    it('uses provided bootstrap pagelet based on name', function (done) {
      var custom = new Pipe(server, {
        dist: '/tmp/dist'
      }).define(__dirname + '/fixtures/bootstrapper', function () {
        var Bootstrap = require('bootstrap-pagelet');

        assume(custom._pagelets).to.have.length(0);
        assume(custom._bootstrap.prototype.view).to.not.equal(Bootstrap.prototype.view);
        assume(custom._bootstrap.prototype.title).to.not.equal(Bootstrap.prototype.title);
        done();
      });;

      assume(custom._pagelets).to.have.length(0);
      assume(custom._bootstrap).to.not.equal(require('bootstrap-pagelet'));
    });
  });

  describe('.resolve', function () {
    it('omits any directories from the pagelets directory without an index.js', function () {
      app = new Pipe(server, {
        pagelets: __dirname + '/fixtures/discover',
        dist: '/tmp/dist'
      });

      app._pagelets.forEach(function (pagelets) {
        assume(pagelets.id).to.not.match(/^dummy/);
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
      assume(Pipe.createServer).to.be.a('function');
      assume(Pipe.createServer.length).to.equal(2);
    });

    it('has optional port argument that defaults to 8080', function (done) {
      var pipe = Pipe.createServer({
        dist: '/tmp/dist'
      });

      assume(pipe._options('port')).to.equal(8080);
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

      assume(Pipe.prototype).to.have.property('redirect');
      assume(Pipe.prototype.redirect).to.be.a('function');
      assume(property.writable).to.equal(false);
      assume(property.enumerable).to.equal(false);
      assume(property.configurable).to.equal(false);

      pagelet._res.setHeader = function setHeader(header, value) {
        assume(header).to.equal('Location');
        assume(value).to.equal('/redirected');
      };

      pagelet._res.end = function end() {
        assume(pagelet._res.statusCode).to.equal(301);
        done();
      };

      app.redirect(pagelet, '/redirected');
    });

    it('allows to set custom statusCode', function (done) {
      var pagelet = new Pipe.Pagelet({res: {}, pipe: app });

      pagelet._res.setHeader = function setHeader(header, value) {
        assume(header).to.equal('Location');
        assume(value).to.equal('/redirected');
      };

      pagelet._res.end = function end() {
        assume(pagelet._res.statusCode).to.equal(400);
        done();
      };

      app.redirect(pagelet, '/redirected', 400);
    });
  });
});
