'use strict';

var Page = require('../../../').Page;

//
// A simple FAQ page test route.
//
module.exports = Page.extend({
  method: 'GET',
  path: '/faq'
});
