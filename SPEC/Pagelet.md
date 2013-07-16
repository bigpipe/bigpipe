# Pagelet

A pagelet is a widget/component/section on your page. It can be a sidebar, main
content, an individual row anything you want. A pagelet is composed out of
3 components:

- [view](#view)
- [CSS](#css)
- [js](#js)

While the pagelets have a view, there isn't any rendering taking place. A
Pagelet is basically a definition of resources and a resource
allocator/transformer. The page has 2 important functions:

- initialize, called when the pagelet is going to be used.
- render, called when we need to render the pagelet.

#### view

Pagelets are rendered in a view. But this rendering is decided by the wrapping
Page. It could be that your page is rendered on the server side but also on the
client side. So you need to use a template language that is compatible with both
the server side as well as the client side. This allows greater control over the
pagelets. The view should be a reference to a file location instead of the
actual template.

While the template engine should be automatically detected based on the file
name, it should also be possible to force a template engine:

```js
Pagelet.extend({
  view: '../views/whatever/template.mustache'
  engine: 'hogan.js'
});
```

#### CSS

The pagelet can be styled through CSS, the CSS that's defined for the pagelet
should only contain the bare minimal that is needed to only render this pagelet.
In the early stage of this project we should only narrow our focus to plain ol
CSS. Once we've reached a 1.0 release we should also be able to process less,
sass and stylus. This should be a reference to a file so we can potentially
bundle it in to a core file.

#### js

When you are building a interactive pagelet, you probably want to add some
dedicated JavaScript for it as well. Again, this should be a reference so it can
be bundled in a core file if needed.

We might need to provide a simple custom framework for interacting with the
pagelets on the front-end. Either a event listener approach:

```js
pipe.on('pageletname', function loaded(elements) {

});
```

Or maybe a backbone inspired pagelet 'view' could be advised:

```js
var Pagelet = Pipe.Pagelet.extend({
  'events': {
    'click .selector': 'method'
  },

  // new data received through websockets, update something.
  data: function ondata(data) {
    //
    // Should automatically update the pagelet with new information. The render
    // method automatically uses client-side template for updating the attached
    // views.
    //
    this.render(data);
  }
});
```

### Dependencies

As a pagelet is a modular piece of layout it can depended on external resources.
For example CSS or JavaScript frameworks. These dependencies should be an array
with strings that point to file locations that are relative to the module.

```js
Pagelet.exend({
  dependencies: [
    '../js/jquery.min.js',
    '../css/reset.css'
  ]
});
```

#### Authorization

Pagelets can have custom authorization methods so you can create conditional
layouts. This is great for adding an administrator view for example.
Authorization should be as simple as possible and not care about any issues.
A single callback with a true/false should be sufficient.

```js
Pagelet.extend({
  authorize: function (req, done) {
    done(true); // allowed;
  }
});
```
