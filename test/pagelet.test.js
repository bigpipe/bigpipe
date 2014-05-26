describe('Pagelet plugin', function () {
  'use strict';

  var EventEmitter = require('events').EventEmitter
    , Pagelet = require('pagelet').extend({ name: 'test' })
    , plugin = require('../plugins/pagelet')
    , common = require('./common')
    , expect = common.expect
    , ee = new EventEmitter
    , page, pagelet;

  plugin.server(ee);
  ee.emit('transform:pagelet', Pagelet);

  beforeEach(function () {
    page = {};
    pagelet = new Pagelet().init({ page: page });
  });

  afterEach(function () {
    page = pagelet = null;
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
