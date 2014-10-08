'use strict';

var debug = require('diagnostics')('bigpipe:primus')
  , async = require('async')
  , url = require('url');

/**
 * Our real-time glue layer.
 *
 * @param {Spark} spark A new real-time connection has been made.
 * @api private
 */
module.exports = function connection(spark) {
  var pipe = this;

  debug('New real-time connection');

  //
  // The orchestrate "substream" is used to sync state back and forth between
  // a client and our BigPipe server. It allows us to know which pagelets are
  // available on a given page and even which page we're currently viewing.
  //
  var orchestrate = spark.substream('pipe:orchestrate')
    , children = Object.create(null)
    , worker
    , parent;

  worker = async.queue(function work(data, next) {
    switch (data.type) {
      //
      // The user has initiated a new Parent Pagelet so we need to get
      // a new reference to that pagelet so we can get the correct children.
      //
      case 'parent':
        //
        // As part of setting a new parent instance, we need to release the
        // previously added pagelet
        //
        Object.keys(children).forEach(function free(name) {
          delete children[name];
        });

        spark.request.url = data.url || spark.request.url;
        spark.request.uri = url.parse(spark.request.url, true);

        pipe.router(spark.request, spark, data.id, function found(err, pagelet) {
          if (err) return debug('Failed to initialise parent Pagelet %s: %j', spark.request.url, err), next();

          debug('Initialised a new parent Pagelet instance: %s', spark.request.url);

          //
          // Fake a HTTP response and request object.
          //
          pagelet.req = spark.request;
          pagelet.res = spark;

          spark.parent = parent = pagelet;
          next();
        });
      break;

      //
      // The user has initialised a new pagelet for a given page.
      //
      case 'child':
        if (data.name in children) return debug('Child Pagelet %s is already initialised', data.name), next();
        if (!parent) return debug('No initialised parent Pagelet, cannot initialise child %j', data), next();
        if (!parent.has(data.name)) return debug('Unknown child pagelet, does not exist on parent'), next();

        var pagelets = parent.child(data.name);

        async.whilst(function canihas() {
          return !!pagelets.length;
        }, function work(next) {
          var Pagelet = pagelets.shift()
            , pagelet = new Pagelet({
                temper: parent.temper,
                req: parent.req,
                res: parent.res
              });

          //pagelet.init(); ??? is this required, triggers pagelets.async/sync
          pagelet.connect(spark, function connect(err) {
            if (err) {
              if (pagelet.destroy) pagelet.destroy();
              debug('Failed to connect', err);
              return next();
            }

            if (data.id && pagelet) pagelet.id = data.id;

            parent.enabled.push(pagelet);
            children[data.name] = pagelet;
            next();
          });
        }, function () {
          debug('Connected child pagelet %s with the parent pagelet %s', data.name, parent.name);
          next();
        });

      break;
    }
  }, 1);

  orchestrate.on('data', function orchestration(data) {
    worker.push(data);
  });

  //
  // The current parent Pagelet id was sent with the connection string,
  // so initialise a new Pagelet instantly using the given id.
  //
  if (spark.query._bp_pid) worker.push({ id: spark.query._bp_pid, type: 'parent' });

  spark.once('end', function end() {
    debug('closed connection');

    spark.parent = parent = null;

    Object.keys(children).forEach(function free(name) {
      delete children[name];
    });
  });
};
