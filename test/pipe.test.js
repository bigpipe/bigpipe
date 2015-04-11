describe('BigPipe', function () {
  'use strict';

  var All = require('./fixtures/pagelets/all')
    , Compiler = require('../lib/compiler')
    , Fittings = require('fittings')
    , common = require('./common')
    , Pagelet = require('pagelet')
    , assume = require('assume')
    , http = require('http')
    , Response = common.Response
    , Request = common.Request
    , BigPipe = common.BigPipe
    , server
    , app;

  this.timeout(30000);

  beforeEach(function (done) {
    server = http.createServer(function () {
      throw new Error('Unhandled request');
    });

    app = new BigPipe(server, {
      pagelets: __dirname +'/fixtures/pagelets',
      dist: '/tmp/dist'
    }).listen(common.port, done);
  });

  afterEach(function (done) {
    server.close(done);
  });

  it('has fallback if called as function without new', function () {
    assume(BigPipe()).to.be.instanceof(BigPipe);
  });

  it('has defaults for options', function () {
    var bigpipe = new BigPipe(http.createServer());

    assume(bigpipe).to.have.property('_options');
    assume(bigpipe._options).to.have.property('merge');
  });

  it('is an EvenEmitter3', function () {
    assume(app).to.be.instanceOf(require('eventemitter3'));
  });

  it('exposes the current version', function () {
    assume(app.version).to.equal(require(process.cwd() +'/package.json').version);
  });

  it('correctly resolves `pagelets` as a string to an array', function () {
    assume(app._pagelets).to.be.a('array');
    assume(app._pagelets).to.have.length(12);
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

  it('can be initialized with a custom Framework', function () {
    var Framework = Fittings.extend({
      name: 'moo'
    });

    app = new BigPipe(server, {
      pagelets: __dirname +'/fixtures/pagelets',
      framework: Framework,
      dist: '/tmp/dist'
    });

    assume(app._framework.name).equals('moo');
  });

  describe('.framework', function () {
    it('has a framework method', function () {
      assume(app.framework).is.a('function');
    });

    it('assigns a new internal Framework', function () {
      var Framework = Fittings.extend({ name: 'test' });

      assume(app.framework(Framework)).equals(app);
      assume(app._framework).is.instanceOf(Framework);
    });
  });

  describe('.metrics', function () {
    it('has a metrics object', function () {
      assume(app.metrics).is.a('object');
    });

    it('emits `metrics:*` events when calling the methods', function (next) {
      var order = [];

      function receive(name) {
        order.push(name);

        if (order.length !== 5) return;

        assume(order[0]).equals('increment');
        assume(order[1]).equals('decrement');
        assume(order[2]).equals('timing');
        assume(order[3]).equals('gauge');
        assume(order[4]).equals('set');

        next();
      }

      app.on('metrics:increment', receive.bind(0, 'increment'))
         .on('metrics:decrement', receive.bind(0, 'decrement'))
         .on('metrics:timing', receive.bind(0, 'timing'))
         .on('metrics:gauge', receive.bind(0, 'gauge'))
         .on('metrics:set', receive.bind(0, 'set'));

      app.metrics.increment();
      app.metrics.decrement();
      app.metrics.timing();
      app.metrics.gauge();
      app.metrics.set();
    });

    it('receives the supplied arguments', function (next) {
      app.once('metrics:gauge', function (name, value) {
        assume(name).equals('http.concurrent');
        assume(value).equals(100);

        next();
      });

      app.metrics.gauge('http.concurrent', 100);
    });

    it('can be overriden using a statsd instance', function (next) {
      //
      // We're going to fake the client here as we implement the same API
      // interface.
      //
      var metrics = { increment: function increment() {
        next();
      }};

      var bigpipe = new BigPipe(http.createServer(), {
        metrics: metrics
      });

      assume(bigpipe.metrics).equals(metrics);
      bigpipe.metrics.increment();
    });
  });

  describe('_options', function () {
    it('has queryable options with defaults', function () {
      assume(app._options).to.be.a('function');
      assume(app._options('host')).to.equal(undefined);
      assume(app._options('host', 'localhost')).to.equal('localhost');

      var bigpipe = new BigPipe(http.createServer(), {
        pagelets: __dirname +'/fixtures/pagelets',
        dist: '/tmp/dist',
        host: '127.0.0.1'
      });

      assume(bigpipe._options('host')).to.equal('127.0.0.1');
    });

    it('additional options can be merged, per example from a plugin', function () {
      assume(app._options.merge).to.be.a('function');
      assume(app._options('test')).to.equal(undefined);

      var bigpipe = new BigPipe(http.createServer(), {
        pagelets: __dirname +'/fixtures/pagelets',
        dist: '/tmp/dist',
        host: '127.0.0.1'
      });

      assume(bigpipe._options('host')).to.equal('127.0.0.1');
      bigpipe._options.merge({ test: 'additional' });
      assume(bigpipe._options('test')).to.equal('additional');
    });
  });

  describe('.initialize', function () {
    it('is a function', function () {
      assume(app.initialize).is.a('function');
      assume(app.initialize.length).to.equal(1);
    });

    it('loads default middleware', function () {
      assume(app.middleware.layers[0]).to.have.property('name', 'defaults');
      assume(app.middleware.layers[1]).to.have.property('name', 'zipline');
      assume(app.middleware.layers[2]).to.have.property('name', 'compiler');
    });

    it('plugs in the provided plugins', function () {
      app.initialize(function optionStub(what, defaults) {
        if (what === 'framework') return Fittings.extend({
          name: 'lol, stubbed'
        });

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
    var bigpipeById = new BigPipe(http.createServer(), {
      dist: '/tmp/dist',
      pagelets: {
        tester: Pagelet.extend({
          name: 'tester',
          view: __dirname +'/fixtures/view/all.html'
        }),

        index: Pagelet.extend({
          path: '/',
          view: __dirname +'/fixtures/view/all.html'
        })
      }
    });

    it('finds the / pagelet', function (done) {
      app.once('bootstrap', function (pagelet, req, res) {
        assume(pagelet).to.be.instanceOf(Pagelet);
        assume(pagelet.statusCode).to.equal(200);

        done();
      });

      app.router(new Request('/'), new Response());
    });

    it('can route to specific pagelets by id', function (done) {
      bigpipeById.listen(common.port, function () {
        var local = bigpipeById._pagelets[0].prototype
          , id = local.id
          , name = local.name
          , view = local.view
          , path = local.path;

        bigpipeById.once('bootstrap', function (pagelet) {
          assume(pagelet).to.be.instanceOf(Pagelet);
          assume(pagelet.view).to.equal(view);
          assume(pagelet.name).to.equal(name);
          assume(pagelet.path).to.equal(path);

          bigpipeById._server.close(done);
        });

        bigpipeById.router(new Request('/'), new Response(), id);
      });
    });

    it('will return 404 if the specified id cannot be found', function (done) {
      bigpipeById.listen(common.port, function () {
        var id = bigpipeById._pagelets[0].prototype.id;

        bigpipeById.once('bootstrap', function (pagelet) {
          assume(pagelet).to.be.instanceOf(require('404-pagelet'));
          assume(pagelet.name).to.equal('404');
          assume(pagelet.path).to.equal('/404');

          bigpipeById._server.close(done);
        });

        bigpipeById.router(new Request('/'), new Response(), 'some random id');
      });
    });

    it('doesnt find / for POST requests', function (done) {
      app.once('bootstrap', function (pagelet) {
        assume(pagelet).to.be.instanceOf(require('404-pagelet'));
        assume(pagelet.statusCode).to.equal(404);
        done();
      });

      app.router(new Request('/', 'POST'), new Response());
    });

    ['GET', 'POST', 'MOO'].forEach(function (method) {
      it('finds /all for '+ method, function (done) {
        app.once('bootstrap', function (pagelet) {
          assume(pagelet).to.be.instanceOf(Pagelet);
          assume(pagelet.statusCode).to.equal(200);

          done();
        });

        app.router(new Request('/all', method), new Response());
      });
    });

    it('always returns a 404 page for unknown urls', function (done) {
      app.once('bootstrap', function (pagelet) {
        assume(pagelet).to.be.instanceOf(require('404-pagelet'));
        assume(pagelet.statusCode).to.equal(404);

        done();
      });

      app.router(new Request('/'+ Math.random(), 'POST'), new Response());
    });

    it('returns authorized conditional pagelet', function (done) {
      var notAllowedCalled = false
        , bigpipeIf = new BigPipe(http.createServer(), {
            dist: '/tmp/dist',
            pagelets: {
              notallowed: Pagelet.extend({
                path: '/',
                view: __dirname +'/fixtures/view/all.html',
                if: function (req, fn) {
                  assume(req.url).to.equal('/');
                  notAllowedCalled = true;
                  fn(false);
                }
              }),

              allowed: Pagelet.extend({
                path: '/',
                view: __dirname +'/fixtures/view/all.html',
                if: function (req, fn) { fn(true); }
              })
            }
          });

      bigpipeIf.listen(common.port, function () {
        bigpipeIf.once('bootstrap', function (pagelet) {
          assume(notAllowedCalled).to.equal(true);
          assume(pagelet).to.be.instanceOf(Pagelet);
          assume(pagelet.name).to.equal('allowed');
          assume(pagelet.name).to.not.equal('notallowed');

          bigpipeIf._server.close(done);
        });

        bigpipeIf.router(new Request('/'), new Response());
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

      var local = new BigPipe(server, {
        dist: '/tmp/dist',
        cache: cache
      });

      local.define(__dirname +'/fixtures/pagelets', function define() {
        local.once('bootstrap', function (pagelet) {
          assume(pagelet).to.be.instanceOf(Pagelet);
          assume(pagelet.statusCode).to.equal(200);

          local.once('bootstrap', function (pagelet) {
            assume(pagelet).to.be.instanceOf(Pagelet);
            assume(pagelet.statusCode).to.equal(200);
            assume(pattern.join()).to.equal('get,set,get');

            done();
          });

          local.router(new Request('/'), new Response());
        });

        local.router(new Request('/'), new Response());
      });
    });
  });

  describe('.define', function () {
    it('adds Pagelet to the pagelets collection', function (next) {
      var faq = require(__dirname + '/fixtures/pagelets/faq')
       ,  bigpipe = new BigPipe(server, {
            dist: '/tmp/dist'
          });

      bigpipe.define(faq, function (err) {
        if (err) return next(err);

        assume(bigpipe._pagelets).to.have.length(1);
        assume(bigpipe._pagelets[0]).to.be.an('function');

        next();
      });
    });

    it('will resolve and add the pagelets if directory', function (next) {
      var bigpipe = new BigPipe(server, {
        dist: '/tmp/dist'
      });

      bigpipe.define(__dirname + '/fixtures/pagelets', function (err) {
        if (err) return next(err);

        assume(bigpipe._pagelets).to.have.length(12);
        bigpipe._pagelets.forEach(function (pagelet) {
          assume(pagelet.prototype).to.have.property('id');
        });

        next();
      });
    });
  });

  describe('.discover', function () {
    it('is a function', function () {
      assume(app.discover).to.be.a('function');
      assume(app.discover.length).to.equal(1);
    });

    it('returns an error if the pagelets or middleware are invalid', function (done) {
      var bigpipe = new BigPipe(http.createServer(), {
        dist: '/tmp/dist'
      });

      bigpipe.once('transform:pagelet:after', function (Pagelet, next) {
        return next(new Error('middleware failed'));
      });

      bigpipe.discover(function (error) {
        assume(error).to.be.instanceof(Error);
        assume(error.message).to.include('middleware failed');
        done();
      });
    });

    it('provides default pagelets if no /404 or /500 is found', function () {
      assume(app._statusCodes[404]).to.equal(require('404-pagelet'));
      assume(app._statusCodes[500]).to.equal(require('500-pagelet'));
    });

    it('uses default bootstrap Pagelet if none is provided', function () {
      assume(app._bootstrap).to.equal(require('bootstrap-pagelet'));
    });

    it('uses provided 404 and 500 pagelets based on routes', function (done) {
      var custom = new BigPipe(server, {
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
      var custom = new BigPipe(server, {
        dist: '/tmp/dist'
      }).define(__dirname + '/fixtures/bootstrapper', function () {
        var Bootstrap = require('bootstrap-pagelet');

        assume(custom._pagelets).to.have.length(0);
        assume(custom._bootstrap.prototype.view).to.not.equal(Bootstrap.prototype.view);
        assume(custom._bootstrap.prototype.title).to.not.equal(Bootstrap.prototype.title);
        done();
      });

      assume(custom._pagelets).to.have.length(0);
      assume(custom._bootstrap).to.not.equal(require('bootstrap-pagelet'));
    });
  });

  describe('.resolve', function () {
    it('omits any directories from the pagelets directory without an index.js', function () {
      var bigpipe = new BigPipe(server, {
        pagelets: __dirname + '/fixtures/discover',
        dist: '/tmp/dist'
      });

      bigpipe._pagelets.forEach(function (pagelets) {
        assume(pagelets.id).to.not.match(/^dummy/);
      });
    });
  });

  describe('.listen', function () {
    it('is a function', function () {
      assume(app.listen).to.be.a('function');
      assume(app.listen.length).to.equal(2);
    });

    it('returns an error if define fails', function (done) {
      var bigpipe = new BigPipe(http.createServer(), {
        pagelets: {
          failure: require('pagelet').extend({
            view: undefined
          })
        }
      });

      bigpipe.listen(common.port, function (error) {
        assume(error).to.be.instanceof(Error);
        assume(error.message).to.include('should have a .view property');
        done();
      });
    });

    it('emits the error if no callback is provided', function (done) {
        var bigpipe = new BigPipe(http.createServer(), {
          pagelets: {
            failure: require('pagelet').extend({
              view: undefined
            })
          }
        });

        bigpipe.once('error', function (error) {
          assume(error).to.be.instanceof(Error);
          assume(error.message).to.include('should have a .view property');
          done();
        });

        bigpipe.listen(common.port);
    });

    it('proxies event listeners', function (done) {
      //
      // Set a big timeout as we might need to lazy install dependencies
      //
      this.timeout(500E3);

      var bigpipe = new BigPipe(http.createServer(), {
        dist: '/tmp/dist'
      });

      bigpipe.once('listening', function () {
        bigpipe._server.close(done);
      });

      bigpipe.listen(common.port, function () {
        assume(bigpipe._server._events).to.have.property('listening');
        assume(bigpipe._server._events.listening[0]).to.be.a('function');
        assume(bigpipe._server._events.listening[0].toString()).to.equal(bigpipe.emits('listening').toString());
        assume(bigpipe._server._events).to.have.property('request');
        assume(bigpipe._server._events.request).to.be.a('function');
        assume(bigpipe._server._events.request.toString()).to.equal(bigpipe.bind(bigpipe.dispatch).toString());
        assume(bigpipe._server._events).to.have.property('error');
        assume(bigpipe._server._events.error).to.be.a('function');
        assume(bigpipe._server._events.error.toString()).to.equal(bigpipe.emits('error').toString());
      });
    });

    it('will define and process the provided pagelets', function (done) {
      var bigpipe = new BigPipe(http.createServer(), {
        pagelets: __dirname +'/fixtures/pagelets',
        dist: '/tmp/dist'
      });

      bigpipe.once('listening', function () {
        assume(bigpipe._pagelets.length).to.equal(12);
        bigpipe._server.close(done);
      });

      assume(bigpipe._pagelets.length).to.equal(0);
      bigpipe.listen(common.port);
    });
  });

  describe('.createServer', function () {
    it('is a function', function () {
      assume(BigPipe.createServer).to.be.a('function');
      assume(BigPipe.createServer.length).to.equal(2);
    });

    it('has optional port argument that defaults to 8080', function (done) {
      var bigpipe = BigPipe.createServer({
        dist: '/tmp/dist'
      });

      assume(bigpipe._options('port')).to.equal(8080);
      bigpipe.once('listening', function () {
        bigpipe._server.close(done);
      });
    });

    it('accepts string as port number', function (done) {
      var port = common.port
        , bigpipe = BigPipe.createServer(port.toString(), {
          dist: '/tmp/dist'
        });

      assume(bigpipe._options('port')).to.equal(port);
      bigpipe.once('listening', function () {
        bigpipe._server.close(done);
      });
    });

    it('will call .listen as soon as the server is completely initialized', function (done) {
      var bigpipe = BigPipe.createServer(common.port, {
        dist: '/tmp/dist'
      });

      bigpipe.once('listening', function () {
        bigpipe._server.close(done);
      });
    });

    it('defaults options to empty object', function (done) {
      var bigpipe = BigPipe.createServer(common.port);
      bigpipe.once('listening', function () {
        bigpipe._server.close(done);
      });
    });

    it('returns bigpipe instance if listen is false', function () {
      assume(BigPipe.createServer(common.port, { listen: false })).to.be.instanceof(BigPipe);
    });
  });

  describe('.redirect', function () {
    it('redirects to specified location', function (done) {
      var property = Object.getOwnPropertyDescriptor(BigPipe.prototype, 'redirect')
        , pagelet = new Pagelet({res: {}, bigpipe: app });

      assume(BigPipe.prototype).to.have.property('redirect');
      assume(BigPipe.prototype.redirect).to.be.a('function');
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
      var pagelet = new Pagelet({res: {}, bigpipe: app });

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

    it('can add cache headers to prevent caching the redirect', function () {
      var resp = new Response
        , keys = ['Pragma', 'Expires', 'Cache-Control', 'Location']
        , props = [
            '/redirect',
            'no-cache',
            'Sat, 26 Jul 1997 05:00:00 GMT',
            'no-store, no-cache, must-revalidate, post-check=0, pre-check=0'
          ];

      resp.setHeader = function (key, prop) {
        assume(keys).to.include(key);
        assume(props).to.include(prop);
      };

      app.redirect(
        new Pagelet({res: resp, bigpipe: app }),
        '/redirect',
        302,
        { cache: false }
      );
    });

    it('emits end if the pagelet has a listener', function (done) {
      var pagelet = new Pagelet({res: new Response, bigpipe: app });

      pagelet.once('end', function () {
        assume(arguments.length).to.equal(0);
        done();
      });

      app.redirect(pagelet, '/redirect', 302);
    });
  });


  describe('.status', function () {
    it('is a function', function () {
      assume(app.status).is.a('function');
      assume(app.status.length).to.equal(4);
    });

    it('emits an error on if the statusCode is unsupported', function (done) {
      app.once('error', function (error) {
        assume(error).to.be.instanceof(Error);
        assume(error.message).to.equal('Unsupported HTTP code: 303.');
        done();
      });

      app.status(null, 303);
    });

    it('bootstraps the request status pagelet', function () {
      app.discover(function () {
        var pagelet = app.status({ _req: new Request, _res: new Response }, 500, new Error('test message'));
        assume(pagelet).to.be.instanceof(require('500-pagelet'));
        assume(pagelet.data).to.be.instanceof(Error);
        assume(pagelet.data.message).to.equal('test message');
      });
    });
  });

  describe('.bind', function () {
    it('is a function', function () {
      assume(app.bind).is.a('function');
      assume(app.bind.length).to.equal(1);
    });

    it('binds the function to the BigPipe instance', function (done) {
      function test(one, two, three) {
        assume(this).to.be.instanceof(BigPipe);
        assume(one).to.equal('1st arg');
        assume(two).to.equal('2nd arg');
        assume(three).to.equal('3rd arg');
        done();
      }

      app.bind(test)('1st arg', '2nd arg', '3rd arg');
    });
  });

  describe('.dispatch', function () {
    it('is a function', function () {
      assume(app.dispatch).is.a('function');
      assume(app.dispatch.length).to.equal(2);
    });

    it('returns early if middleware handles the response', function (done) {
      var bigpipe = new BigPipe(http.createServer(), {
        dist: '/tmp/dist'
      });

      bigpipe.middleware.use('test', function (req, res, next) {
        assume(req.url).to.equal('/');
        next(null, true);

        bigpipe._server.close(done);
      });

      bigpipe.listen(common.port, function () {
        bigpipe.dispatch(new Request('/'), new Response);
      });
    });

    it('returns 500 Pagelet if middleware errors', function (done) {
      var bigpipe = new BigPipe(http.createServer(), {
        dist: '/tmp/dist'
      });

      bigpipe.middleware.use('test', function (req, res, next) {
        assume(req.url).to.equal('/');
        next(new Error('Testing message, fail!'), false);
      });

      bigpipe.listen(common.port, function () {
        var response = new Response;

        response.write = function write(data, encoding, cb) {
          data = data.toString('utf-8');
          assume(data).to.include('<title>BigPipe</title>');
          assume(data).to.include('500, Internal server error');
          assume(data).to.include('Error: Testing message, fail!');
          bigpipe._server.close(done);
        };

        bigpipe.dispatch(new Request('/'), response);
      });
    });

    it('delegates to router and bootstrap', function (done) {
      var response = new Response;
      response.write = function write(data, encoding, cb) {
        data = data.toString('utf-8');
        assume(data).to.include('<body data-pagelet="faq">');
        done();
      };

      app.dispatch(new Request('/faq'), response);
    });
  });

  describe('.capture', function () {
    it('is a function', function () {
      assume(app.capture).is.a('function');
      assume(app.capture.length).to.equal(3);
    });

    it('calls the status method with a 500', function (done) {
      var Mock = BigPipe.extend({
        status: function status(pagelet, code, error, bootstrap) {
          assume(pagelet).to.be.instanceof(Pagelet);
          assume(code).to.equal(500);
          assume(error.message).to.equal('trigger status');
          assume(bootstrap).to.equal(false);
          done();
        }
      });

      var mock = new Mock(http.createServer(), {
        dist: '/tmp/dist'
      });

      mock.capture(
        new Error('trigger status'),
        new (Pagelet.extend({ name: 'mock' }))
      );
    });

    it('passes value of bootstrap flag', function (done) {
      var Mock = BigPipe.extend({
        status: function status(pagelet, code, error, bootstrap) {
          assume(pagelet).to.be.instanceof(Pagelet);
          assume(code).to.equal(500);
          assume(error.message).to.equal('trigger status');
          assume(bootstrap).to.equal(true);
          done();
        }
      });

      var mock = new Mock(http.createServer(), {
        dist: '/tmp/dist'
      });

      mock.capture(
        new Error('trigger status'),
        new (Pagelet.extend({ name: 'mock' })),
        true
      );
    });
  });

  describe('.sync', function () {
    it('is a function', function () {
      assume(app.sync).is.a('function');
      assume(app.sync.length).to.equal(1);
    });
  });

  describe('.async', function () {
    it('is a function', function () {
      assume(app.async).is.a('function');
      assume(app.async.length).to.equal(1);
    });
  });

  describe('.pipeline', function () {
    it('is a function', function () {
      assume(app.pipeline).is.a('function');
      assume(app.pipeline.length).to.equal(1);
    });
  });

  describe('.pluggable', function () {
    it('is a function', function () {
      assume(app.pluggable).is.a('function');
      assume(app.pluggable.length).to.equal(1);
    });

    it('uses the provided plugins', function () {
      var plugins = [{
        name: 'car',
        server: function noop() {}
      }, {
        name: 'bike',
        client: function noop() {}
      }];

      app.pluggable(plugins);

      assume(app._plugins).to.be.an('object');
      assume(app._plugins).to.have.property('car');
      assume(app._plugins).to.have.property('bike');
      assume(app._plugins.car).to.equal(plugins[0]);
      assume(app._plugins.bike).to.equal(plugins[1]);
    });
  });

  describe('.use', function () {
    it('is a function', function () {
      assume(app.use).is.a('function');
      assume(app.use.length).to.equal(2);
    });

    it('has optional name parameter', function () {
      app.use('nameless', {
        server: function noop() {}
      });

      assume(app._plugins).to.have.property('nameless');
    });

    it('throws an error if the plugin has no name', function () {
      function throws() {
        app.use(void 0, {
          server: function noop() {}
        });
      }

      assume(throws).to.throw(Error);
      assume(throws).to.throw('Plugin should be specified with a name.');
    });

    it('throws an error if the plugin name is not a string', function () {
      function throws() {
        app.use(12, {
          server: function noop() {}
        });
      }

      assume(throws).to.throw(Error);
      assume(throws).to.throw('Plugin names should be a string.');
    });

    it('throws an error if the plugin is no object or string', function () {
      function throws() {
        app.use('test', 12);
      }

      assume(throws).to.throw(Error);
      assume(throws).to.throw('Plugin should be an object or function.');
    });

    it('throws an error if the plugin is redefined with the same name', function () {
      function throws() {
        app.use({ name: 'test', server: function noop() {}});
        app.use({ name: 'test', server: function noop() {}});
      }

      assume(throws).to.throw(Error);
      assume(throws).to.throw('The plugin name was already defined.');
    });

    it('throws an error if the plugin has no server or client functions', function () {
      function throws() {
        app.use({ name: 'test'});
      }

      assume(throws).to.throw(Error);
      assume(throws).to.throw('The plugin is missing a client or server function.');
    });

    it('reads plugins from file', function () {
      app.use('fromfile', __dirname +'/fixtures/plugin');

      assume(app._plugins).to.have.property('fromfile');
      assume(app._plugins.fromfile).to.have.property('client');
      assume(app._plugins.fromfile).to.have.property('server');
    });

    it('merges BigPipe and plugin options and calls the server function', function (done) {
      app.use('merge', {
        options: {
          test: 'value'
        },

        server: function (bigpipe, options) {
          assume(bigpipe).to.be.instanceof(BigPipe);
          assume(options).to.be.an('function');
          assume(options('test')).to.equal('value');
          done();
        }
      });
    });
  });

  describe('.destroy', function () {
    it('is a function', function () {
      assume(app.destroy).is.a('function');
      assume(app.destroy.length).to.equal(0);
    });

    it('closes the server if required', function (done) {
      var bigpipe = new BigPipe(http.createServer(), {
        dist: '/tmp/dist'
      });

      bigpipe.listen(common.port, function () {
        bigpipe._server.close = done;
        bigpipe.destroy();
      });
    });

    it('removes listeners and cleans references', function (done) {
      var bigpipe = new BigPipe(http.createServer(), {
        pagelets: __dirname +'/fixtures/pagelets',
        dist: '/tmp/dist'
      });

      bigpipe.listen(common.port, function () {
        bigpipe.destroy();

        assume(bigpipe).to.not.have.property('_events');
        assume(bigpipe._pagelets).to.equal(null);
        assume(bigpipe._temper).to.equal(null);
        assume(bigpipe._plugins).to.equal(null);
        assume(bigpipe.middleware).to.equal(null);

        done();
      });
    });
  });

  describe('.bootstrap', function () {
    var bigpipe = new BigPipe(http.createServer(), {
      pagelets: __dirname +'/fixtures/pagelets',
      dist: '/tmp/dist'
    });

    it('is a function', function () {
      assume(app.bootstrap).is.a('function');
      assume(app.bootstrap.length).to.equal(3);
    });

    it('returns early if the response is finished', function () {
      var req = new Request
        , res = new Response
        , pagelet = new Pagelet
        , result;

      res.finished = true;
      result = app.bootstrap(pagelet, req, res);

      assume(pagelet._bootstrap).to.equal(undefined);
      assume(result).to.be.instanceof(BigPipe);
    });

    it('forces sync mode if the JS is disabled or HTTP versions are missing', function () {
      var req = new Request
        , res = new Response
        , pagelet = new All({ req: req, res: res, bigpipe: bigpipe });

      req.query.no_pagelet_js = '1';
      pagelet.mode = 'async';

      app.bootstrap(pagelet, req, res);
      assume(pagelet).to.have.property('mode', 'sync');

      req.httpVersionMajor = '2';
      pagelet.mode = 'async';

      app.bootstrap(pagelet, req, res);
      assume(pagelet).to.have.property('mode', 'sync');
    });

    it('bootstraps the parent in async mode by default', function () {
      var req = new Request
        , res = new Response
        , pagelet = new All({ req: req, res: res, bigpipe: bigpipe });

      req.httpVersionMajor = '2';
      req.httpVersionMinor = '2';

      app.bootstrap(pagelet, req, res);
      assume(pagelet.mode).to.equal('async');
    });

    it('adds the bootstrap pagelet to the parent', function () {
      var req = new Request
        , res = new Response
        , pagelet = new All({ req: req, res: res, bigpipe: bigpipe });

      app.bootstrap(pagelet, req, res);

      assume(pagelet._bootstrap).to.be.an('object');
      assume(pagelet._bootstrap).to.be.instanceof(require('bootstrap-pagelet'));
    });

    it('calls .init on the parent pagelet', function (done) {
      var req = new Request
        , res = new Response
        , pagelet = new (All.extend({
            init: function () {
              assume(arguments).to.have.length(0);
              done();
            }
          }))({ req: req, res: res, bigpipe: bigpipe });

      app.bootstrap(pagelet, req, res);
    });

    it('calls .initialize on the parent pagelet', function (done) {
      var req = new Request
        , res = new Response
        , pagelet = new (All.extend({
            initialize: function () {
              assume(arguments).to.have.length(0);
              done();
            }
          }))({ req: req, res: res, bigpipe: bigpipe });

      app.bootstrap(pagelet, req, res);
    });

    it('calls .initialize (async) on the parent pagelet', function (done) {
      var req = new Request
        , res = new Response
        , pagelet = new (All.extend({
            init: function () {
              done();
            },
            initialize: function (next) {
              assume(arguments).to.have.length(1);
              assume(next).to.be.a('function');
              next();
            }
          }))({ req: req, res: res, bigpipe: bigpipe });

      app.bootstrap(pagelet, req, res);
    });
  });
});
