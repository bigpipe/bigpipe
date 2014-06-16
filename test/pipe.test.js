describe('Pipe', function () {
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

  it('exposes the Page constructor', function () {
    expect(Pipe.Page).to.be.a('function');
    expect(Pipe.Page.extend).to.be.a('function');
  });

  it('exposes the Pagelet constructor', function () {
    expect(Pipe.Pagelet).to.be.a('function');
    expect(Pipe.Pagelet.extend).to.be.a('function');
  });

  it('is an EvenEmitter3', function () {
    expect(app).to.be.instanceOf(require('eventemitter3'));
  });

  it('correctly resolves `pages` as a string to an array', function () {
    expect(app.pages).to.be.a('array');
    expect(app.pages).to.have.length(5);
  });

  it('transforms pages', function () {
    var Page = app.pages[0];

    expect(Page.router).to.be.instanceOf(require('routable'));
    expect(Page.method).to.be.a('array');
  });

  describe('#options', function () {
    it('has queryable options with defaults', function () {
      expect(app.options).to.be.a('function');
      expect(app.options('host')).to.equal(undefined);
      expect(app.options('host', 'localhost')).to.equal('localhost');

      var pipe = new Pipe(http.createServer(), {
          pages: __dirname +'/fixtures/pages'
        , dist: '/tmp/dist'
        , host: '127.0.0.1'
      });

      expect(pipe.options('host')).to.equal('127.0.0.1');
    });

    it('additional options can be merged, per example from a plugin', function () {
      expect(app.options.merge).to.be.a('function');
      expect(app.options('test')).to.equal(undefined);

      var pipe = new Pipe(http.createServer(), {
          pages: __dirname +'/fixtures/pages'
        , dist: '/tmp/dist'
        , host: '127.0.0.1'
      });
      expect(pipe.options('host')).to.equal('127.0.0.1');
      pipe.options.merge({ test: 'additional' });
      expect(pipe.options('test')).to.equal('additional');
    });
  });

  describe('#router', function () {
    function Request(url, method) {
      this.url = url;
      this.uri = require('url').parse(url, true);
      this.query = this.uri.query || {};
      this.method = method || 'GET';
    }

    it('finds the / page', function (done) {
      app.router(new Request('/'), {}, function (err, page) {
        if (err) return done(err);

        expect(page).to.be.instanceOf(Pipe.Page);
        expect(page.statusCode).to.equal(200);

        done();
      });
    });

    it('doesnt find / for POST requests', function (done) {
      app.router(new Request('/', 'POST'), {}, function (err, page) {
        if (err) return done(err);

        expect(page).to.be.instanceOf(Pipe.Page);
        expect(page.statusCode).to.equal(404);

        done();
      });
    });

    ['GET', 'POST', 'MOO'].forEach(function (method) {
      it('finds /all for '+ method, function (done) {
        app.router(new Request('/all', method), {}, function (err, page) {
          if (err) return done(err);

          expect(page).to.be.instanceOf(Pipe.Page);
          expect(page.statusCode).to.equal(200);

          done();
        });
      });
    });

    it('always returns a 404 page for unknown urls', function (done) {
      app.router(new Request('/'+ Math.random(), 'POST'), {}, function (err, page) {
        if (err) return done(err);

        expect(page).to.be.instanceOf(Pipe.Page);
        expect(page.statusCode).to.equal(404);

        done();
      });
    });

    it('adds and retrieves pages from a provided cache', function (done) {
      var cache = {
        get: function (url) {
          expect(url).to.equal('GET@/');
          pattern.push('get');
          return cache.page;
        },
        set: function (url, page) {
          expect(url).to.equal('GET@/');
          expect(page).to.be.a('array');
          pattern.push('set');
          cache.page = page;
        }
      };

      var pattern = [];

      app = new Pipe(server, {
          pages: __dirname + '/fixtures/pages'
        , dist: '/tmp/dist'
        , cache: cache
      });

      app.router(new Request('/'), {}, function (err, page) {
        if (err) return done(err);

        expect(page).to.be.instanceOf(Pipe.Page);
        expect(page.statusCode).to.equal(200);

        app.router(new Request('/'), {}, function (err, page) {
          if (err) return done(err);

          expect(page).to.be.instanceOf(Pipe.Page);
          expect(page.statusCode).to.equal(200);
          expect(pattern.join()).to.equal('get,set,get');

          done();
        });
      });
    });
  });

  describe('#define', function () {
    it('adds the Page to the pages collection', function (next) {
      var faq = require(__dirname + '/fixtures/pages/faq');
      app.define(faq, function (err) {
        if (err) return next(err);

        expect(app.pages).to.have.length(6);
        expect(app.pages[2]).to.be.an('function');
        faq.prototype.dependencies = [];

        next();
      });
    });

    it('will resolve and add the page if directory or array', function (next) {
      app.define(__dirname + '/fixtures/pages', function (err) {
        if (err) return next(err);

        expect(app.pages).to.have.length(8);
        app.pages.forEach(function (page) {
          expect(page).to.have.property('id');
        });

        next();
      });
    });
  });

  describe('#discover', function () {
    it('provides default pages if no /404 or /500 is found', function () {
      expect(app.statusCodes[404]).to.equal(require('../pages/404'));
      expect(app.statusCodes[500]).to.equal(require('../pages/500'));
    });

    it('uses user provided 404 and 500 pages based on routes', function () {
      app = new Pipe(server, {
        pages: __dirname + '/fixtures/discover',
        dist: '/tmp/dist'
      });

      expect(app.pages).to.have.length(2);
      expect(app.statusCodes[404]).to.not.equal(require('../pages/404'));
      expect(app.statusCodes[500]).to.not.equal(require('../pages/500'));
    });
  });

  describe('#resolve', function () {
    it('omits any directories from the read of the pages directory', function () {
      app = new Pipe(server, {
        pages: __dirname + '/fixtures/pages',
        dist: '/tmp/dist'
      });

      app.pages.forEach(function (page) {
        expect(page.id).to.not.match(/^dummy/);
      });
    });
  });

  describe('#listen', function () {
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
});
