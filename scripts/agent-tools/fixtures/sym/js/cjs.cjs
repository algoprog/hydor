function viaCjs() {
  return 1;
}
module.exports = { viaCjs };

function Legacy() {}
Legacy.prototype.speak = function speak() {
  return '}';
};
exports.helper = (a) => a;
module.exports.value = 3;
