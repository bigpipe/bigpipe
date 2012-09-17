'use strict';

var Page, Pagelet, Instance, Store, PageLets;

/**
 * Creating a page that hosts different pagelets
 */
var x = Page.extend({
    path: /safsdfa/
  , method: 'GET'

  , pagelets: {
        'navigation': Pagelet
      , 'social': Pagelet
      , 'Interaction': Pagelet
    }

  , store: new Store()

    // resources that the above specified pagelets can use
  , resources: {
      'resouce': Instance // can be references
    }

    // assembles the page
  , assemble: function assemble(data) {
      this.fragement(); // sends chunks
      this.fragement(); // sends moar chunks
    }
});

var p = Pagelet.extend({
    name: 'navigation' // used for targetting

  , events: {
      'event': 'callback'
    }

  , callback: function callback(data) {

    }
});

/**
 * Attaching it to a server, for example express:
 */
var express = require('express')
  , app = express()
  , server = require('http').createServer(app);

var middleware = require('pagelets').attach(server, {
  pages: '/path'
, pages: [
    x, x, x, x
  ]
});

app.use(express.bodyParser());
app.use(express.csrf());
app.use(middleware);
