describe('Collection', function () {
  'use strict';

  var common = require('../common')
    , assume = require('assume')
    , Collection = common.Collection
    , File = common.File
    , collection;

  function noop () {};

  beforeEach(function () {
    collection = new Collection;
  });

  afterEach(function () {
    collection = null;
  });

  it('exposes the Collection constructor', function () {
    assume(Collection).to.be.a('function');
    assume(collection).to.be.instanceof(Collection);
    assume(collection.constructor).to.equal(Collection);
  });

  it('has empty readable stack', function () {
    assume(collection.stack).to.be.an('array');
    assume(collection.stack).to.have.length(0);
  });

  it('can be provided with options', function (done) {
    collection = new Collection({ files: new File, toString: function (file) {
      assume(file).to.be.instanceof(File);
      done();
    }});

    assume(collection._toString).is.a('function');
    assume(collection.stack).to.have.length(1);
    collection.toString();
  });

  describe('#toString', function () {
    it('is a getter', function () {
      var props = Object.getOwnPropertyDescriptor(Collection.prototype, 'toString');

      assume(Collection.prototype).to.have.property('toString');
      assume(props).to.have.property('get');
      assume(props.get).to.be.a('function');

      assume(props).to.have.property('enumerable', false);
      assume(props).to.have.property('configurable', false);
    });

    it('is a setter', function () {
      var props = Object.getOwnPropertyDescriptor(Collection.prototype, 'toString');

      assume(Collection.prototype).to.have.property('toString');
      assume(props).to.have.property('set');
      assume(props.get).to.be.a('function');

      assume(props).to.have.property('enumerable', false);
      assume(props).to.have.property('configurable', false);
    });

    it('sets the provided method on _toString', function () {
      collection = new Collection;
      assume(collection._toString).to.not.be.a('function');

      collection.toString = 'not a function';
      assume(collection._toString).to.not.be.a('function');

      collection.toString = noop;
      assume(collection._toString).to.be.a('function');
      assume(collection._toString).to.equal(noop);
    });

    it('returns default function that wraps the provided toString', function () {
      collection = new Collection({toString: function (v) {
        return '<h1>'+ v +'</h1>';
      }});

      collection.stack.push(1, 2, 3, false, 'some test string');

      assume(collection.toString).is.a('function');
      assume(collection.toString).to.have.length(0);
      assume(collection.toString()).to.equal('<h1>1</h1><h1>2</h1><h1>3</h1><h1>false</h1><h1>some test string</h1>');
    });
  });

  describe('#isFile', function () {
    it('is a function', function () {
      assume(collection.isFile).to.be.a('function');
      assume(collection.isFile).to.have.length(1);
    });

    it('checks if the object resembles a File', function () {
      assume(collection.isFile()).to.equal(false);
      assume(collection.isFile({})).to.equal(false);
      assume(collection.isFile(new File)).to.equal(true);
    });
  });

  describe('#push', function () {
    it('is a function', function () {
      assume(collection.isFile).to.be.a('function');
      assume(collection.isFile).to.have.length(1);
    });

    it('adds files to the stack', function () {
      var file = new File;
      file.hash = '1234567890abcdef';

      collection.push(false);
      assume(collection.stack).to.have.length(0);

      collection.push(file);
      assume(collection.stack).to.have.length(1);
      assume(collection.stack[0].length).to.equal(file.length);
      assume(collection.stack[0].hash).to.equal(file.hash);

      collection.push(new File);
      assume(collection.stack).to.have.length(2);
    });

    it('ignores non-unique files', function () {
      var file = new File;

      collection.push(file);
      assume(collection.stack).to.have.length(1);

      collection.push(file);
      assume(collection.stack).to.have.length(1);
    });
  });

  describe('#toJSON', function () {
    it('is a function', function () {
      assume(collection.toJSON).to.be.a('function');
      assume(collection.toJSON).to.have.length(0);
    });

    it('returns array of location of files in the collection', function () {
      collection.push(new File('empty1', { extname: '.css' }));
      collection.push(new File('empty2', { extname:'.js' }));

      var json = JSON.stringify(collection);
      assume(json).to.be.a('string');
      assume(json).to.equal(
        '["/da39a3ee5e6b4b0d3255bfef95601890afd80709.css","/da39a3ee5e6b4b0d3255bfef95601890afd80709.js"]'
      );

      assume(JSON.parse(json)).to.be.an('array');
      assume(JSON.parse(json)).to.include('/da39a3ee5e6b4b0d3255bfef95601890afd80709.css');
    });
  });

  describe('#concat', function () {
    it('is a function', function () {
      assume(collection.isFile).to.be.a('function');
      assume(collection.isFile).to.have.length(1);
    });

    it('concats files to the stack', function () {
      var file = new File;

      collection.concat(false);
      assume(collection.stack).to.have.length(0);

      collection.concat(new File);
      assume(collection.stack).to.have.length(1);
      assume(collection.stack[0].length).to.equal(file.length);
      assume(collection.stack[0].hash).to.equal(file.hash);
    });

    it('concats two seperate collections', function () {
      var local = new Collection({ files: new File('test1') });

      collection = new Collection({ files: new File('test2') });
      local.concat(collection);

      assume(local.stack).to.have.length(2);
      assume(local.stack[0]).to.have.property('aliases');
      assume(local.stack[0].aliases).to.include('test1');
      assume(local.stack[1].aliases).to.include('test2');
    });
  });
});