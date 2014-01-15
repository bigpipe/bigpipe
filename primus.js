'use strict';

var debug = require('debug')('bigpipe:primus');

module.exports = function connection(spark) {
  //
  // Setup the pipe substream which.
  //
  var orchestrate = spark.substream('pipe::orchestrate')
    , pipe = this
    , streams = {};

  /**
   * Configure a pagelet for substreaming.
   *
   * @param {Pagelet} pagelet The pagelet we need.
   * @api private
   */
  function substream(pagelet) {
    if (streams[pagelet.name]) return debug('already configured the Spark');

    debug('creating a new substream for pagelet::%s (%s)', pagelet.name, pagelet.id);
    var stream = streams[pagelet.name] = spark.substream('pagelet::'+ pagelet.name);

    //
    // Let the pagelet know that we've paired with a substream and spark.
    //
    if ('function' === typeof pagelet.pair) pagelet.pair(stream, spark);

    //
    // Incoming communication between the pagelet and it's substream.
    //
    stream.on('data', function substreamer(data) {
      if (!pagelet) return debug('substream data event called after pagelet was removed');

      switch (data.type) {
        case 'rpc':
          pagelet.trigger(data.method, data.args, data.id, stream);
        break;
      }
    });

    stream.on('end', function end() {
      debug('substream has ended: %s/%s', pagelet.name, pagelet.id);
      delete streams[pagelet.name];
    });
  }

  //
  // Incoming communication between our spark and the pagelet orchestration.
  //
  orchestrate.on('data', function orchestration(data) {
    switch (data.type) {
      case 'configure':
        return;
        var pagelet = pipe.expire.get(data.id);

        if (pagelet) {
          debug('registering Pagelet %s/%s as new substream', pagelet.name, data.id);
          substream(pipe.expire.get(data.id));
        }
      break;
    }
  });

  spark.on('end', function end() {
    //
    // Free all allocated pages and nuke all pagelets.
    //
    debug('connection has ended: %s were still active', Object.keys(streams).length);
  });
};
