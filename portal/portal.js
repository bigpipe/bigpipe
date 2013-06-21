(function portalclient() {
  'use strict';

  function Portal(url) {
    this.url = this.parse(uri);
  }

  /**
   * Establish a connection with the server.
   *
   * @api private
   */
  Portal.prototype.connect = function connect() {

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

  //
  // These libraries are automatically are automatically inserted at the
  // serverside using the Portal#library method.
  //
  Portal.prototype.transporter = null; // @import {portal::transport};
  Portal.prototype.encoder = null; // @import {portal::encoder};
  Portal.prototype.decoder = null; // @import {portal::decoder};
  Portal.prototype.version = null; // @import {portal::version};
})(this);
