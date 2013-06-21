'use strict';

var Page = require('../page');

//
// Default 500 error page that will be served if none is provided.
//
module.exports = Page.extend({
  statusCode: 500
});
