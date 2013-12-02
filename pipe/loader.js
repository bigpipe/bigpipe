'use strict';

var collection = require('./collection')
  , styleSheets = []
  , metaQueue = {}
  , timeout = 5000
  , assets = {};

/**
 * Check if all style sheets have been correctly injected by looping over the
 * metaQueue.
 *
 * @returns {Boolean} All style sheets have been loaded.
 * @api private
 */
function loaded() {
  var meta, url, style;

  for (url in metaQueue) {
    meta = metaQueue[url];

    if (new Date() - meta.start > timeout) {
      meta.fn(new Error('The styleSheet has timed out'));
      delete meta.fn;
    } else {
      style = window.getComputedStyle
        ? getComputedStyle(meta.tag, null)
        : meta.tag.currentStyle;

      //
      // We assume that the CSS set the height property for the given id selector.
      //
      if (style && meta.fn && parseInt(style.height, 10) > 1) {
        meta.fn();
        delete meta.fn;
      }
    }

    if (!meta.fn) {
      meta.tag.parentNode.removeChild(meta.tag);
      delete metaQueue[url];
    }
  }

  return collection.empty(metaQueue);
}

/**
 * Start polling for Style Sheet changes to detect if a Style Sheet has been
 * loaded. This is done by injecting a <meta> tag in to the page with
 * a dedicated `id` attribute that matches a selector that we've added in the
 * server side for example:
 *
 * ```css
 * #pagelet_af3f399qu { height: 42px }
 * ```
 *
 * @api private
 */
function poll(url, root, fn) {
  var meta = document.createElement('meta');
  meta.id = 'pagelet_'+ url.split('/').pop().replace('.css', '').toLowerCase();
  root.appendChild(meta);

  metaQueue[url] = {
    start: +new Date(),
    tag: meta,
    fn: fn
  };

  //
  // Do a quick check before trying to poll, it could be that style sheet was
  // cached and was loaded instantly on the page.
  //
  if (loaded()) return;

  if (!poll.interval) poll.interval = setInterval(function interval() {
    if (loaded()) clearInterval(poll.interval);
  }, 20);
}

/**
 * Try to detect if this browser supports the onload events on the link tag.
 * It's a known cross browser bug that can affect WebKit, FireFox and Opera.
 * Internet Explorer is the only browser that supports the onload event
 * consistency but it has other bigger issues that prevents us from using this
 * method.
 *
 * @param {Element} target
 * @api private
 */
function detect(target) {
  if (detect.ran) return;
  detect.ran = true;

  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'data:text/css;base64,';

  link.onload = function loaded() {
    link.parentNode.removeChild(link);
    link.onload = false;
    detect.onload = true;
  };

  target.appendChild(link);
}

/**
 * Load a new style sheet.
 *
 * @param {String} url The style sheet URL that needs to be loaded.
 * @param {Function} fn Completion callback.
 * @api private
 */
function loadStyleSheet(root, url, fn) {
  if (url in assets) return fn();

  //
  // Internet Explorer can only have 31 style tags on a single page. One single
  // style tag is also limited to 31 @import statements so this gives us room to
  // have 961 style sheets totally. So we should queue style sheets. This
  // limitation has been removed in Internet Explorer 10.
  //
  // @see http://john.albin.net/ie-css-limits/two-style-test.html
  // @see http://support.microsoft.com/kb/262161
  // @see http://blogs.msdn.com/b/ieinternals/archive/2011/05/14/internet-explorer-stylesheet-rule-selector-import-sheet-limit-maximum.aspx
  //
  if (document.styleSheet) {
    for (var sheet, i = 0; i < styleSheets.length; i++) {
      if (styleSheets[i].imports.length < 31) {
        sheet = i;
        break;
      }
    }

    //
    // We didn't find suitable style Sheet to add another @import statement,
    // create a new one so we can leverage that instead.
    //
    // @TODO we should probably check the amount of `document.styleSheets.length`
    //       to check if we're allowed to add more style sheets.
    //
    if (sheet === undefined) {
      styleSheets.push(document.createStyleSheet());
      sheet = styleSheets.length - 1;
    }

    styleSheets[sheet].addImport(url);
    assets[url] = styleSheets[sheet];
    return poll(url, root, fn);
  }

  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = url;

  //
  // Only add the onload/onerror listeners when we've detected that's it's
  // supported in the browser.
  //
  if (detect.onload) {
    link.onerror = function onerror() {
      link.onerror = link.onload = null;
      fn(new Error('Failed to load the stylesheet.'));
    };

    link.onload = function onload() {
      link.onerror = link.onload = null;
      fn();
    };
  } else {
    poll(url, root, fn);

    //
    // We don't have a detect.onload, make sure we've started our feature
    // detection.
    //
    if (!detect.ran) detect(root);
  }

  assets[url] = link;
  root.appendChild(link);
}

/**
 * Remove a style sheet again.
 *
 * @param {String} url The style sheet URL that needs to be unloaded.
 * @api private
 */
function unloadStyleSheet(url) {
  if (!(url in assets)) return;

  var asset = assets[url];

  if (!asset.imports) {
    asset.onload = asset.onerror = null;
    asset.parentNode.removeChild(asset);
  } else {
    for (var i = 0, length = asset.imports.length; i < length; i++) {
      if (asset.imports[i].href === url) {
        asset.removeImport(i);
        break;
      }
    }
  }

  delete assets[url];
  delete metaQueue[url];
}

/**
 * Load a new Script.
 *
 * @param {String} url The script file that needs to be loaded in to the page.
 * @param {Function} fn The completion callback.
 * @api private
 */
function loadJavaScript(root, url, fn) {
  if (url in assets) return fn();

  var script = document.createElement('script');
  script.async = true; // Required for FireFox 3.6 / Opera async loading.

  //
  // onerror is not triggered by all browsers, but should give us a clean
  // indication of failures.
  //
  script.onerror = function onerror() {
    script.onerror = script.onload = script.onreadystatechange = null;
    fn(new Error('Failed to load the script.'));
  };

  //
  // All "latest" browser seem to support the onload event for detecting full
  // script loading. Internet Explorer 11 no longer needs to use the
  // onreadystatechange method for completion indication.
  //
  script.onload = function onload() {
    script.onerror = script.onload = script.onreadystatechange = null;
    fn();
  };

  //
  // Fall-back for older IE versions, they do not support the onload event on the
  // script tag and we need to check the script readyState to see if it's
  // successfully loaded.
  //
  script.onreadystatechange = function onreadystatechange() {
    if (this.readyState in { loaded: 1, complete: 1 }) {
      script.onerror = script.onload = script.onreadystatechange = null;
      fn();
    }
  };

  //
  // The src needs to be set after the element has been added to the document.
  // If I remember correctly it had to do something with an IE8 bug.
  //
  root.appendChild(script);
  script.src = url;

  assets[url] = script;
}

/**
 * Remove the loaded script source again.
 *
 * @param {String} url The script URL that needs to be unloaded
 * @api private
 */
function unloadJavaScript(url) {
  if (!(url in assets)) return;

  var asset = assets[url];
  asset.onload = asset.onerror = asset.onreadystatechange = null;
  asset.parentNode.removeChild(asset);

  delete assets[url];
}

/**
 * Load a new resource.
 *
 * @param {Element} root The root node where we should insert stuff in.
 * @param {String} url The location of the asset.
 * @param {Function} fn Completion callback.
 * @api public
 */
exports.load = function load(root, url, fn) {
  if ('js' !== url.split('.').pop()) {
    return loadStyleSheet(root, url, fn);
  }

  loadJavaScript(root, url, fn);
};

/**
 * Unload a new resource.
 *
 * @param {String} url The location of the asset.
 * @api public
 */
exports.unload = function unload(url) {
  if ('js' !== url.split('.').pop()) {
    return unloadStyleSheet(url);
  }

  unloadJavaScript(url);
};
