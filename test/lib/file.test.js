describe('File', function () {
  'use strict';

  var common = require('../common')
    , expect = common.expect
    , File = common.File
    , location = './path/to/file.js'
    , code = 'tiny piece of code'
    , file;

  beforeEach(function () {
    file = new File(location);
  });

  afterEach(function () {
    file = null;
  });

  it('exposes the File constructor', function () {
    expect(file).to.be.an.instanceof(File);
  });

  it('has references to default mime types per extension', function () {
    expect(file.mime).to.be.an('object');
    expect(file.mime).to.have.property('.css', 'text/css; charset=utf-8');
    expect(file.mime).to.have.property('.js', 'text/javascript; charset=utf-8');
  });

  it('stores references to provided data', function () {
    expect(file).to.have.property('location', location);
    expect(file).to.have.property('type', file.mime['.js']);
    expect(file).to.have.property('extname', '.js');
  });

  describe('#set', function () {
    it('is a function that returns File instance', function () {
      var result = file.set('anything');

      expect(file.set).to.be.a('function');
      expect(result).to.be.an.instanceof(File);
    });

    it('will be called on construction if content is provided', function () {
      var result = new File(location, 'custom');

      expect(result.code).to.equal('custom');
      expect(result.buffer).to.be.an.instanceof(Buffer);
    });

    it('will update the length, code and buffer of the file', function () {
      file.set(code);

      expect(file.code).to.equal(code);
      expect(file.buffer).to.be.an.instanceof(Buffer);
      expect(JSON.stringify(file.buffer)).to.include('116,105,110,121');
      expect(file.length).to.equal(18);
    });
  });

  describe('#is', function () {
    it('is a function that returns a boolean', function () {
      expect(file.is).to.be.a('function');
      expect(file.is('any')).to.be.an('boolean');
    });

    it('returns true if the file is of provided type', function () {
      expect(file.is('.js')).to.equal(true);
    });

    it('returns false if the file is not of provided type', function () {
      expect(file.is('.css')).to.equal(false);
    });

    it('can also do a partial match against the extension', function () {
      expect(file.is('js')).to.equal(true);
    });
  });

  describe('#encrypt', function () {
    it('returns sha1 encrypted representation of file content');
  });
});