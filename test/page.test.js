describe('Page', function () {
  'use strict';

  var common = require('./common')
    , Temper = require('temper')
    , Compiler = require('../lib/compiler')
    , http = require('http')
    , expect = common.expect
    , Pipe = common.Pipe
    , Page = common.Page
    , server, page, app;

  beforeEach(function (done) {
    server = http.createServer(function () {
      throw new Error('Unhandled request');
    });

    app = new Pipe(server, {
        pages: __dirname +'/fixtures/pages'
      , dist: '/tmp/dist'
      , domains: true
    });

    page = new Page(app);

    server.portnumber = common.port;
    server.listen(server.portnumber, done);
  });

  afterEach(function (done) {
    server.close(done);
    page = null;
  });

  describe('has readable instance properties', function () {
    it('temper template compiler', function () {
      var property = Object.getOwnPropertyDescriptor(page, 'temper');

      expect(page).to.have.property('temper');
      expect(page.temper).to.be.an('object');
      expect(page.temper).to.be.instanceof(Temper);
      expect(property.writable).to.equal(false);
      expect(property.enumerable).to.equal(false);
      expect(property.configurable).to.equal(false);
    });

    it('compiler for asset management', function () {
      var property = Object.getOwnPropertyDescriptor(page, 'compiler');

      expect(page).to.have.property('compiler');
      expect(page.compiler).to.be.an('object');
      expect(page.compiler).to.be.instanceof(Compiler);
      expect(property.writable).to.equal(false);
      expect(property.enumerable).to.equal(false);
      expect(property.configurable).to.equal(false);
    });

    it('pipe instance', function () {
      var property = Object.getOwnPropertyDescriptor(page, 'pipe');

      expect(page).to.have.property('pipe');
      expect(page.pipe).to.be.an('object');
      expect(page.pipe).to.be.instanceof(Pipe);
      expect(property.writable).to.equal(false);
      expect(property.enumerable).to.equal(false);
      expect(property.configurable).to.equal(false);
    });
  });

  describe('has readable prototype functions', function () {
    describe('#redirect', function () {
      it('redirects to specified location', function (done) {
        var property = Object.getOwnPropertyDescriptor(Page.prototype, 'redirect');

        expect(Page.prototype).to.have.property('redirect');
        expect(Page.prototype.redirect).to.be.a('function');
        expect(property.writable).to.equal(false);
        expect(property.enumerable).to.equal(false);
        expect(property.configurable).to.equal(false);

        page.res = {};
        page.res.setHeader = function setHeader(header, value) {
          expect(header).to.equal('Location');
          expect(value).to.equal('/redirected');
        };

        page.res.end = function end() {
          expect(page.res.statusCode).to.equal(301);
          done();
        };

        page.redirect('/redirected');
      });

      it('allows to set custom statusCode', function (done) {
        page.res = {};
        page.res.setHeader = function setHeader(header, value) {
          expect(header).to.equal('Location');
          expect(value).to.equal('/redirected');
        };

        page.res.end = function end() {
          expect(page.res.statusCode).to.equal(400);
          done();
        };

        page.redirect('/redirected', 400);
      });
    });
  });
});
