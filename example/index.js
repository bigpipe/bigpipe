'use strict';

var Page, Pagelet, Instance, Store;

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
