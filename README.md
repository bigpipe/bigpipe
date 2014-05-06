# BigPipe [![Build Status][status]](https://travis-ci.org/bigpipe/bigpipe) [![NPM version][npmimgurl]](http://badge.fury.io/js/bigpipe) [![Coverage Status][coverage]](http://coveralls.io/r/bigpipe/bigpipe?branch=master)

[status]: https://travis-ci.org/bigpipe/bigpipe.png
[npmimgurl]: https://badge.fury.io/js/bigpipe.png
[coverage]: http://coveralls.io/repos/bigpipe/bigpipe/badge.png?branch=master

BigPipe is a radical new web framework that is inspired by the concept behind
Facebook's BigPipe. The general idea is to decompose web pages in to small
re-usable chunks of functionality called `Pagelets` and pipeline them through
several execution stages inside web servers and browsers. This allows progressive
rendering at the front-end and results in exceptional front-end performance.

Most web frameworks are based on request and response pattern, a request comes
in, we process the data and output a template. But before we can output the
template we have to wait until all data has been received in order for the
template to be processed. This doesn't make any sense for Node.js applications
where everything everything is done asynchronous. When received your first batch
of data, why not send it directly to the browser so it can start downloading the
required CSS, JavaScript and render it.

## Installation

BigPipe is distributed through the node package manager (npm) and is written
against Node.js 0.10.x.

```
npm install --save bigpipe
```

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
  pages: __dirname +'/pages',
  dist:  __dirname +'/dist'
});
```

The first argument in the function call is port number you want the server the
listen on. The second argument is an object with the configuration/options of the
BigPipe server. The following options are supported:

- **cache** A cache which is used for storing URL lookups. This cache instance
  should have a `.get(key)` and `.set(key, value)` method. Defaults to `false`
- **dist** The location of our folder where we can store our compiled CSS and
  JavaScript to disk. If the path or folder does not exist it will be
  automatically created. Defaults to `working dir/dist`.
- **domain** Use Node's domains when processing requests so errors are handled
  by BigPipe. Defaults to `true` if domains are supported, `false` if domains
  are not supported.
- **pages** A directory that contains your Page definitions or an array of Page
  constructors. Defaults to `working dir/dist`. If you don't provide Pages it
  will serve a 404 page for every request.
- **parser** The message parser we should use for our real-time communication.
  See [Primus] for the available parsers. Defaults to `JSON`.
- **pathname** The root path of an URL that we can use our real-time
  communication. This path should not be used by your Pages. Defaults to
  `/pagelet`
- **transformer** The transformer or real-time framework we should for the
  real-time communication. We're bundling and using `ws` by default. See [Primus]
  for the supported transformers. Please note that you do need to add the
  transformer dependency to your `package.json` when you choose something else
  than `ws`.
- **redirect** When creating a HTTPS server you could automatically start a HTTP
  server which redirects all traffic to the HTTPS equiv. The value is the port
  number on which this server should be started. Defaults to `false`.

In addition to the options above, all options of a HTTPS server are also
supported.  When you provide the server with cert and key files or set the
port number to `443` it assumes you want to setup up a HTTPS server instead.

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
use the `bigpipe.listen` method to listen to the server. When this is called we
will start our compiling all assets, attach the correct listeners to the
supplied server, attach event listeners and finally listen on the server. The
first argument of this method is the port number you want to listen on, the
second argument is an optional callback function that should be called when
server is listening for requests.

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
bigpipe.define(pages, callback);
```

Merge page or pages in the collection of existing pages. If given a string it
will search that directly for the available Page files. After all dependencies
have been compiled the supplied callback is called.

```js
bigpipe.define('../pages', function done(err) {

});

bigpipe.define([Page, Page, Page], function done(err) {

}).define('../more/pages', function done(err) {

});
```

### BigPipe.before()

**public**, _returns BigPipe_.

```js
bigpipe.before(name, fn, options);
```

BigPipe has two ways of extending it's build-in functionality, we have plugins
but also middleware layers. The important difference between these is that
middleware layers allow you modify the incoming requests **before** they are
used by BigPipe.

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
supplied function has less than **2** arguments. When we detect these function
we automatically call the function with the context that is set to `BigPipe` and
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
- **req** The outgoing HTTP response.
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

Temporarily disable a middleware layer, it's not removed from the stack but it's
just skipped when we iterate over the middleware layers. When a middleware layer
has been disabled you can re-enable it.

```js
bigpipe.before('layer', function () {});
bigpipe.disable('layer');
```

### BigPipe.enable()

**public**, _returns BigPipe_.

```js
bigpipe.enable(name);
```

Re-Enable a previously disabled module.

```js
bigpipe.disable('layer');
bigpipe.enable('layer');
```

### BigPipe.use()

**public**, _returns BigPipe_.

```js
bigpipe.use(name, plugin);
```

Plugins can be used to extend the functionality of BigPipe it self. You can
control the client code as well as the server side code of BigPipe using the
plugin interface. 

```js
bigpipe.use('ack', {
  //
  // Only ran on the server.
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

### Page.path

_required:_ **writable, string**

The HTTP pathname or URL we that we should respond to. The routing make use of
the [routable](https://github.com/bigpipe/routable) module for all of it's path
matching. This allows you to use:

- **plain strings:** `'/foo/bar'`
- **capturing strings:** `'/foo/:bar'`
- **regexp**: `/^\/foo\/bar$/`
- **capturing regexp**: `/^\/(foo|bar)\/bar$/`
- **xRegExp**: `'/^\\/(?<named>[\\d\\.]+)\\/foo/'`

```js
Page.extend({
  path: '/'
}).on(module);
```

### Page.view

_required:_ **writable, string**

The location of the base template which will be flushed to the browser as the
first chunk of content. In your template we will introduce a `bootstrap`
variable that needs to be placed in the `<head>` of HTML. Make sure when you're
outputting this `bootstrap` variable is that it's **not** escaping the HTML tags.

```html
<!doctype html>
<html class="no-js">
<head>
  <%- bootstrap %>
</head>
```

The template engine that you use should be supported by the [temper] project. The
path the template is relative to the location of the Page. So you don't need to
the nasty `path.join(__dirname, 'folder')` "hack" to set the correct template.

```js
Page.extend({
  view: '../views/index.ejs'
}).on(module);
```

### Page.charset

_optional:_ **writable, string**

The meta character set for the Page. We add a `<meta charset="">` to the bootstrap
code by default so the browser doesn't have to do any HTML buffering in order to
figure out what charset it should render the HTML in.

When you set this to `null` it will not include the meta charset, but this it not
advised.

**Default value**: `utf-8`

```js
Page.extend({
  charset: 'UTF-8'
}).on(module);
```

### Page.contentType

_optional:_ **writable, string**

The Content-Type of the response. This defaults to text/html with a charset
preset. The charset does not inherit it's value from the `charset` option.

**Default value**: `text/html; charset=UTF-8`

```js
Page.extend({
  contentType: 'text/html; charset=UTF-7"
}).on(module);
```

### Page.method

_optional:_ **writable, string or array**

Which HTTP methods should this page accept. It can be string with comma separated
values or an Array with all the individual methods.

**Default value**: `GET`

```js
Page.extend({
  method: ['GET', 'POST', 'HEAD']`
}).on(module);
```

Or using a string:

```js
Page.extend({
  method: 'GET, POST, HEAD'
}).on(module);
```

### Page.statusCode

_optional:_ **writable, number**

The default status code that we should send back to the response.

**Default value**: `200`

```js
Page.extend({
  statusCode: 416
}).on(module);
```

### Page.authorize

_optional:_ **writable, function**

An authorization handler to see if the request is authorized to interact with
this page. This is set to `null` by default as there isn't any
authorization in place. The authorization function will receive 2 arguments:

- **req**: the http request that initialized the pagelet
- **done**: a callback function that needs to be called with only a boolean.

```js
Page.extend({
  authorize: function authorize(req, done) {
    done(true); // True indicates that the request is authorized for access.
  }
}).on(module);
```

### Page.mode

_optional:_ **writable, string**

What kind of generation mode should we render the pagelets. There are 3 different
render modes available:

- **sync**: Render all the pagelets in a single flush so we don't rely on
  JavaScript to be active in the browser to put the rendered pagelets in their
  correct positions again. This is set by default if your browser is not
  supporting JavaScript or doesn't support HTTP 1.1 chunking.
- **async**: Render all pagelets as fast as possible and flush them to the
  response once they are done with rendering. The client side would then place
  the pagelets in their correct place holders. There is no pre-defined order
  when we are rendering.
- **pipeline**: Almost the same as **async** rendering but the main difference
  is that the pagelets are flushed in the order that we're defined on the
  `pagelet` object.

**Default value**: `async`

```js
Page.extend({
  mode: 'async'
}).on(module);
```

## Events

Everything in BigPipe is build upon the EventEmitter interface. It's either a
plain EventEmitter or a proper stream. This a summary of the events we emit:

Event                 | Usage       | Location      | Description
----------------------|-------------|---------------|-------------------------------
`log`                 | public      | server        | A new log message.
`transform::pagelet`  | public      | server        | Transform a Pagelet
`transform::page`     | public      | server        | Transform a Page
`listening`           | public      | server        | The server is listening
`error`               | public      | server        | The HTTP serer received an error
`pagelet::configure`  | public      | server        | A new pagelet has been configured
`page::configure`     | public      | server        | A new page has been configured

## Debugging

The library makes use the `debug` module and has all it's internals namespaced
to `bigpipe:`. These debug messages can be trigged by starting your application
with the `DEBUG=` env variable. In order to filter out all messages except
BigPipe's message run your server with the following command:

```bash
DEBUG=bigpipe:* node <server.js>
```

The following `DEBUG` namespaces are available:

- `bigpipe:server` The part that handles the request dispatching, page / pagelet
  transformation and more.
- `bigpipe:page` Page generation.
- `bigpipe:compiler` Asset compilation.
- `bigpipe:primus` BigPipe Primus setup.
- `pagelet:primus` Pagelet and Primus interactions
- `pagelet` Pagelet interactions

## Testing

Tests are automatically run on [Travis CI] to ensure that everything is
functioning as intended. For local development we automatically install a
[pre-commit] hook that runs the `npm test` command every time you commit changes.
This ensures that we don't push any broken code in to this project.

## License

BigPipe is released under MIT.

[Travis CI]: http://travisci.org
[pre-commit]: http://github.com/observing/pre-commit
[Primus]: https://github.com/primus/primus
[temper]: https://github.com/bigpipe/temper
