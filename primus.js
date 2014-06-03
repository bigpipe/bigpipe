'use strict';

var debugs = require('diagnostics');

/**
 * Our real-time glue layer.
 *
 * @param {Spark} spark A new real-time connection has been made.
 * @api private
 */
module.exports = function connection(spark) {
  var debug = debugs('bigpipe:primus:'+ spark.id)
    , pipe = this;

  debug('new real-time connection');

  //
  // The orchestrate "substream" is used to sync state back and forth between
  // a client and our BigPipe server. It allows us to know which pagelets are
  // available on a given page and even which page we're currently viewing.
  //
  var orchestrate = spark.substream('pipe:orchestrate')
    , pagelets = Object.create(null)
    , page;

  orchestrate.on('data', function orchestration(data) {
    switch (data.type) {
      //
      // The user has initiated a new Page so we need to get a new reference
      // to that page so we can get the correct pagelet instances.
      //
      case 'page':
        if (page && page.free) page.free();

        //
        // As part of setting a new Page instance, we need to release the
        // previously added pagelet
        //
        Object.keys(pagelets).forEach(function free(name) {
          if (pagelets[name].free) pagelets[name].free();
          delete pagelets[name];
        });

        spark.request.url = data.url || spark.request.url;
        pipe.router(spark.request, spark, data.id, function found(err, p) {
          if (err) return debug('Failed to initialise page %s: %j', spark.request.url, err);

          debug('initialised a new Page instance: %s', spark.request.url);

          //
          // Fake a HTTP response and request object.
          //
          p.req = spark.request;
          p.res = spark;

          spark.page = page = p;
        });
      break;

      //
      // The user has initialised a new pagelet for a given page.
      //
      case 'pagelet':
        if (data.name in pagelets) return debug('Pagelet %s is already initialised', data.name);
        if (!page) return debug('No initialised page, cannot initialise pagelet %j', data);
        if (!page.has(data.name)) return debug('Unknown pagelet, does not exist on page');

        page.get(data.name).connect(spark, function substream(err, pagelet) {
          if (err) debug('error: Failed to connect to spark');
          if (data.id && pagelet) pagelet.id = data.id;

          debug('Connected pagelet %s with the page', data.name);

          page.enabled.push(pagelet);
          pagelets[data.name] = pagelet;
        });
      break;
    }
  });

  //
  // The current page id was sent with the connection string, so initialise
  // a new Page instantly using the given id.
  //
  if (spark.query._bp_pid) orchestrate.emit('data', {
    id: spark.query._bp_pid,
    type: 'page'
  });

  spark.once('end', function end() {
    debug('closed connection');

    if (page.free) page.free();
    spark.page = page = null;

    Object.keys(pagelets).forEach(function free(name) {
      if (pagelets[name].free) pagelets[name].free();
      delete pagelets[name];
    });
  });
};
