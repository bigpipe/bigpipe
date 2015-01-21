describe('Pipe', function () {
  'use strict';

  var Compiler = require('../lib/compiler')
    , common = require('./common')
    , Pagelet = require('pagelet')
    , assume = require('assume')
    , http = require('http')
    , Response = common.Response
    , Request = common.Request
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

  it('has fallback if called as function without new', function () {
    assume(Pipe()).to.be.instanceof(Pipe);
  });

  it('has defaults for options', function () {
    var pipe = new Pipe(http.createServer());

    assume(pipe).to.have.property('_options');
    assume(pipe._options).to.have.property('merge');
  });

  it('is an EvenEmitter3', function () {
    assume(app).to.be.instanceOf(require('eventemitter3'));
  });

  it('exposes the current version', function () {
    assume(app.version).to.equal(require(process.cwd() +'/package.json').version);
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
    var pipeById = new Pipe(http.createServer(), {
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
      pipeById.listen(common.port, function () {
        var id = pipeById._pagelets[0].prototype.id;

        pipeById.once('bootstrap', function (pagelet) {
          assume(pagelet).to.be.instanceOf(Pagelet);
          assume(pagelet.view).to.equal(__dirname +'/fixtures/view/all.html');
          assume(pagelet.name).to.equal('tester');
          assume(pagelet.path).to.equal(null);

          pipeById._server.close(done);
        });

        pipeById.router(new Request('/'), new Response(), id);
      });
    });

    it('will return 404 if the specified id cannot be found', function (done) {
      pipeById.listen(common.port, function () {
        var id = pipeById._pagelets[0].prototype.id;

        pipeById.once('bootstrap', function (pagelet) {
          assume(pagelet).to.be.instanceOf(require('404-pagelet'));
          assume(pagelet.name).to.equal('404');
          assume(pagelet.path).to.equal('/404');

          pipeById._server.close(done);
        });

        pipeById.router(new Request('/'), new Response(), 'some random id');
      });
    });

    it('doesnt find / for POST requests', function (done) {
      app.once('bootstrap', function (pagelet) {
        assume(pagelet).to.be.instanceOf(Pagelet);
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
        assume(pagelet).to.be.instanceOf(Pagelet);
        assume(pagelet.statusCode).to.equal(404);

        done();
      });

      app.router(new Request('/'+ Math.random(), 'POST'), new Response());
    });

    it('returns authorized conditional pagelet', function (done) {
      var notAllowedCalled = false
        , pipeIf = new Pipe(http.createServer(), {
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

      pipeIf.listen(common.port, function () {
        pipeIf.once('bootstrap', function (pagelet) {
          assume(notAllowedCalled).to.equal(true);
          assume(pagelet).to.be.instanceOf(Pagelet);
          assume(pagelet.name).to.equal('allowed');
          assume(pagelet.name).to.not.equal('notallowed');

          pipeIf._server.close(done);
        });

        pipeIf.router(new Request('/'), new Response());
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
       ,  pipe = new Pipe(server, {
            dist: '/tmp/dist'
          });

      pipe.define(faq, function (err) {
        if (err) return next(err);

        assume(pipe._pagelets).to.have.length(1);
        assume(pipe._pagelets[0]).to.be.an('function');

        next();
      });
    });

    it('will resolve and add the pagelets if directory', function (next) {
      var pipe = new Pipe(server, {
        dist: '/tmp/dist'
      });

      pipe.define(__dirname + '/fixtures/pagelets', function (err) {
        if (err) return next(err);

        assume(pipe._pagelets).to.have.length(4);
        pipe._pagelets.forEach(function (pagelet) {
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
      var pipe = new Pipe(http.createServer(), {
        dist: '/tmp/dist'
      });

      pipe.once('transform:pagelet:after', function (Pagelet, next) {
        return next(new Error('middleware failed'));
      });

      pipe.discover(function (error) {
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
      });

      assume(custom._pagelets).to.have.length(0);
      assume(custom._bootstrap).to.not.equal(require('bootstrap-pagelet'));
    });
  });

  describe('.resolve', function () {
    it('omits any directories from the pagelets directory without an index.js', function () {
      var pipe = new Pipe(server, {
        pagelets: __dirname + '/fixtures/discover',
        dist: '/tmp/dist'
      });

      pipe._pagelets.forEach(function (pagelets) {
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
      var pipe = new Pipe(http.createServer(), {
        pagelets: {
          failure: require('pagelet').extend({
            view: undefined
          })
        }
      });

      pipe.listen(common.port, function (error) {
        assume(error).to.be.instanceof(Error);
        assume(error.message).to.include('should have a .view property');
        done();
      });
    });

    it('emits the error if no callback is provided', function (done) {
        var pipe = new Pipe(http.createServer(), {
          pagelets: {
            failure: require('pagelet').extend({
              view: undefined
            })
          }
        });

        pipe.once('error', function (error) {
          assume(error).to.be.instanceof(Error);
          assume(error.message).to.include('should have a .view property');
          done();
        });

        pipe.listen(common.port);
    });

    it('proxies event listeners', function (done) {
      //
      // Set a big timeout as we might need to lazy install dependencies
      //
      this.timeout(500E3);

      var pipe = new Pipe(http.createServer(), {
        dist: '/tmp/dist'
      });

      pipe.once('listening', function () {
        pipe._server.close(done);
      });

      pipe.listen(common.port, function () {
        assume(pipe._server._events).to.have.property('listening');
        assume(pipe._server._events.listening[0]).to.be.a('function');
        assume(pipe._server._events.listening[0].toString()).to.equal(pipe.emits('listening').toString());
        assume(pipe._server._events).to.have.property('request');
        assume(pipe._server._events.request).to.be.a('function');
        assume(pipe._server._events.request.toString()).to.equal(pipe.bind(pipe.dispatch).toString());
        assume(pipe._server._events).to.have.property('error');
        assume(pipe._server._events.error).to.be.a('function');
        assume(pipe._server._events.error.toString()).to.equal(pipe.emits('error').toString());
      });
    });

    it('will define and process the provided pagelets', function (done) {
      var pipe = new Pipe(http.createServer(), {
        pagelets: __dirname +'/fixtures/pagelets',
        dist: '/tmp/dist'
      });

      pipe.once('listening', function () {
        assume(pipe._pagelets.length).to.equal(4);
        pipe._server.close(done);
      });

      assume(pipe._pagelets.length).to.equal(0);
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

    it('defaults options to empty object', function (done) {
      var pipe = Pipe.createServer(common.port);
      pipe.once('listening', done);
    });

    it('returns pipe instance if listen is false', function () {
      assume(Pipe.createServer(common.port, { listen: false })).to.be.instanceof(Pipe);
    });
  });

  describe('.redirect', function () {
    it('redirects to specified location', function (done) {
      var property = Object.getOwnPropertyDescriptor(Pipe.prototype, 'redirect')
        , pagelet = new Pagelet({res: {}, pipe: app });

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
      var pagelet = new Pagelet({res: {}, pipe: app });

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
        new Pagelet({res: resp, pipe: app }),
        '/redirect',
        302,
        { cache: false }
      );
    });

    it('emits end if the pagelet has a listener', function (done) {
      var pagelet = new Pagelet({res: new Response, pipe: app });

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

      app.status(null, null, 303);
    });

    it('bootstraps the request status pagelet', function () {
      app.discover(function () {
        var pagelet = app.status(new Request, new Response, 500, new Error('test message'));
        assume(pagelet).to.be.instanceof(require('500-pagelet'));
        assume(pagelet.error).to.be.instanceof(Error);
        assume(pagelet.error.message).to.equal('test message');
        assume(pagelet._bootstrap).to.be.instanceof(require('bootstrap-pagelet'));
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
        assume(this).to.be.instanceof(Pipe);
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

    it('returns early if middleware handles the repsonse', function (done) {
      var pipe = new Pipe(http.createServer(), {
        dist: '/tmp/dist'
      });

      pipe.middleware.use('test', function (req, res, next) {
        assume(req.url).to.equal('/');
        next(null, true);

        pipe._server.close(done);
      });

      pipe.listen(common.port, function () {
        pipe.dispatch(new Request('/'), new Response);
      });
    });

    it('returns 500 Pagelet if middleware errors', function (done) {
      var pipe = new Pipe(http.createServer(), {
        dist: '/tmp/dist'
      });

      pipe.middleware.use('test', function (req, res, next) {
        assume(req.url).to.equal('/');
        next(new Error('Testing message, fail!'), false);
      });

      pipe.listen(common.port, function () {
        var response = new Response;
        response.write = function write(data, encoding, cb) {
          data = data.toString('utf-8');
          assume(data).to.include('<title>BigPipe</title>');
          assume(data).to.include('500, Internal server error');
          assume(data).to.include('Error: Testing message, fail!');
          pipe._server.close(done);
        };

        pipe.dispatch(new Request('/'), response);
      });
    });

    it('delegates to router and bootstrap', function (done) {
      var response = new Response;
      response.write = function write(data, encoding, cb) {
        data = data.toString('utf-8');
        assume(data).to.include('<body data-pagelet="faq">faq\n  </body>\n</html>');
        done();
      };

      app.dispatch(new Request('/faq'), response);
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
      assume(throws).to.throw('The plugin in missing a client or server function.');
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

        server: function (pipe, options) {
          assume(pipe).to.be.instanceof(Pipe);
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
      var pipe = new Pipe(http.createServer(), {
        dist: '/tmp/dist'
      });

      pipe.listen(common.port, function () {
        pipe._server.close = done;
        pipe.destroy();
      });
    });

    it('removes listeners and cleans references', function (done) {
      var pipe = new Pipe(http.createServer(), {
        pagelets: __dirname +'/fixtures/pagelets',
        dist: '/tmp/dist'
      });

      pipe.listen(common.port, function () {
        pipe.destroy();

        assume(pipe).to.not.have.property('_events');
        assume(pipe).to.have.property('_pagelets', null);
        assume(pipe).to.have.property('_temper', null);
        assume(pipe).to.have.property('_plugins', null);
        assume(pipe).to.have.property('middleware', null);

        done();
      });
    });
  });

  describe('.bootstrap', function () {
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

      assume(Object.keys(pagelet.bootstrap).length).to.equal(0);
      assume(result).to.be.instanceof(Pipe);
    });

    it('proxies close listener on the response', function (done) {
      var req = new Request
        , res = new Response
        , pagelet = new Pagelet({ req: req, res: res });

      res.once = function (key, fn) {
        assume(key).to.equal('close');
        assume(fn.toString()).to.equal(app.emits('close').toString());
        done();
      };

      app.bootstrap(pagelet, req, res);
    });

    it('forces sync mode if the JS is disabled or HTTP versions are missing', function () {
      var req = new Request
        , res = new Response
        , pagelet = new Pagelet({ req: req, res: res });

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
        , pagelet = new Pagelet({ req: req, res: res });

      req.httpVersionMajor = '2';
      req.httpVersionMinor = '2';

      app.bootstrap(pagelet, req, res);
      assume(pagelet.mode).to.equal('async');
    });

    it('adds the bootstrap pagelet to the parent', function () {
      var req = new Request
        , res = new Response
        , pagelet = new Pagelet({ req: req, res: res });

      app.bootstrap(pagelet, req, res);
      assume(pagelet._bootstrap).to.be.an('object');
      assume(pagelet._bootstrap).to.be.instanceof(require('bootstrap-pagelet'));
    });

    it('calls .init on the parent pagelet', function (done) {
      var req = new Request
        , res = new Response
        , pagelet = new (Pagelet.extend({
            init: function () {
              assume(arguments).to.have.length(0);
              done();
            }
          }))({ req: req, res: res });

      app.bootstrap(pagelet, req, res);
    });

    it('calls .initialize on the parent pagelet', function (done) {
      var req = new Request
        , res = new Response
        , pagelet = new (Pagelet.extend({
            initialize: function () {
              assume(arguments).to.have.length(0);
              done();
            }
          }))({ req: req, res: res });

      app.bootstrap(pagelet, req, res);
    });

    it('calls .initialize (async) on the parent pagelet', function (done) {
      var req = new Request
        , res = new Response
        , pagelet = new (Pagelet.extend({
            init: function () {
              done();
            },
            initialize: function (next) {
              assume(arguments).to.have.length(1);
              assume(next).to.be.a('function');
              next();
            }
          }))({ req: req, res: res });

      app.bootstrap(pagelet, req, res);
    });
  });
});
