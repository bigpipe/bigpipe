describe('File', function () {
  'use strict';

  var common = require('../common')
    , assume = require('assume')
    , File = common.File
    , location = './path/to/file.js'
    , ext = '.js'
    , sha = '34cc87dddd9bb2b2123a973830feea9af4c7d149'
    , code = 'tiny piece of code'
    , file;

  beforeEach(function () {
    file = new File(location, {
      extname: ext,
      code: code
    });
  });

  afterEach(function () {
    file = null;
  });

  it('exposes the File constructor', function () {
    assume(file).to.be.instanceof(File);
  });

  it('has references to default mime types per extension', function () {
    assume(file.mime).to.be.an('object');
    assume(file.mime).to.have.property('.css', 'text/css; charset=utf-8');
    assume(file.mime).to.have.property('.js', 'text/javascript; charset=utf-8');
  });

  it('stores references to provided data', function () {
    assume(file).to.have.property('type', file.mime[ext]);
    assume(file).to.have.property('extname', ext);
    assume(file).to.have.property('hash', sha);
    assume(file).to.have.property('length');
    assume(file).to.have.property('code', code);
    assume(file).to.have.property('buffer');
    assume(file).to.have.property('aliases');
    assume(file.aliases).to.include('./path/to/file');
  });

  it('allows code to be null or undefined', function () {
    file = new File(location, {
      extname: ext,
      code: void 0
    });

    assume(file.code).to.equal('');
    assume(file.buffer.length).to.equal(0);
    assume(file.hash).to.equal('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    assume(file.length).to.equal(0);

    file = new File(location, {
      extname: ext,
      code: null
    });

    assume(file.code).to.equal('');
    assume(file.buffer.length).to.equal(0);
    assume(file.hash).to.equal('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    assume(file.length).to.equal(0);
  });

  describe('#set', function () {
    it('is a function that returns File instance', function () {
      var result = file.set('anything');

      assume(file.set).to.be.a('function');
      assume(result).to.be.instanceof(File);
    });

    it('will be called on construction if content is provided', function () {
      var result = new File(location, {
        extname: ext,
        code: 'custom'
      });

      assume(result.code).to.equal('custom');
      assume(result.buffer).to.be.instanceof(Buffer);
    });

    it('will update the length, code and buffer of the file', function () {
      file.set(code);

      assume(file.code).to.equal(code);
      assume(file.buffer).to.be.instanceof(Buffer);
      assume(JSON.stringify(file.buffer)).to.include('116,105,110,121');
      assume(file.length).to.equal(18);
    });
  });

  describe('#is', function () {
    it('is a function that returns a boolean', function () {
      assume(file.is).to.be.a('function');
      assume(file.is('any')).to.be.a('boolean');
    });

    it('returns true if the file is of provided type', function () {
      assume(file.is(ext)).to.equal(true);
    });

    it('returns false if the file is not of provided type', function () {
      assume(file.is('.css')).to.equal(false);
    });

    it('can also do a partial match against the extension', function () {
      assume(file.is('js')).to.equal(true);
    });
  });

  describe('#encrypt', function () {
    it('is a function that returns a string', function () {
      assume(file.encrypt).to.be.a('function');
      assume(file.encrypt('any')).to.be.a('string');
    });

    it('returns sha1 encrypted representation of file content', function () {
      assume(file.encrypt(code)).to.equal(sha);
    });
  });

  describe('#get', function () {
    it('is a function that returns a string', function () {
      assume(file.get).to.be.a('function');
      assume(file.get()).to.be.an('buffer');
    });

    it('returns buffer by default', function () {
      assume(JSON.stringify(file.get())).to.include('116,105,110,121');
      assume(file.get()).to.be.instanceof(Buffer);
    });

    it('returns code if readable flag is supplied', function () {
      assume(file.get(true)).to.be.a('string');
      assume(file.get(true)).to.equal(code);
    });
  });

  describe('#append', function () {
    it('is a function that returns a string', function () {
      assume(file.append).to.be.a('function');
      assume(file.append('any')).to.be.a('string');
    });

    it('returns content with selector attached', function () {
      assume(file.append(code)).to.equal(code + '#_' + sha + ' { height: 42px }');
    });
  });

  describe('#location', function () {
    it('is a getter that returns a string', function () {
      assume(file.location).to.be.a('string');
    });

    it('returns an external location', function () {
      var location = 'http://github.com/file.js';
      file = new File(location, {
        extname: ext,
        code: 'custom',
        external: true
      });

      assume(file.location).to.equal(location);
    });

    it('returns a non external location', function () {
      assume(file.location).to.equal('/' + sha + ext);
    });
  });
});
