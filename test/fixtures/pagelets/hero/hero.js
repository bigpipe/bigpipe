/*globals pipe */
'use strict';

function Hero(name) {
  this.name = name;
}

Hero.prototype.speak = function speak() {
  console.log('I\'m ', this.name);
};

pipe.on('hero', function () {
  var hero = new Hero();
});
