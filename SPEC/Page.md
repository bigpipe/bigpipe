# Page

The `Page` instance is basically a collection of different `Pagelet`
constructors and resources that can be shared between the pagelets. When all
pagelets are rendered in to the page's view template you will have page of your
website.

New pages are created using the `.extend` method of the base `Page` class that
we provide through our module. The `.extend` method gives developers a natural
API for extending and building their own pages:

```js
var Page = require('pagelets').Page;

module.exports = Page.extend({
  ..
});
```

#### View

The page needs to have a default view where the pagelets can be added in to. The
view should be the location of the template that needs to be rendered. Because
you should be allowed to use every template language we can't really "preprocess"
these templates and add placeholders for the pagelets. This is something that
the developer should do. At Facebook they assign `id` attributes to DOM elements
and map Pagelets to that id attribute. I personally feel that we should leave
all default HTML attributes alone and use HTML `data-` attributes as indicators
for the pagelet placements. Each pagelet already has an assigned name. Which
will either be the name of the file or the name that the developer specified.

To tie the pagelets to the placeholders the developer should add a `data-pagelet`
attribute to the template where the value of the attribute is the name of the
pagelet:

```html
<div id="navigation" class="row" data-pagelet="navigation">
</div>
```

The snippet above specifies the placeholder for the pagelet. The added benefit
of using `data-pagelet` attributes is that it can be used multiple times on
a single page. Where as using an `id` attribute would result in a pagelet that
can only be rendered once.

By default we will respond with a `200` statusCode, but if your building a 404
page or maybe an error page, you want to change this. This should be controled
through:

```js
Page.extend({
  statusCode: 404
});
```

#### Routing

Pages are tied to routes on your webpage. It makes no sense to adopt the
horrible `app.get('/path', function)` pattern if we are creating different page
constructors. Instead we should be able to specify routing information directly
in to the page. The only information we would need are:

- The methods that are accepted for this route.
- The pathname we should respond to.

To be as flexible as possible we should allow regular expressions, pathnames
with placeholders as well as `xregexp` routes. These routes can be specified
using:

```js
Page.extend({
  path: '/'                     // Responds to the / route.
});

Page.extend({
  path: /^\/foo\/bar/i          // Respond to /foo/bar.
});

Page.extend({
  path: '/^\/(<first> \d+)/gi'  // Compiled to a xRegExp instance with capturing groups.
})
```

Limiting routes to specified methods is just as simple:

```js
Page.extend({
  method: 'GET, POST'         // This will only allow this route for GET/POST
});

Page.extend({
  method: ''                // Respond to all routes.
});
```

#### Resources

#### Generation

A page can be generated in different modes. Each mode has different performance
influences on your page. There are three different modes supported for page.

<dl>
  <dt>render<dt>
  <dd>
    The "render" mode will output the specified pagelets fully rendered as HTML
    and in the specified order. This will make the pages crawlable by search
    engines as well as usable by users who do not use JavaScript.
  <dd>
  <dt>async</dt>
  <dd>
    When "async" is set as mode all pagelets will be rendered in parallel. When
    a pagelet is loaded it will flush the compiled template as well as the
    template data to the client. This is <strong>not</strong> done in order.
  </dd>
  <dt>pipe</dt>
  <dd>
    The "pipe" mode is exactly the same as the "async" mode except it flushes
    the pagelets in the specified order. Allowing greater control over the
    progressive rendering proces at the potential cost of performance.
  </dd>
</dl>

The default generation mode is `async` this minimizes time the user needs to
wait before the page is loaded. Changing the mode should be as simple as
changing the `mode` property:

```js
Page.extend({
  mode: 'async'
});
```
