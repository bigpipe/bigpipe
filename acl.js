'use strict';

//
// Shortcut reference to nextTick.
//
var defer = process.nextTick;

/**
 * Create a new ACL registry, heavily bound to control of resources,
 * pipe.resources is a collection of resources.
 *
 * @Constructor
 * @param {Object} options
 * @api public
 */
function Acl(pipe) {
  this.pipe = pipe;
  this.store = {};

  // Reference to collection of resources.
  this.resources = pipe.resources || {};
}

/**
 * Add resource to the list of the grantee.
 *
 * @param {String} grantee user/role
 * @param {String} resource name
 * @api public
 */
Acl.prototype.grant = function grant(grantee, resource) {
  if (!(grantee in this.store)) this.store[grantee] = [];

  this.store[grantee].push(resource);
  return this;
};

/**
 * Assert if the user or grantee is allowed to access the resource. If the
 * resource has an assert function, execute it before returning the result.
 *
 * @param {String} grantee name of the role, user, grantee
 * @param {String} resource name of the resource
 * @param {Function} fn callback
 * @api public
 */
Acl.prototype.assert = function assert(grantee, resource, fn) {
  var list = this.store[grantee]
    , pool = this.resources.get(resource)
    , ok = !!(list && ~list.indexOf(resource));

  // Apply the custom assert of the resource.
  if (ok && pool && 'assert' in pool) return pool.assert(function assertion(err, result) {
    defer(fn.bind(null, ok && result));
  });

  defer(fn.bind(null, ok));
};

/**
 * Remove resource from the list of the grantee.
 *
 * @param {String} grantee user/role
 * @param {String} resource name
 * @api public
 */
Acl.prototype.revoke = function revoke(grantee, resource) {
  if (!(grantee in this.store)) return this;

  var list = this.store[grantee]
    , index = list.indexOf(resource);

  if (~index) list.splice(index, 1);
  if (!list.length) delete this.store[grantee];

  return this;
};

//
// Initialize.
//
module.exports = Acl;
