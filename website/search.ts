// The docs' search on hydor.app: the app's own Help search (web/src/features/guide/search.ts) over the sections of
// every page (docs/search.json, made by website/docs.mjs), in a box that opens from any page: the Search buttons,
// Ctrl+K (⌘K on a Mac) or "/". Bundled into docs/search.js when the site is built.
import { queryWords } from '@shared/find';
import type { GuideTopic } from '@shared/guide';
import { searchGuide, type Found } from '../web/src/features/guide/search';

let topics: GuideTopic[] | null = null;
let loading: Promise<GuideTopic[]> | null = null;
const load = () => (loading ??= fetch('/docs/search.json').then((r) => r.json()).then((t: GuideTopic[]) => (topics = t)));

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The words of the query marked where they start a word in the text. */
function mark(text: string, words: string[]): string {
  const safe = esc(text);
  const ws = words.filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!ws.length) return safe;
  return safe.replace(new RegExp(`(^|[^\\p{L}\\p{N}])(${ws.join('|')})`, 'giu'), '$1<mark>$2</mark>');
}

let dlg: HTMLDialogElement | null = null;
let input: HTMLInputElement;
let list: HTMLUListElement;
let note: HTMLParagraphElement;
let found: Found[] = [];
let active = 0;

function make() {
  dlg = document.createElement('dialog');
  dlg.className = 'search';
  dlg.setAttribute('aria-label', 'Search the docs');
  dlg.innerHTML = `
    <div class="search-box">
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
      <input type="search" placeholder="Search the docs" aria-label="Search the docs" autocomplete="off" spellcheck="false" enterkeyhint="go" />
      <button type="button" class="search-close" aria-label="Close">Esc</button>
    </div>
    <ul class="search-results" role="listbox" aria-label="Pages found"></ul>
    <p class="search-note"></p>`;
  document.body.append(dlg);
  input = dlg.querySelector('input')!;
  list = dlg.querySelector('ul')!;
  note = dlg.querySelector('.search-note')!;
  dlg.querySelector('.search-close')!.addEventListener('click', () => dlg!.close());
  dlg.addEventListener('click', (e) => e.target === dlg && dlg!.close());
  let timer = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(run, 50);
  });
  input.addEventListener('keydown', (e) => {
    // One Escape closes the box (a search field would first empty itself).
    if (e.key === 'Escape') {
      e.preventDefault();
      dlg!.close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!found.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length;
      paint();
    } else if (e.key === 'Enter' && found[active]) {
      e.preventDefault();
      go(found[active]);
    }
  });
  list.addEventListener('mousemove', (e) => {
    const li = (e.target as HTMLElement).closest('li');
    const i = li ? Number(li.dataset.i) : -1;
    if (i >= 0 && i !== active) {
      active = i;
      paint();
    }
  });
}

const urlOf = (f: Found) => `/docs/${f.topic.id}#${f.id}`;

function go(f: Found) {
  const url = urlOf(f);
  dlg!.close();
  if (location.pathname === `/docs/${f.topic.id}`) location.hash = f.id;
  else location.href = url;
}

function paint() {
  list.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function run() {
  const q = input.value.trim();
  if (!q) {
    found = [];
    list.innerHTML = '';
    note.textContent = 'Type what you are looking for: “phone”, “memory”, “schedule a task”…';
    return;
  }
  if (!topics) {
    note.textContent = 'Getting the docs…';
    load().then(run);
    return;
  }
  const words = queryWords(q);
  found = searchGuide(topics, q, 12);
  active = 0;
  list.innerHTML = found
    .map(
      (f, i) =>
        `<li role="option" data-i="${i}" aria-selected="${i === 0}"><a href="${urlOf(f)}"><span class="sr-where">${esc(f.topic.title)}</span><b>${mark(f.title, words)}</b><span class="sr-text">${mark(f.snippet, words)}</span></a></li>`,
    )
    .join('');
  note.textContent = found.length ? '' : 'Nothing found. Try other words.';
}

function open() {
  if (!dlg) make();
  if (dlg!.open) return;
  dlg!.showModal();
  input.focus();
  input.select();
  load().then(() => input.value && run());
  run();
}

document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-search-open]')) {
    e.preventDefault();
    open();
  }
});
document.addEventListener('keydown', (e) => {
  const typing = (e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]');
  if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    open();
  } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    open();
  }
});
// The shortcut as this computer writes it.
for (const k of document.querySelectorAll('[data-search-open] kbd')) k.textContent = mac ? '⌘K' : 'Ctrl K';
