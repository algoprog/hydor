// A small template helper: everything put into a page is escaped unless it is itself a template.
class Safe {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const escape = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function render(value) {
  if (value instanceof Safe) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === undefined || value === null || value === false) return '';
  return escape(value);
}

export const html = (strings, ...values) =>
  new Safe(strings.reduce((out, part, i) => out + render(values[i - 1]) + part));
