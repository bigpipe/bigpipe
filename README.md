# Pagelets

Pagelets is inspired by Facebooks BigPipe implementation. The general idea is to
decompose web pages into small chunks called pagelets, and pipeline them through
several execution stages inside web servers and browsers. Pagelets exploit the
parallelism between web server and browser. The amount of resources send with
the initial request are kept at a minimum. Each pagelets will get its JS and CSS
assets by stream.

## Installation

To use pagelets as dependency simply use nmp to install and save the module to
*package.json*

```
npm install pagelets -save
```

## Testing

Tests can be run by calling `npm test`. Make sure the module has its
dependencies installed.
