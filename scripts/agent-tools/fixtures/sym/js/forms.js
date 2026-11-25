'use strict';

/**
 * Plain function.
 */
function plain(a, b) {
  return a + b; // }
}

const arrow = (x) => ({ x, y: '}' });

class Counter {
  static #count = 0;
  value = 0;
  inc() { this.value++; }
  get double() { return this.value * 2; }
  static make() { return new Counter(); }
}

module.exports = { plain, arrow, Counter };

const handlers = {
  onOpen() { return 1; },
  onClose: () => 2,
};

export { plain as plainAlias };
