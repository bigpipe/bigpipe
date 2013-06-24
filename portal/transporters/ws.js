'use strict';

/**
 * Minimum viable WebSocket server for Node.js that works through the portal
 * interface.
 *
 * @runat server
 * @api private
 */
function server() {
  var WebSocketServer = require('ws').Server
    , Stream = this.Stream
    , portal = this.portal;

  this.service = new WebSocketServer({ noServer: true });

  //
  // Listen to upgrade requests
  //
  this.on('upgrade', function upgrade(req, socket, head) {
    this.service.handleUpgrade(req, socket, head, function create(socket) {
      var stream = new Stream(socket.upgradeReq.headers, socket.upgradeReq.address());

      stream.on('end', function end() {
        socket.end();
      }).on('data', function write(data) {
        socket.write(data);
      });

      socket.on('end', stream.emits('end'));
      socket.on('data', stream.emits('data'));
    });
  });
}

/**
 * Minimum viable WebSocket client. This function is stringified and written in
 * to our client side library.
 *
 * @runat client
 * @api private
 */
function client() {
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
    socket.onopen = portal.emits('open');
    socket.onerror = portal.emits('error');
    socket.onclose = portal.emits('close');
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

//
// Expose the module as new Transporter instance.
//
module.exports = require('../transporter').extend({
  server: server,
  client: client
});
