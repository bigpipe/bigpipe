# Acl

The Access Control List or `ACL` provides logic for granting and revoking access
to `Resources`. In most circumstances you'll only need a single `ACL` per `Pipe`
instance. The `ACL` can be used to assert which resources can be accessed by a
Pagelet `Pipe` has one `ACL` instance by default with a reference to the
resource pool.

```js
var ACL = require('acl')
  , Pool = require('pool');

var acl = new ACL({
  resources: new Pool({ type: 'resources' })
});
```

#### Logic

Before the `ACL` actually does anything, resources have to be granted access to
specific grantees. This access can also be revoked at any point. `assert` can be
called to check if the grantee is allowed to access the resource.

```js
acl.grant('guest', 'register'); // register is an actual pagelet.
acl.revoke('guest', 'register'); // don't allow registering anymore.
```

- Grantees can be anything from generalized roles (e.g. admin, guest), unique ids
  or specific user names.
- Resources are unique strings representing anything from pagelets to actual
  resources. If the resource can be found in the pool an additional assert
  function will be called on the resource.

#### Authorization

Each `Pagelet` has an authorize method which can extended with custom code, the
methods provided by the `ACL` or a mix of both. Since assert returns a Boolean
it works out of the box with authorize.

```js
Pagelet.extend({
    name: 'register'

  , authorize: function (req, done) {
      // assertion checks if the guest is allowed to register
      this.pipe.acl.assert('guest', 'register', done);
    }
});
```
