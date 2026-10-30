// ANSI colour codes (tracebacks, coloured logs) to HTML spans. Text is escaped; other escape
// sequences (cursor moves, titles) are dropped.
const esc = (s: string) => s.replace(/[&<>"\x1b]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : ''));

const NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

function xterm256(n: number): string {
  if (n < 16) return `var(--ansi-${n < 8 ? NAMES[n] : `bright-${NAMES[n - 8]}`})`;
  if (n < 232) {
    const i = n - 16;
    const v = (x: number) => (x ? x * 40 + 55 : 0);
    return `rgb(${v(Math.floor(i / 36))},${v(Math.floor(i / 6) % 6)},${v(i % 6)})`;
  }
  const g = 8 + (n - 232) * 10;
  return `rgb(${g},${g},${g})`;
}

export function ansiToHtml(text: string): string {
  let fg: string | null = null;
  let bg: string | null = null;
  let bold = false;
  let dim = false;
  let italic = false;
  let underline = false;
  let html = '';
  const flush = (s: string) => {
    if (!s) return;
    const style = [fg && `color:${fg}`, bg && `background:${bg}`, bold && 'font-weight:600', dim && 'opacity:.7', italic && 'font-style:italic', underline && 'text-decoration:underline'].filter(Boolean);
    html += style.length ? `<span style="${style.join(';')}">${esc(s)}</span>` : esc(s);
  };
  const re = /\x1b\[([?0-9;]*)([A-Za-z])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g;
  let last = 0;
  for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
    flush(text.slice(last, m.index));
    last = re.lastIndex;
    if (m[2] !== 'm' || m[1].startsWith('?')) continue;
    const codes = (m[1] || '0').split(';').map((c) => Number(c) || 0);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) {
        fg = bg = null;
        bold = dim = italic = underline = false;
      } else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 3) italic = true;
      else if (c === 4) underline = true;
      else if (c === 22) bold = dim = false;
      else if (c === 23) italic = false;
      else if (c === 24) underline = false;
      else if (c >= 30 && c <= 37) fg = `var(--ansi-${NAMES[c - 30]})`;
      else if (c === 39) fg = null;
      else if (c >= 40 && c <= 47) bg = `var(--ansi-${NAMES[c - 40]})`;
      else if (c === 49) bg = null;
      else if (c >= 90 && c <= 97) fg = `var(--ansi-bright-${NAMES[c - 90]})`;
      else if (c >= 100 && c <= 107) bg = `var(--ansi-bright-${NAMES[c - 100]})`;
      else if ((c === 38 || c === 48) && codes[i + 1] === 5) {
        const v = xterm256(codes[i + 2] ?? 0);
        if (c === 38) fg = v;
        else bg = v;
        i += 2;
      } else if ((c === 38 || c === 48) && codes[i + 1] === 2) {
        const v = `rgb(${codes[i + 2] ?? 0},${codes[i + 3] ?? 0},${codes[i + 4] ?? 0})`;
        if (c === 38) fg = v;
        else bg = v;
        i += 4;
      }
    }
  }
  flush(text.slice(last));
  return html;
}
