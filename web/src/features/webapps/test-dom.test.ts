// Just enough of a browser for a script to draw the pages of web apps as text (react-dom/server), and to read back the
// words a person would see and hear. Imported first, before any module of the app. Not a test of its own.
import { parseFragment } from 'parse5';

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k) };
};
const quiet = { addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true };
const media = () => ({ matches: false, ...quiet });
const element = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, getAttribute: () => null, appendChild() {}, ...quiet });
const location = { pathname: '/', search: '', hash: '', href: 'http://hydor.test/', origin: 'http://hydor.test', host: 'hydor.test', hostname: 'hydor.test', protocol: 'http:', port: '', reload() {}, assign() {}, replace() {} };
const give = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
give('localStorage', store());
give('sessionStorage', store());
give('location', location);
give('matchMedia', media);
give('history', { pushState() {}, replaceState() {}, state: null });
const doc = { ...element(), documentElement: element(), head: element(), body: element(), createElement: element, createElementNS: element, createTextNode: element, getElementById: () => null, getElementsByTagName: () => [], querySelector: () => null, querySelectorAll: () => [], visibilityState: 'visible', cookie: '', fonts: { add() {}, load: async () => [] } };
give('document', doc);
for (const name of ['HTMLElement', 'Element', 'Node', 'SVGElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'DocumentFragment', 'Range', 'ShadowRoot']) if (!(name in globalThis)) give(name, class {});
for (const name of ['ResizeObserver', 'MutationObserver', 'IntersectionObserver']) give(name, class { observe() {} disconnect() {} unobserve() {} });
give('requestAnimationFrame', () => 0);
give('getComputedStyle', () => ({ getPropertyValue: () => '' }));
give('CSS', { escape: (s: string) => s, supports: () => false });
give('navigator', { userAgent: 'a test', language: 'en', languages: ['en'], maxTouchPoints: 0, platform: 'test' });
give('window', globalThis);
for (const [k, v] of Object.entries(quiet)) give(k, v);

type Node = { nodeName: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: Node[] };
/** The attributes a person reads or has read to them. */
const SPOKEN = ['aria-label', 'placeholder', 'title', 'alt'];

/**
 * The words of drawn markup: its text and what it says to a screen reader, a line each. What is shown to be copied or
 * compared as it is (data-verbatim: a line to paste, a code, an address) is left out.
 */
export function wordsOf(html: string): string {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.attrs?.some((a) => a.name === 'data-verbatim') || n.nodeName === 'svg' || n.nodeName === 'style') return;
    if (n.nodeName === '#text') {
      if (n.value?.trim()) out.push(n.value.trim());
      return;
    }
    for (const a of n.attrs ?? []) if (SPOKEN.includes(a.name) && a.value.trim()) out.push(a.value.trim());
    for (const c of n.childNodes ?? []) walk(c);
  };
  walk(parseFragment(html) as unknown as Node);
  return out.join('\n');
}
