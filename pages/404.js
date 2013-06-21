'use strict';

var Page = require('../page');

//
// Default 404, not found page.
//
module.exports = Page.extend({
  statusCode: 404
});
