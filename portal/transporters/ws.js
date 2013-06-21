'use strict';

//
// Create a new WebSocket transporter.
//
module.exports = require('../transporter').extend({
  server: function server() {
    var WebSocket = require('ws');
  },

  client: function client() {
    var portal = this
      , socket;

    //
    // Selects an available WebSocket constructor.
    //
    var Socket = (function ws() {
      if ('undefined' !== typeof WebSocket) return WebSocket;
      if ('undefined' !== typeof MozWebSocket) return MozWebSocket;
      if ('function' === typeof require) return require('ws');

      return undefined;
    })();

    if (!Socket) return this.emit('connection failed');

    portal.on('portal::connect', function connect(url) {
      if (socket) socket.close();

      socket = new Socket(url);

      //
      // Setup the Event handlers.
      //
      socket.onopen = portal.emits('online');
      socket.onerror = portal.emits('error');
      socket.onclose = portal.emits('offline');
      socket.onmessage = portal.emits('data', function parse(evt) {
        return evt.data;
      });
    }).on('portal::write', function write(message) {
      if (socket) socket.send(message);
    }).on('portal::reconnect', function reconnect() {
      if (socket) socket.close();
    }).on('portal::close', function close() {
      if (socket) {
        socket.close();
        socket = null;
      }
    });
  }
});
