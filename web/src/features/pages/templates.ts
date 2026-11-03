// Starting points for a page the user makes in Pages (New page): small, plain pages in the page kit's look
// (body.n-page follows the app's light or dark theme), the tools keeping what is entered with hydor.storage.

export interface Starter {
  id: string;
  label: string;
  hint: string;
  title: string;
  html: (title: string) => string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const head = (title: string, css = '') =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n<style>\nbody{max-width:720px;margin:0 auto}\n${css}</style>\n</head>\n`;

export const STARTERS: Starter[] = [
  {
    id: 'blank',
    label: 'Blank page',
    hint: 'A heading and some words, to build on',
    title: 'New page',
    html: (t) => `${head(t)}<body class="n-page">\n<h1>${esc(t)}</h1>\n<p class="n-muted">Start writing here. Click Edit to change any part, or ask an agent to build on it.</p>\n</body>\n</html>\n`,
  },
  {
    id: 'notes',
    label: 'Notes',
    hint: 'A page to write in, kept as you type',
    title: 'Notes',
    html: (t) =>
      `${head(t, 'textarea{width:100%;min-height:60vh;box-sizing:border-box;padding:14px;border:1px solid var(--n-line);border-radius:12px;background:var(--n-card);color:var(--n-fg);font:inherit;line-height:1.6;resize:vertical}\n')}<body class="n-page">\n<h1>${esc(t)}</h1>\n<p class="n-muted" id="state">Kept as you type.</p>\n<textarea id="text" placeholder="Write anything…"></textarea>\n<script>\nconst box = document.getElementById('text');\nnaget.storage.get('text').then((v) => { if (v) box.value = v; });\nlet t;\nbox.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => hydor.storage.set('text', box.value), 400); });\n</script>\n</body>\n</html>\n`,
  },
  {
    id: 'checklist',
    label: 'Checklist',
    hint: 'Things to do, ticked off as you go',
    title: 'Checklist',
    html: (t) =>
      `${head(t, '.item{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--n-line);border-radius:10px;margin:6px 0;background:var(--n-card)}\n.item.done span{text-decoration:line-through;color:var(--n-muted)}\n.item input{width:18px;height:18px;accent-color:var(--n-accent)}\n.item button{margin-left:auto;border:0;background:none;color:var(--n-muted);font-size:18px;cursor:pointer}\nform{display:flex;gap:8px;margin:14px 0}\nform input{flex:1;padding:9px 12px;border:1px solid var(--n-line);border-radius:10px;background:var(--n-card);color:var(--n-fg);font:inherit}\n')}<body class="n-page">\n<h1>${esc(t)}</h1>\n<form id="add"><input id="what" placeholder="Something to do" autocomplete="off"><button class="n-btn n-primary">Add</button></form>\n<div id="list"></div>\n<script>\nlet items = [];\nconst list = document.getElementById('list');\nconst save = () => hydor.storage.set('items', items);\nfunction draw() {\n  list.innerHTML = '';\n  items.forEach((it, i) => {\n    const row = document.createElement('label');\n    row.className = 'item' + (it.done ? ' done' : '');\n    const box = document.createElement('input');\n    box.type = 'checkbox';\n    box.checked = it.done;\n    box.onchange = () => { it.done = box.checked; save(); draw(); };\n    const text = document.createElement('span');\n    text.textContent = it.text;\n    const del = document.createElement('button');\n    del.type = 'button';\n    del.textContent = '×';\n    del.title = 'Remove';\n    del.onclick = (e) => { e.preventDefault(); items.splice(i, 1); save(); draw(); };\n    row.append(box, text, del);\n    list.append(row);\n  });\n}\ndocument.getElementById('add').onsubmit = (e) => {\n  e.preventDefault();\n  const f = document.getElementById('what');\n  if (!f.value.trim()) return;\n  items.push({ text: f.value.trim(), done: false });\n  f.value = '';\n  save();\n  draw();\n};\nnaget.storage.get('items').then((v) => { items = v || []; draw(); });\n</script>\n</body>\n</html>\n`,
  },
  {
    id: 'tracker',
    label: 'Tracker',
    hint: 'A number a day: steps, hours, pages read',
    title: 'Tracker',
    html: (t) =>
      `${head(t, '.big{font-size:40px;font-weight:700;letter-spacing:-.02em}\nform{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin:16px 0}\n.bars{display:flex;align-items:end;gap:4px;height:120px;margin:18px 0;padding:8px;border:1px solid var(--n-line);border-radius:12px;background:var(--n-card)}\n.bars div{flex:1;min-width:6px;border-radius:4px 4px 0 0;background:var(--n-accent);opacity:.85}\n')}<body class="n-page">\n<h1>${esc(t)}</h1>\n<p class="n-muted">The last 30 days</p>\n<div class="n-row"><div><div class="big" id="total">0</div><div class="n-muted">in all</div></div><div style="margin-left:24px"><div class="big" id="avg">0</div><div class="n-muted">a day on average</div></div></div>\n<div class="bars" id="bars"></div>\n<form id="log"><label class="n-field">Day<input type="date" id="day"></label><label class="n-field">How many<input type="number" id="n" min="0" step="any"></label><button class="n-btn n-primary">Log it</button></form>\n<script>\nlet log = {};\nconst day = document.getElementById('day');\nday.value = new Date().toISOString().slice(0, 10);\nfunction draw() {\n  const days = [...Array(30)].map((_, i) => new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10));\n  const vals = days.map((d) => Number(log[d] || 0));\n  const max = Math.max(1, ...vals);\n  const total = vals.reduce((a, b) => a + b, 0);\n  document.getElementById('total').textContent = Math.round(total * 10) / 10;\n  document.getElementById('avg').textContent = Math.round((total / 30) * 10) / 10;\n  const bars = document.getElementById('bars');\n  bars.innerHTML = '';\n  vals.forEach((v, i) => { const b = document.createElement('div'); b.style.height = Math.max(2, (v / max) * 100) + '%'; b.title = days[i] + ': ' + v; bars.append(b); });\n}\ndocument.getElementById('log').onsubmit = (e) => {\n  e.preventDefault();\n  const n = document.getElementById('n');\n  if (n.value === '') return;\n  log[day.value] = Number(n.value);\n  n.value = '';\n  hydor.storage.set('log', log);\n  draw();\n};\nnaget.storage.get('log').then((v) => { log = v || {}; draw(); });\n</script>\n</body>\n</html>\n`,
  },
];
