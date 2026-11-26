// A small template helper: everything put into a page is escaped unless it is itself markup.
class Markup {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Markup) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return String(v).replace(/[&<>"']/g, (c) => ENT[c]);
}

export const html = (strings, ...values) =>
  new Markup(strings.reduce((out, s, i) => out + s + (i < values.length ? render(values[i]) : ''), ''));
