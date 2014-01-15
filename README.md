```
This module is actively being developed. If you are a fearless developer that
isn't scared for a couple bugs you're more than welcome to go on this adventure.
If not, please wait until 1.0 has been released.
```

[![Build Status](https://travis-ci.org/bigpipe/bigpipe.png?branch=master)](https://travis-ci.org/bigpipe/bigpipe)

# BigPipe

BigPipe is a radical new web framework that is inspired by the concept behind
Facebook's BigPipe. The general idea is to decompose web pages in to small
re-usable chunks of functionality called `Pagelets` and pipeline them through
several execution stages inside web servers or browsers. This allows progressive
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
- `bigpipe:pagelet` Pagelet interactions
- `bigpipe:page` Page generation.
- `bigpipe:compiler` Asset compilation.

### Testing

Tests are automatically run on [Travis CI] to ensure that everything is
functioning as intended. For local development we automatically install a
[pre-commit] hook that runs the `npm test` command every time you commit changes.
This ensures that we don't push any broken code in to this project.

### License

BigPipe is released under MIT.

[Travis CI]: http://travisci.org
[pre-commit]: http://github.com/observing/pre-commit
