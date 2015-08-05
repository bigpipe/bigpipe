# BigPipe

[![Version npm][version]](http://browsenpm.org/package/bigpipe)[![Build Status][build]](https://travis-ci.org/bigpipe/bigpipe)[![Dependencies][david]](https://david-dm.org/bigpipe/bigpipe)[![Coverage Status][cover]](https://coveralls.io/r/bigpipe/bigpipe?branch=master)

[version]: http://img.shields.io/npm/v/bigpipe.svg?style=flat-square
[build]: http://img.shields.io/travis/bigpipe/bigpipe/master.svg?style=flat-square
[david]: https://img.shields.io/david/bigpipe/bigpipe.svg?style=flat-square
[cover]: http://img.shields.io/coveralls/bigpipe/bigpipe/master.svg?style=flat-square

BigPipe is a radical new web framework for Node.JS. The general idea is to
decompose web pages into small re-usable chunks of functionality called
`Pagelets` and pipeline them through several execution stages inside web
servers and browsers. This allows progressive rendering at the front-end and
results in exceptional front-end performance.

Most web frameworks are based on a request and response pattern, a request comes
in, we process the data and output a template. But before we can output the
template we have to wait until all data has been received in order for the
template to be processed. This doesn't make any sense for Node.js applications
where everything is done asynchronously. When receiving your first batch
of data, why not send it directly to the browser so it can start downloading the
required CSS, JavaScript and render it.

BigPipe is made up over 20 modules whose current status is available at: [HEALTH.md](HEALTH.md)

## Installation

BigPipe is distributed through the node package manager (npm) and is written
against Node.js 0.10.x.

```
npm install --save bigpipe
```

## Versioning

To keep track of cross module compatibility, the imported components will be synced
on minor releases. For example, `bigpipe@0.5.0` will always be compatible with
`pagelet@0.5.0` and `pipe.js@0.5.0`.

## Support

Got stuck? Or can't wrap your head around a concept or just want some feedback,
we got a dedicated IRC channel for that on Freenode:

- **IRC Server**: `irc.freenode.net`
- **IRC Room**: `#bigpipe`

Still stuck? Create an issue. Every question you have is a bug in our
documentation and that should be corrected. So please, don't hesitate to create
issues, many of them.

## Table of Contents

**BigPipe**
- [Getting started](#getting-started)
- [BigPipe.createServer()](#bigpipecreateserver)
- [new BigPipe()](#new-bigpipe)
- [BigPipe.version](#bigpipeversion)
- [BigPipe.define()](#bigpipedefine)
- [BigPipe.before()](#bigpipebefore)
- [BigPipe.remove()](#bigpiperemove)
- [BigPipe.disable()](#bigpipedisable)
- [BigPipe.enable()](#bigpipeenable)
- [BigPipe.use()](#bigpipeuse)

### Getting started

In all of these example we assume that your file is setup as:

```js
'use strict';

var BigPipe = require('bigpipe');
```

### BigPipe.createServer()

**public**, _returns BigPipe_.

To create a BigPipe powered server can simply call the `createServer` method.
This creates an HTTP or HTTPS server based on the options provided.

```js
var bigpipe = BigPipe.createServer(8080, {
  pagelets: __dirname +'/pagelets',
  dist:  __dirname +'/dist'
});
```

The first argument in the function call is port number you want the server to
listen on. The second argument is an object with the configuration/options of the
BigPipe server. The following options are supported:

- **cache** A cache which is used for storing URL lookups. This cache instance
  should have a `.get(key)` and `.set(key, value)` method. Defaults to `false`
- **dist** The location of our folder where we can store our compiled CSS and
  JavaScript to disk. If the path or folder does not exist it will be
  automatically created. Defaults to `working dir/dist`.
- **pagelets** A directory that contains your Pagelet definitions or an array of Pagelet
  constructors. Defaults to `working dir/pagelets`. If you don't provide Pages it
  will serve a 404 page for every request.
- **parser** The message parser we should use for our real-time communication.
  See [Primus] for the available parsers. Defaults to `JSON`.
- **pathname** The root path of an URL that we can use our real-time
  communication. This path should not be used by your Pages. Defaults to
  `/pagelet`
- **transformer** The transformer or real-time framework we want to use for the
  real-time communication. We're bundling and using `ws` by default. See [Primus]
  for the supported transformers. Please note that you do need to add the
  transformer dependency to your `package.json` when you choose something other
  than `ws`.
- **redirect** When creating a HTTPS server you could automatically start an HTTP
  server which redirects all traffic to the HTTPS equiv. The value is the port
  number on which this server should be started. Defaults to `false`.

In addition to the options above, all HTTPS server options are also
supported.  When you provide a server with cert and key files or set the
port number to `443`, it assumes you want to setup up a HTTPS server instead.

```js
var bigpipe = BigPipe.createServer(443, {
  key: fs.readFileSync(__dirname +'/ssl.key', 'utf-8'),
  cert: fs.readFileSync(__dirname +'/ssl.cert', 'utf-8')
});
```

When you're creating an HTTPS server you got to option to also setup a simple
HTTP server which redirects all content to HTTPS instead. This is done by
supplying the `redirect` property in the options. The value of this property
should be the port number you want this HTTP server to listen on:

```js
var bigpipe = BigPipe.createServer(443, {
  ..

  key: fs.readFileSync(__dirname +'/ssl.key', 'utf-8'),
  cert: fs.readFileSync(__dirname +'/ssl.cert', 'utf-8'),
  redirect: 80
});
```

### new BigPipe()

**public**, _returns BigPipe_.

If you want more control over the server creation process you can manually
create a HTTP or HTTPS server and supply it to the BigPipe constructor.

```js
'use strict';

var server = require('http').createServer()
  , BigPipe = require('bigpipe');

var bigpipe = new BigPipe(server, { options });
```

If you are using this pattern to create a BigPipe server instance you need to
use the `bigpipe.listen` method to listen to the server. When this is called,
BigPipe starts compiling all assets, attach the correct listeners to the
supplied server, attach event listeners and finally listen on the server. The
first argument of this method is the port number you want to listen on, the
second argument is an optional callback function that should be called when
server starts listening for requests.

```js
bigpipe.listen(8080, function listening() {
  console.log('hurray, we are listening on port 8080');
});
```

### BigPipe.version

**public**, _returns string_.

```js
bigpipe.version;
```

The current version of the BigPipe framework that is running.

### BigPipe.define()

**public**, _returns BigPipe_.

```js
bigpipe.define(pagelets, callback);
```

Merge pagelet(s) in the collection of existing pagelets. If given a string it
will search that directory for the available Pagelet files. After all dependencies
have been compiled the supplied, the callback is called.

```js
bigpipe.define('../pagelets', function done(err) {

});

bigpipe.define([Pagelet, Pagelet, Pagelet], function done(err) {

}).define('../more/pagelets', function done(err) {

});
```

### BigPipe.before()

**public**, _returns BigPipe_.

```js
bigpipe.before(name, fn, options);
```

BigPipe has two ways of extending it's build-in functionality, we have plugins
but also middleware layers. The important difference between these is that
middleware layers allow you to modify the incoming requests **before** they
reach BigPipe.

There are 2 different kinds of middleware layers, **async** and **sync**. The
main difference is that the **sync** middleware doesn't require a callback. It's
completely optional and ideal for just introducing or modifying the properties
on a request or response object.

All middleware layers need to be named, this allows you to enable, disable or
remove the middleware layers. The supplied middleware function can either be a
pre-configured function that is ready to modify the request and responses:

```js
bigpipe.before('foo', function (req, res) {
  req.foo = 'bar';
});
```

Or an unconfigured function. We assume that a function is unconfigured if the
supplied function has less than **2** arguments. When we detect such a function
we automatically call it with the context that is set to `BigPipe` and
the supplied options object and assume that it returns a configured middleware
layer.

```js
bigpipe.before('foo', function (configure) {
  return function (req, res) {
    res.foo = configure.foo;
  };
}, { foo: 'bar' });
```

If you're building async middleware layers, you simply need to make sure that
your function accepts 3 arguments:

- **req** The incoming HTTP request.
- **res** The outgoing HTTP response.
- **next** The continuation callback function. This function follows the error
  first callback pattern.

```js
bigpipe.before('foo', function (req, res, next) {
  asyncthings(function (err, data) {
    req.foo = data;
    next(err);
  });
});
```

### BigPipe.remove()

**public**, _returns BigPipe_.

```js
bigpipe.remove(name);
```

Removes a middleware layer from the stack based on the given name.

```js
bigpipe.before('layer', function () {});
bigpipe.remove('layer');
```

### BigPipe.disable()

**public**, _returns BigPipe_.

```js
bigpipe.disable(name);
```

Temporarily disables a middleware layer. It's not removed from the stack but it's
just skipped when we iterate over the middleware layers. A disabled middleware layer
can be re-enabled.

```js
bigpipe.before('layer', function () {});
bigpipe.disable('layer');
```

### BigPipe.enable()

**public**, _returns BigPipe_.

```js
bigpipe.enable(name);
```

Re-enable a previously disabled module.

```js
bigpipe.disable('layer');
bigpipe.enable('layer');
```

### BigPipe.use()

**public**, _returns BigPipe_.

```js
bigpipe.use(name, plugin);
```

Plugins can be used to extend the functionality of BigPipe itself. You can
control the client code as well as the server side code of BigPipe using the
plugin interface.

```js
bigpipe.use('ack', {
  //
  // Only run on the server.
  //
  server: function (bigpipe, options) {
     // do stuff
  },

  //
  // Runs on the client, it's automatically bundled.
  //
  client: function (bigpipe, options) {
     // do client stuff
  },

  //
  // Optional library that needs to be bundled on the client (should be a string)
  //
  library: '',

  //
  // Optional plugin specific options, will be merged with Bigpipe.options
  //
  options: {}
});
```

## Pagelets

Pagelets are part of the bigpipe/pagelet module and more information is available at: https://github.com/bigpipe/pagelet

## Events

Everything in BigPipe is build upon the EventEmitter interface. It's either a
plain EventEmitter or a proper stream. This a summary of the events we emit:

Event                 | Usage       | Location      | Description
----------------------|-------------|---------------|-------------------------------
`log`                 | public      | server        | A new log message
`transform::pagelet`  | public      | server        | Transform a Pagelet
`listening`           | public      | server        | The server is listening
`error`               | public      | server        | The HTTP server received an error
`pagelet::configure`  | public      | server        | A new pagelet has been configured

## Debugging

The library makes use of the `diagnostics` module and has all it's internals namespaced
to `bigpipe:`. These debug messages can be trigged by starting your application
with the `DEBUG=` env variable. In order to filter out all messages except
BigPipe's message run your server with the following command:

```bash
DEBUG=bigpipe:* node <server.js>
```

The following `DEBUG` namespaces are available:

- `bigpipe:server` The part that handles the request dispatching, page / pagelet
  transformation and more.
- `bigpipe:pagelet` Pagelet generation.
- `bigpipe:compiler` Asset compilation.
- `bigpipe:primus` BigPipe Primus setup.
- `pagelet:primus` Pagelet and Primus interactions
- `pagelet` Pagelet interactions

## Testing

Tests are automatically run on [Travis CI] to ensure that everything is
functioning as intended. For local development we automatically install a
[pre-commit] hook that runs the `npm test` command every time you commit changes.
This ensures that we don't push any broken code into this project.

## Inspiration

Bigpipe is inspired by the concept behind Facebook's BigPipe. For more details
read their blog post: [Pipelining web pages for high performance][blog].


## License

BigPipe is released under MIT.

[Travis CI]: http://travisci.org
[pre-commit]: http://github.com/observing/pre-commit
[Primus]: https://github.com/primus/primus
[temper]: https://github.com/bigpipe/temper
[blog]: https://www.facebook.com/notes/facebook-engineering/bigpipe-pipelining-web-pages-for-high-performance/389414033919
