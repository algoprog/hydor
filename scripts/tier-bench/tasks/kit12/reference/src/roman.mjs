const TABLE = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];
const CANONICAL = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

export function toRoman(n) {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 3999) throw new RangeError('n must be an integer from 1 to 3999');
  let out = '';
  for (const [value, letters] of TABLE) {
    while (n >= value) {
      out += letters;
      n -= value;
    }
  }
  return out;
}

export function fromRoman(text) {
  if (typeof text !== 'string' || text === '') throw new RangeError('not a Roman numeral');
  const upper = text.toUpperCase();
  if (!CANONICAL.test(upper)) throw new RangeError(`not a canonical Roman numeral: ${JSON.stringify(text)}`);
  let total = 0;
  for (let i = 0; i < upper.length; ) {
    const two = TABLE.find(([, l]) => l.length === 2 && upper.startsWith(l, i));
    if (two) {
      total += two[0];
      i += 2;
    } else {
      total += TABLE.find(([, l]) => l === upper[i])[0];
      i += 1;
    }
  }
  return total;
}
