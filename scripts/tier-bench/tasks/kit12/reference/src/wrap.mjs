function wrapWords(words, width) {
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (w.length > width) {
      if (cur) lines.push(cur);
      let i = 0;
      for (; i + width < w.length; i += width) lines.push(w.slice(i, i + width));
      cur = w.slice(i);
    } else if (!cur) {
      cur = w;
    } else if (cur.length + 1 + w.length <= width) {
      cur += ' ' + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function wordWrap(text, width) {
  if (!Number.isInteger(width) || width < 1) throw new RangeError('width must be a positive integer');
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const out = [];
  let words = [];
  const flush = () => {
    out.push(...wrapWords(words, width));
    words = [];
  };
  for (const line of text.split('\n')) {
    if (/^ *$/.test(line)) {
      flush();
      out.push('');
    } else {
      words.push(...line.split(' ').filter(Boolean));
    }
  }
  flush();
  return out.join('\n');
}
