describe('Pagelet', function () {
  'use strict';

  var common = require('./common')
    , Pagelet = common.Pagelet
    , Pipe = common.Pipe
    , expect = common.expect
    , server = Pipe.createServer(1337, { pages: __dirname + '/fixtures/pages', directory: __dirname +'/dist' })
    , page, pagelet;

  beforeEach(function () {
    page = server.pages[0];

    pagelet = new Pagelet;
    pagelet.page = page;
    pagelet.name = 'test';
  });

  afterEach(function () {
    page = pagelet = null;
  });

  it('rendering is asynchronously', function (done) {
    pagelet.render(pagelet.emits('called'));
    // Listening only till after the event is potentially emitted, will ensure
    // callbacks are called asynchronously by pagelet#render.
    pagelet.on('called', done);
  });

  it('enabled checks if the pagelet is enabled on the page', function () {
    page.enabled = [ pagelet ];

    expect(pagelet.enabled('test')).to.equal(true);
    expect(pagelet.enabled('some random name')).to.equal(false);
  });

  it('disabled checks if the pagelet is disabled on the page', function () {
    page.disabled = [ pagelet ];

    expect(pagelet.disabled('test')).to.equal(true);
    expect(pagelet.disabled('some random name')).to.equal(false);
  });
});
