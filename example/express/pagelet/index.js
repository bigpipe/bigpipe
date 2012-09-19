'use strict';

var Pagelet = require('../../../').Pagelet;

module.exports = Pagelet.extend({
    // name of the pagelet
    name: 'navigation'

    // events from the client
  , events: {
        'event': 'callback'
    }

    // client side assets
  , assets: {
        './pagelet.styl': {
            'description': 'The default location of the CSS for this pagelet'
        }
      , './pagelet.js': {
            'description': 'The default location of the JavaScript'
        }
    }

    /**
     * The server has connected.
     */
  , callback: function callback(data) {
      this.trigger('foo', 'bar');
    }

    /**
     * The pagelet has been initialized.
     */
  , initialize: function init() {
      this.resource('api', 'data', this.render.bind(this));
    }

    /**
     * Send a batch of data to the page.
     *
     * @param {Object} data from the initialize
     */
  , render: function render(data) {
      this.write('data' + JSON.stringify(data), function flush() {
        console.log('flushed');
      });
    }
});
