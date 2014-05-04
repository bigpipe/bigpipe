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

### Installation

BigPipe is distributed through the node package manager (npm) and is written
against Node.js 0.10.x.

```
npm install --save bigpipe
```

### Support

Got suck? Or can't wrap your head around a concept or just want some feedback,
we got a dedicated IRC channel for that on Freenode:

```
  server: irc.freenode.net
  room: #bigpipe
```

Still suck? Create an issue. Every question you have is a bug in our
documentation and that should be corrected. So please, don't hesitate to create
issues, many of them.

### Getting started

In all of these example we assume that your file is setup as:

```js
'use strict';

var BigPipe = require('bigpipe');
```

### BigPipe.createServer()

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

**public**, _returns BigPipe.

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
``

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

### Events

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

### Debugging

The library makes use the `debug` module and has all it's internals namespaced
to `bigpipe:`. These debug messages can be trigged by starting your application
with the `DEBUG=` env variable. In order to filter out all messages except
bigpipe's message run your server with the following command:

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

### Testing

Tests are automatically run on [Travis CI] to ensure that everything is
functioning as intended. For local development we automatically install a
[pre-commit] hook that runs the `npm test` command every time you commit changes.
This ensures that we don't push any broken code in to this project.

### License

BigPipe is released under MIT.

[Travis CI]: http://travisci.org
[pre-commit]: http://github.com/observing/pre-commit
[Primus]: https://githbu.com/primus/primus
