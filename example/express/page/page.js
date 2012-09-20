'use strict';

var Page = require('../../../').Page;

module.exports = Page.extend({
    path: '/foo'
  , method: 'GET'

    // The pagelets of the page
  , pagelets: {
        'navigation': require('../pagelet')
    }

    // Resources api
  , resources: {
        'api': api
    }
});

/**
 * API resource.
 */
function api(data, callback) {
  setTimeout(function () {
    callback(null, { bar: 'bar', data: data });
  }, 300);
}
