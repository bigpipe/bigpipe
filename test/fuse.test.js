describe('fuse', function () {
  'use strict';

  var EventEmitter = require('eventemitter3')
    , common = require('./common')
    , fuse = require('../fuse')
    , expect = common.expect;

  it('exports it self as function', function() {
    expect(fuse).to.be.a('function');
  });

  it('returns the Base', function () {
    function Base() {} function Case() {}

    expect(fuse(Base, Case)).to.equal(Base);
  });

  it('exposes the extend method', function () {
    expect(fuse.extend).to.be.a('function');
  });

  it('exposes the mixin method', function () {
    expect(fuse.mixin).to.be.a('function');
  });

  it('exposes the merge method', function () {
    expect(fuse.merge).to.be.a('function');
  });

  it('adds writable and readable methods to the class', function () {
    function Base() {} function Case() {}
    fuse(Base, Case);

    expect(Base.writable).to.be.a('function');
    expect(Base.readable).to.be.a('function');

    expect(Base.prototype.foo).to.equal(undefined);
    expect(Base.prototype.bar).to.equal(undefined);

    Base.readable('foo', 'foo');
    Base.writable('bar', 'bar');

    expect(Base.prototype.foo).to.equal('foo');
    expect(Base.prototype.bar).to.equal('bar');
  });

  it('sets the constructor back to the Base', function () {
    function Base() {} function Case() {}
    fuse(Base, Case);

    expect(Base.prototype.constructor).to.equal(Base);
    expect(new Base()).to.be.instanceOf(Base);
    expect(new Base()).to.be.instanceOf(Case);
  });

  describe('emits', function () {
    it('adds the emits function to the prototype', function () {
      function Base() {} function Case() {}
      fuse(Base, Case);

      expect(Base.prototype.emits).to.be.a('function');
    });

    it('returns a function that emits the given event', function (done) {
      function Base() {}
      fuse(Base, EventEmitter);

      var base = new Base()
        , emits = base.emits('event');

      base.once('event', function (data) {
        expect(data).to.equal('foo');
        done();
      });

      emits('foo');
    });

    it('accepts a parser method that transforms the emitted values', function (done) {
      function Base() {}
      fuse(Base, EventEmitter);

      var base = new Base()
        , emits = base.emits('event', function (arg) {
            expect(arg).to.equal('bar');
            return 'foo';
          });

      base.once('event', function (data) {
        expect(data).to.equal('foo');
        done();
      });

      emits('bar');
    });
  });
});
