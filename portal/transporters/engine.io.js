'use strict';

/**
 * Minimum viable WebSocket server for Node.js that works through the portal
 * interface.
 *
 * @runat server
 * @api private
 */
function server() {
  var Engine = require('engine.io').Server
    , Stream = this.Stream
    , portal = this.portal;

  this.service = new Engine();

  this.engine.on('connection', function connection(socket) {
    var stream = new Stream(socket.request.headers, socket.request.address());

    stream.on('end', function end() {
      socket.end();
    }).on('data', function write(data) {
      socket.write(data);
    });

    socket.on('end', stream.emits('end'));
    socket.on('data', stream.emits('data'));
  });

  //
  // Listen to upgrade requests
  //
  this.on('upgrade', function upgrade(req, socket, head) {
    this.service.handleUpgrade(req, socket, head);
  }).on('request', function request(req, res) {
    this.service.handleRequest(req, res);
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

  if (!Socket) return this.emit('connection failed');

  portal.on('portal::connect', function connect(url) {
    if (socket) socket.close();

    socket = eio(url);

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
    if (socket) {
      socket.close();
      socket.open();
    }
  }).on('portal::close', function close() {
    if (socket) socket.close();
  });
}

//
// Expose the module as new Transporter instance.
//
module.exports = require('../transporter').extend({
  server: server,
  client: client
});
