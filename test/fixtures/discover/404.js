'use strict';

var Page = require('../../../page');

//
// Custom 404 error page, not found page.
//
module.exports = Page.extend({
  statusCode: 404,
  path: '/404'
});
