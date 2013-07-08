'use strict';

var Page = require('../../../page');

//
// Custom 500 error page, internal server fuckup.
//
module.exports = Page.extend({
  statusCode: 500,
  url: '/404'
});
