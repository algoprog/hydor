const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function lookup(path, data) {
  const keys = path.trim().split('.');
  if (!keys.every((k) => /^[^\s.{}]+$/.test(k))) throw new SyntaxError(`bad path: ${JSON.stringify(path)}`);
  let cur = data;
  for (const key of keys) {
    if (cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, key)) return '';
    cur = cur[key];
  }
  return cur === null || cur === undefined ? '' : String(cur);
}

export function render(template, data) {
  if (typeof template !== 'string') throw new TypeError('template must be a string');
  let out = '';
  let i = 0;
  while (i < template.length) {
    if (template.startsWith('\\{{', i)) {
      out += '{{';
      i += 3;
    } else if (template.startsWith('{{{', i)) {
      const end = template.indexOf('}}}', i + 3);
      if (end < 0) throw new SyntaxError('unclosed {{{');
      out += lookup(template.slice(i + 3, end), data);
      i = end + 3;
    } else if (template.startsWith('{{', i)) {
      const end = template.indexOf('}}', i + 2);
      if (end < 0) throw new SyntaxError('unclosed {{');
      out += lookup(template.slice(i + 2, end), data).replace(/[&<>"']/g, (c) => ESCAPES[c]);
      i = end + 2;
    } else {
      out += template[i++];
    }
  }
  return out;
}
