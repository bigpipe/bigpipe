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

    app = new Pipe(server, __dirname + '/fixtures/pages', {
      domains: true
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

  it('exposes the Resource constructor', function () {
    expect(Pipe.Resource).to.be.a('function');
    expect(Pipe.Resource.extend).to.be.a('function');
  });

  it('is an EvenEmitter', function () {
    expect(app).to.be.instanceOf(process.EventEmitter);
  });

  it('correctly resolves `pages` as a string to an array', function () {
    expect(app.pages).to.be.a('array');
    expect(app.pages).to.have.length(2);
  });

  it('transforms pages', function () {
    var Page = app.pages[0];

    expect(Page.router).to.be.instanceOf(require('routable'));
    expect(Page.method).to.be.a('array');
  });

  describe('#find', function () {
    it('returns the matching page', function () {
      expect(app.find('/')).to.be.a('function');
      expect(app.find('/', 'GET')).to.be.a('function');
      expect(app.find('/', 'POST')).to.not.be.a('function');
      expect(app.find('/all')).to.be.a('function');
      expect(app.find('/all', 'POST')).to.be.a('function');
      expect(app.find('/all', 'GET')).to.be.a('function');
      expect(app.find('/all', 'MOO')).to.be.a('function');
    });

    it('returns undefined when no route is found', function () {
      expect(app.find('/bananananananaanaanananan')).to.be.a('undefined');
    });

    it('adds and retrieves pages from a provided cache', function () {
      var cache = {
        get: function (url) {
          expect(url).to.equal('/');
          pattern.push('get');
          return cache.page;
        },
        set: function (url, page) {
          expect(url).to.equal('/');
          expect(page).to.be.a('function');
          pattern.push('set');
          cache.page = page;
        },
        has: function (url) {
          expect(url).to.equal('/');
          pattern.push('has');
          return !!cache.page;
        }
      };

      var pattern = [];

      app = new Pipe(server, __dirname + '/fixtures/pages', {
        cache: cache
      });

      expect(app.find('/')).to.be.a('function');
      expect(app.find('/')).to.be.a('function');
      expect(pattern.join()).to.equal('has,set,has,get');
    });
  });

  describe('#log', function () {
    it('doesnt write to stdout if we dont provide a stream', function (done) {
      app = new Pipe(server, __dirname + '/fixtures/pages', {
        domains: true,
        stream: null
      });

      app.on('log', function (type, arg1, arg2) {
        expect(type).to.equal('warn');
        expect(arg1).to.equal('foo');
        expect(arg2).to.equal('bar');

        done();
      });

      app.log('warn', 'foo', 'bar');
    });

    it('writes to specified stream', function (done) {
      var stream = new (require('stream'));

      stream.write = function (line) {
        expect(line).to.not.contain('warn');
        expect(line).to.contain(Pipe.prototype.log.levels.warn);
        expect(line).to.contain('foo');
        expect(line).to.contain('bar');

        console.log(line);

        done();
      };

      app = new Pipe(server, __dirname + '/fixtures/pages', {
        domains: true,
        stream: stream
      });

      app.log('warn', 'foo', 'bar');
    });
  });

  describe('#discover', function () {
    it('provides default pages if no /404 or /500 is found', function () {
      expect(app.find('/404')).to.equal(undefined);
      expect(app.find('/500')).to.equal(undefined);

      expect(app.statusCodes[404]).to.equal(require('../pages/404'));
      expect(app.statusCodes[500]).to.equal(require('../pages/500'));
    });

    it('uses user provided 404 and 500 pages based on routes', function () {
      app = new Pipe(server, __dirname + '/fixtures/discover');
      expect(app.pages).to.have.length(2);

      expect(app.find('/404')).to.not.equal(undefined);
      expect(app.find('/500')).to.not.equal(undefined);

      expect(app.statusCodes[404]).to.equal(app.find('/404'));
      expect(app.statusCodes[500]).to.equal(app.find('/500'));
    });
  });

  describe('#decorate', function () {
    function url() {
      return {
        url: '/foo/bar?bar=baz'
      };
    }

    it('parses the url', function () {
      var req = url();
      app.decorate(req);

      expect(req.uri).to.be.an('object');
      expect(req.uri.pathname).to.be.a('string');
      expect(req.uri.query).to.be.a('object');
    });

    it('adds a pointless originalUrl for connect compatiblity', function () {
      var req = url();
      app.decorate(req);

      expect(req.url).to.equal(req.originalUrl);
    });

    it('parses the query string', function () {
      var req = url();
      app.decorate(req);

      expect(req.query).to.equal(req.uri.query);
      expect(req.query.bar).to.equal('baz');
    });
  });
});
