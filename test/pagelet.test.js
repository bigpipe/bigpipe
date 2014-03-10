describe('Pagelet', function () {
  'use strict';

  var Pagelet = require('../pagelet').extend({ name: 'test' })
    , common = require('./common')
    , expect = common.expect
    , page, pagelet;

  beforeEach(function () {
    page = {};
    pagelet = new Pagelet({ page: page });
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
