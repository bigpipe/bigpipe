describe('Compiler', function () {
  'use strict';

  var common = require('../common')
    , assume = require('assume')
    , path = require('path')
    , Compiler = common.Compiler
    , BigPipe = common.BigPipe
    , File = common.File
    , compiler, bigpipe, file;

  beforeEach(function () {
    bigpipe = new BigPipe;
    compiler = new Compiler('/tmp', bigpipe);
    file = new File('./path/to/file.js', {
      extname: '.js',
      aliases: [],
      code: 'tiny piece of code'
    });
  });

  afterEach(function () {
    compiler = null;
    bigpipe = null;
    file = null;
  });

  it('exposes the Compiler constructor', function () {
    assume(compiler).to.be.instanceof(Compiler);
  });

  describe('#catalog', function () {
    it('will catalog a pagelet (assemble all of the assets) for bootstrap', function (done) {
      this.timeout(10000);
      compiler = bigpipe._compiler;
      file = new File(bigpipe._framework.get('name'), {
        dependency: true,
        extname: '.js',
        code: 'function() {}'
      });

      // look at the bootstrap, bootstrap is setup unlike a hero or a fixture
      bigpipe.discover(function discover(err, data) {
        // md5 is diff
        var result = compiler.buffer[file.origin];
        file.hash = result.hash;

        assume(compiler.buffer[file.origin]).to.be.a('object');
        assume(compiler.buffer[file.location]).to.be.a('object');
        done();
      });
    });
  });

  describe('#register', function () {
    it('is a function', function () {
      assume(compiler.register).to.be.a('function');
    });

    it('will not register empty JS, CSS or views', function () {
      file.length = 0;

      assume(compiler.register(file)).to.equal(void 0);
    });
  });

  describe('#page', function () {
    it('is a function', function () {
      assume(compiler.page).to.be.a('function');
      assume(compiler.page).to.have.length(1);
    });

    it('resolves the extension of an external dependency', function () {
      var css = 'https://maxcdn.bootstrapcdn.com/bootstrap/3.3.5/css/bootstrap.min.css'
        , js = 'https://maxcdn.bootstrapcdn.com/bootstrap/3.3.5/js/bootstrap.min.js'
        , Hero = require('../fixtures/pagelets/hero').extend({
            _dependencies: {
              '.css': [ css ],
              '.js': [ js ]
            }
          })
        , stack;

     stack = compiler.page(new Hero).stack;

     assume(stack[0]).to.have.property('extname', '.css');
     assume(stack[0]).to.have.property('filepath', css.replace(path.extname(css), ''));
     assume(stack[1]).to.have.property('extname', '.js');
     assume(stack[1]).to.have.property('filepath', js.replace(path.extname(js), ''));
    });
  });

  describe('#pagelet', function () {
    it('is a function', function () {
      assume(compiler.pagelet).to.be.a('function');
    });

    it('will return CSS and JS fragments of pagelet', function (done) {
      var Hero = require('../fixtures/pagelets/hero');

      Hero.optimize({ bigpipe: bigpipe }, function optimized(error, Hero) {
        var hero = new Hero
          , frag;

        compiler.alias[hero.js[0]] = 'JS content md5 hash';
        compiler.alias[hero.css[0]] = 'CSS content md5 hash';
        frag = compiler.pagelet(hero);

        assume(frag).to.be.an('object');
        assume(frag.css).to.be.an('array');
        assume(frag.css).to.have.length(1);
        assume(frag.js).to.be.an('array');
        assume(frag.js).to.have.length(1);

        done();
      });
    });

    it('will not return empty or undefined CSS and JS references', function (done) {
      var Hero = require('../fixtures/pagelets/hero').extend({
        css: '',
        js: ''
      });

      Hero.optimize({ bigpipe: bigpipe }, function optimized(error, Hero) {
        var hero = new Hero
          , frag;

        compiler.alias[hero.js[0]] = 'JS content md5 hash';
        compiler.alias[hero.css[0]] = 'CSS content md5 hash';
        frag = compiler.pagelet(hero);

        assume(frag).to.be.an('object');
        assume(frag.css).to.be.an('array');
        assume(frag.css).to.have.length(0);
        assume(frag.js).to.be.an('array');
        assume(frag.js).to.have.length(0);

        done();
      });
    });
  });

  describe('#resolve', function () {
    it('is a function', function () {
      assume(compiler.resolve).to.be.a('function');
    });

    it('returns hash by file alias or false', function () {
      compiler.alias['original/path/to/file.js'] = 'md5 hash.js';

      assume(compiler.resolve('unknown file')).to.equal(false);
      assume(compiler.resolve('original/path/to/file.js')).to.equal('md5 hash.js');
    });
  });
});
