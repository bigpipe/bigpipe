describe('File', function () {
  'use strict';

  var common = require('../common')
    , expect = common.expect
    , File = common.File
    , location = './path/to/file.js'
    , ext = '.js'
    , sha = '34cc87dddd9bb2b2123a973830feea9af4c7d149'
    , code = 'tiny piece of code'
    , file;

  beforeEach(function () {
    file = new File(location, ext, false, code);
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
    expect(file).to.have.property('location', '/' + sha + ext);
    expect(file).to.have.property('type', file.mime[ext]);
    expect(file).to.have.property('extname', ext);
    expect(file).to.have.property('hash', sha);
    expect(file).to.have.property('length');
    expect(file).to.have.property('code', code);
    expect(file).to.have.property('buffer');
    expect(file).to.have.property('aliases');
    expect(file.aliases).to.include(location);
  });

  describe('#set', function () {
    it('is a function that returns File instance', function () {
      var result = file.set('anything');

      expect(file.set).to.be.a('function');
      expect(result).to.be.an.instanceof(File);
    });

    it('will be called on construction if content is provided', function () {
      var result = new File(location, ext, false, 'custom');

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
      expect(file.is('any')).to.be.a('boolean');
    });

    it('returns true if the file is of provided type', function () {
      expect(file.is(ext)).to.equal(true);
    });

    it('returns false if the file is not of provided type', function () {
      expect(file.is('.css')).to.equal(false);
    });

    it('can also do a partial match against the extension', function () {
      expect(file.is('js')).to.equal(true);
    });
  });

  describe('#encrypt', function () {
    it('is a function that returns a string', function () {
      expect(file.encrypt).to.be.a('function');
      expect(file.encrypt('any')).to.be.a('string');
    });

    it('returns sha1 encrypted representation of file content', function () {
      expect(file.encrypt(code)).to.equal(sha);
    });
  });

  describe('#get', function () {
    it('is a function that returns a string', function () {
      expect(file.get).to.be.a('function');
      expect(file.get()).to.be.an('object');
    });

    it('returns buffer by default', function () {
      expect(JSON.stringify(file.get())).to.include('116,105,110,121');
      expect(file.get()).to.be.an.instanceof(Buffer);
    });

    it('returns code if readable flag is supplied', function () {
      expect(file.get(true)).to.be.a('string');
      expect(file.get(true)).to.equal(code);
    });
  });

  describe('#append', function () {
    it('is a function that returns a string', function () {
      expect(file.append).to.be.a('function');
      expect(file.append('any')).to.be.a('string');
    });

    it('returns content with selector attached', function () {
      expect(file.append(code)).to.equal(code + '#pagelet_' + sha + ' { height: 42px }');
    });

    it('can be provided with alternative hash', function () {
      expect(file.append(code, 'test')).to.equal(code + '#pagelet_test { height: 42px }');
    });
  });

  describe('#location', function () {
    it('is a getter that returns a string', function () {
      expect(file.location).to.be.a('string');
    });

    it('returns the location', function () {
      expect(file.location).to.equal('/' + sha + ext);
    });
  });
});