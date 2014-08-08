'use strict';

var debug = require('diagnostics')('bigpipe:primus')
  , async = require('async');

/**
 * Our real-time glue layer.
 *
 * @param {Spark} spark A new real-time connection has been made.
 * @api private
 */
module.exports = function connection(spark) {
  var pipe = this;

  debug('new real-time connection');

  //
  // The orchestrate "substream" is used to sync state back and forth between
  // a client and our BigPipe server. It allows us to know which pagelets are
  // available on a given page and even which page we're currently viewing.
  //
  var orchestrate = spark.substream('pipe:orchestrate')
    , pagelets = Object.create(null)
    , worker
    , page;

  worker = async.queue(function work(data, next) {
    switch (data.type) {
      //
      // The user has initiated a new Page so we need to get a new reference
      // to that page so we can get the correct pagelet instances.
      //
      case 'page':
        //
        // As part of setting a new Page instance, we need to release the
        // previously added pagelet
        //
        Object.keys(pagelets).forEach(function free(name) {
          delete pagelets[name];
        });

        spark.request.url = data.url || spark.request.url;
        pipe.router(spark.request, spark, data.id, function found(err, p) {
          if (err) return debug('Failed to initialise page %s: %j', spark.request.url, err), next();

          debug('initialised a new Page instance: %s', spark.request.url);

          //
          // Fake a HTTP response and request object.
          //
          p.req = spark.request;
          p.res = spark;

          spark.page = page = p;
          next();
        });
      break;

      //
      // The user has initialised a new pagelet for a given page.
      //
      case 'pagelet':
        if (data.name in pagelets) return debug('Pagelet %s is already initialised', data.name), next();
        if (!page) return debug('No initialised page, cannot initialise pagelet %j', data), next();
        if (!page.has(data.name)) return debug('Unknown pagelet, does not exist on page'), next();

        var pageletset = page.get(data.name);

        async.whilst(function canihas() {
          return !!pageletset.length;
        }, function work(next) {
          var Pagelet = pageletset.shift()
            , pagelet = new Pagelet({ temper: page.temper});

          pagelet.init({ page: page });
          pagelet.connect(spark, function connect(err) {
            if (err) {
              if (pagelet.destroy) pagelet.destroy();
              return next();
            }

            if (data.id && pagelet) pagelet.id = data.id;

            page.enabled.push(pagelet);
            pagelets[data.name] = pagelet;
            next();
          });
        }, function () {
          debug('Connected pagelet %s with the page', data.name);
          next();
        });

      break;
    }
  }, 1);

  orchestrate.on('data', function orchestration(data) {
    worker.push(data);
  });

  //
  // The current page id was sent with the connection string, so initialise
  // a new Page instantly using the given id.
  //
  if (spark.query._bp_pid) worker.push({ id: spark.query._bp_pid, type: 'page' });

  spark.once('end', function end() {
    debug('closed connection');

    spark.page = page = null;

    Object.keys(pagelets).forEach(function free(name) {
      delete pagelets[name];
    });
  });
};
