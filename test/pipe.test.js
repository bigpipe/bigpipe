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

    app = new Pipe(server, __dirname + '/pages', {
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
    expect(app.pages).to.have.length(1);
  });

  it('transforms pages', function () {
    var Page = app.pages[0];

    expect(Page.router).to.be.instanceOf(require('routable'));
    expect(Page.method).to.be.a('array');
  });
});
