// The pages in the user's language. The app's own words are translated as they are drawn, from a dictionary
// per language (npm run i18n:extract lists them in strings.json; zh.json, el.json… hold the translations).
// Text nodes and a few attributes are changed in place: React keeps its nodes, and when it sets one's text
// again that is translated again. A sentence JSX builds from text and values ("Reading {0} of {1}…") is
// translated whole, since its words may go in another order. What people and agents wrote (conversations,
// code, files, terminals, anything marked translate="no") is never touched.
import { LANGS, type Lang } from '@shared/i18n';
import { translator, type Dictionary } from '@shared/translate';

type Dict = Dictionary;

let translate: (s: string, split?: boolean) => string | null = () => null;

/** Words the page says rather than shows (hands-free mode), in the user's language when the dictionary has them. */
export const tr = (s: string) => translate(s) ?? s;

/** Where nothing is translated: what people and agents wrote, and code. Text boxes keep their own text, but their hints are translated. */
const SKIP = 'pre, code, kbd, textarea, script, style, .md, .cm-editor, .xterm, [contenteditable="true"], [translate="no"]';
const NO_ATTRS = '.md, .cm-editor, .xterm, [contenteditable="true"], [translate="no"]';
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

/** What React (or the page) last put in each text node: what is translated, and what a sentence is made of. */
const source = new WeakMap<Text, string>();
/** What this wrote into a text node, to tell its own changes from React's. */
const written = new WeakMap<Text, string>();
const writtenAttr = new WeakMap<Element, Map<string, string>>();

const skipped = (el: Element | null) => !el || !!el.closest(SKIP);

function put(node: Text, value: string) {
  if (node.nodeValue === value) return;
  written.set(node, value);
  node.nodeValue = value;
}

/** The text nodes side by side around one: the pieces of a sentence React built from text and values. */
function runAround(node: Text): Text[] {
  const run: Text[] = [node];
  for (let n = node.previousSibling; n && n.nodeType === Node.TEXT_NODE; n = n.previousSibling) run.unshift(n as Text);
  for (let n = node.nextSibling; n && n.nodeType === Node.TEXT_NODE; n = n.nextSibling) run.push(n as Text);
  return run;
}

/** A text node React just set (or that was just added): its own text, or the sentence it is part of, translated. */
function onText(node: Text) {
  const v = node.nodeValue ?? '';
  if (written.get(node) === v) return;
  source.set(node, v);
  if (skipped(node.parentElement)) return;
  const run = runAround(node);
  if (run.length > 1) return onSentence(run);
  const t = translate(v);
  if (t != null) put(node, t);
}

/** A sentence in pieces (beside an icon, say): whole into its first piece when the dictionary has it, else piece by piece. */
function onSentence(run: Text[]) {
  for (const k of run) if (!source.has(k)) source.set(k, k.nodeValue ?? '');
  const t = translate(run.map((k) => source.get(k)!).join(''), false);
  if (t != null) return run.forEach((k, i) => put(k, i === 0 ? t : ''));
  for (const k of run) {
    const v = source.get(k)!;
    put(k, translate(v) ?? v);
  }
}

function onAttr(el: Element, name: string) {
  const v = el.getAttribute(name);
  if (v == null || writtenAttr.get(el)?.get(name) === v || el.closest(NO_ATTRS)) return;
  const t = translate(v);
  if (t == null) return;
  let m = writtenAttr.get(el);
  if (!m) writtenAttr.set(el, (m = new Map()));
  m.set(name, t);
  el.setAttribute(name, t);
}

const attrsOf = (el: Element) => {
  for (const a of ATTRS) if (el.hasAttribute(a)) onAttr(el, a);
};

/** Everything under a node, skipping what is never translated (a text box's hint is, though). */
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return onText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const top = root as Element;
  if (skipped(top)) {
    if (top.matches(SKIP)) attrsOf(top);
    return;
  }
  const w = document.createTreeWalker(top, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (n.nodeType !== Node.ELEMENT_NODE || !(n as Element).matches(SKIP)) return NodeFilter.FILTER_ACCEPT;
      attrsOf(n as Element);
      return NodeFilter.FILTER_REJECT;
    },
  });
  const texts: Text[] = [];
  for (let n: Node | null = top; n; n = w.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) texts.push(n as Text);
    else attrsOf(n as Element);
  }
  for (const t of texts) onText(t);
}

let observer: MutationObserver | null = null;

/** Starts translating the page into `lang` (nothing for English). */
export async function startTranslating(lang: Lang) {
  if (lang === 'en' || observer) return;
  const load = LANGS.find((l) => l.id === lang) ? DICTS[lang] : undefined;
  if (!load) return;
  translate = translator(await load());
  document.documentElement.lang = lang;
  walk(document.body);
  observer = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') onText(m.target as Text);
      else if (m.type === 'attributes') onAttr(m.target as Element, m.attributeName!);
      else for (const n of m.addedNodes) walk(n);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/** Each language's dictionary, loaded when it is the one in use. */
const DICTS: Partial<Record<Lang, () => Promise<Dict>>> = {
  zh: () => import('./zh.json').then((m) => m.default as Dict),
  el: () => import('./el.json').then((m) => m.default as Dict),
};
