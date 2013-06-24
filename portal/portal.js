(function portalclient() {
  'use strict';

  /* {portal::library} */

  /**
   * Portal in a real-time library agnostic framework for establishing real-time
   * connections with servers.
   *
   * @param {String} url The url of your server.
   */
  function Portal(url) {
    if (!(this instanceof Portal)) return new Portal(url);

    this.events = {};
    this.url = this.parse(url);

    this.initialise().connect();
  }

  /**
   * Initialise the portal and setup all parsers and internal listeners.
   *
   * @api private
   */
  Portal.prototype.initialise = function initalise() {
    var portal = this;

    this.on('portal::data', function message(data) {
      portal.decoder(data, function decoding(err, packet) {
        //
        // Do a "save" emit('error') when we fail to parse a message. We don't
        // want to throw here as listening to errors should be optional.
        //
        if (err) return portal.listeners('error').length && socket.emit('error', err);
        portal.emit('data', packet);
      });
    });

    return this;
  };

  /**
   * Establish a connection with the server.
   *
   * @api private
   */
  Portal.prototype.connect = function connect() {
    this.emit('portal::connect', this.uri());
  };

  /**
   * Parse the connection string.
   *
   * @param {String} url Connection url
   * @returns {Object} Parsed connection.
   * @api public
   */
  Portal.prototype.parse = function parse(url) {
    var a = document.createElement('a');
    a.href = url;

    return a;
  };

  /**
   * Generates a connection url.
   *
   * @returns {String} The url.
   * @api private
   */
  Portal.prototype.uri = function uri() {
    var server = [];

    server.push(this.url.protocol === 'https:' ? 'wss:' : 'ws:', '');
    server.push(this.url.host, this.pathname.slice(1));

    //
    // Optionally add a search query
    //
    if (this.url.search) server.push(this.url.search);
    return server.join('/');
  };

  /**
   * Emit an event to all registered event listeners.
   *
   * @param {String} event The name of the event.
   * @returns {Boolean} Indication if we've emitted an event.
   * @api public
   */
  Portal.prototype.emit = function emit(event) {
    if (!(event in this.events)) return false;

    var args = Array.prototype.slice.call(arguments, 1)
      , length = this.events[event].length
      , i = 0;

    for (; i < length; i++) {
      this.events[event][i].apply(this, args);
    }

    return true;
  };

  /**
   * Register a new EventListener for the given event.
   *
   * @param {String} event Name of the event.
   * @param {Functon} fn Callback function.
   * @api public
   */
  Portal.prototype.on = function on(event, fn) {
    if (!(event in this.events)) this.events[event] = [];
    this.events[event].push(fn);

    return this;
  };

  /**
   * Simple emit wrapper that returns a function that emits an event once it's
   * called. This makes it easier for transports to emit specific events. The
   * scope of this function is limited as it will only emit one single argument.
   *
   * @param {String} event Name of the event that we should emit.
   * @param {Function} parser Argument parser.
   * @api public
   */
  Portal.prototype.emits = function emits(event, parser) {
    var portal = this;

    return function emit(arg) {
      var data = parser ? parser.apply(portal, arguments) : arg;

      //
      // Timeout is required to prevent crashes on WebSockets connections on
      // mobile devices.
      //
      setTimeout(function timeout() {
        portal.emit('portal::'+ event, data);
      }, 0);
    };
  };

  //
  // These libraries are automatically are automatically inserted at the
  // serverside using the Portal#library method.
  //
  Portal.prototype.client = null; // @import {portal::transport};
  Portal.prototype.pathname = null; // @import {portal::pathname};
  Portal.prototype.encoder = null; // @import {portal::encoder};
  Portal.prototype.decoder = null; // @import {portal::decoder};
  Portal.prototype.version = null; // @import {portal::version};
})(this);
