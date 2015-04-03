describe('Middleware', function () {
  'use strict';

  var common = require('./common')
    , assume = require('assume')
    , url = require('url')
    , defaults = require('../middleware/defaults');

  //
  // Request stub
  //
  function Request(url, method) {
    this.url = url || '';
    this.method = method || 'GET';
  }

  describe('.defaults', function () {
    it('is a function', function () {
      assume(defaults).to.be.a('function');
      assume(defaults.length).to.equal(2);
    });

    it('adds compatibility layer for connect middleware', function () {
      var req = new Request('/testpath');

      defaults(req);
      assume(req).to.have.deep.property('uri', url.parse('/testpath', true));
      assume(req).to.have.deep.property('query', url.parse('/testpath', true).query);
      assume(req).to.have.property('originalUrl', '/testpath');
    });
  });
});