describe('temper', function () {
  'use strict';

  var Temper = require('../')
    , chai = require('chai')
    , expect = chai.expect
    , temper;

  beforeEach(function () {
    temper = new Temper();
  });

  afterEach(function () {
    temper.destroy();
  });

  describe('#read', function () {
    it('should read the file contents and return a string', function () {
      var data = temper.read(__dirname +'/fixtures/template.jade');

      expect(data).to.be.a('string');
      expect(data).to.contain('doctype 5');
    });

    it('should cache the file lookup', function () {
      var data = temper.read(__dirname +'/fixtures/template.jade');
      expect(data).to.be.a('string');
      expect(data).to.contain('doctype 5');

      expect(temper.file).to.have.property(__dirname +'/fixtures/template.jade');

      data = temper.read(__dirname +'/fixtures/template.jade');
      expect(data).to.be.a('string');
      expect(data).to.contain('doctype 5');
    });
  });

  describe('#require', function () {
    it('requires the module and returns it', function () {
      var jade = temper.require('jade');

      expect(jade).to.equal(require('jade'));
    });

    it('caches the module', function () {
      var jade = temper.require('jade');

      expect(jade).to.equal(require('jade'));
      expect(temper.require('jade')).to.equal(require('jade'));
    });

    it('throws an error if a module doesnt exist', function () {
      try { temper.require('cowdoodlesack'); }
      catch (e) {
        expect(e).to.be.instanceOf(Error);
        expect(e.message).to.include('npm install');
        return expect(e.message).to.include('cowdoodlesack');
      }

      throw new Error('I should have failed');
    });
  });

  describe('#discover', function () {
    it('should throw an error for a unknown extension', function () {
      try { temper.discover('/care/bear/path/template.trololol'); }
      catch (e) {
        expect(e).to.be.instanceOf(Error);
        expect(e.message).to.include('trololol');
        return expect(e.message).to.include('Unknown file extension');
      }

      throw new Error('I should have failed');
    });

    it('returns the correct engine', function () {
      expect(temper.discover('foo.jade')).to.equal('jade');
      expect(temper.discover('foo.ejs')).to.equal('ejs');
      expect(temper.discover('foo.mustache')).to.equal('hogan.js');
    });
  });

  describe('#compile', function () {
    it('compiles a jade template', function () {
      var obj = temper.compile('h1 hello', 'jade');

      expect(obj.client).to.be.a('string');
      expect(obj.library).to.be.a('string');
      expect(obj.server).to.be.a('function');
      expect(obj.server()).to.equal('<h1>hello</h1>');
    });
  });
});
