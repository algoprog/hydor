// What runs in a tab to make its reader copy: Mozilla's Readability (readability/, Apache-2.0) on a clone of the page, in the
// tab's isolated world (Tab.evaluate), so the page's own scripts see nothing of it. Lazy pictures get the address they show
// (the one the page loaded, else its data-src) before Readability reads the clone, which it makes absolute itself.
// The result is the article's parts as Readability gives them; pages/reader.ts cleans its HTML and keeps it as a page.
import { READABILITY_SRC } from './readability/source.ts';

export const readerScript = (): string => `(() => {
${READABILITY_SRC}
;
try {
  const live = Array.from(document.querySelectorAll('img'));
  const doc = document.cloneNode(true);
  const copies = Array.from(doc.querySelectorAll('img'));
  const LAZY = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-hi-res-src', 'data-full-url'];
  const LAZYSET = ['data-srcset', 'data-lazy-srcset'];
  const fake = (s) => !s || /^data:/i.test(s) || /(blank|spacer|placeholder|pixel|1x1)[.](gif|png|jpg|svg)/i.test(s);
  copies.forEach((c, i) => {
    const l = copies.length === live.length ? live[i] : null;
    const cur = l && l.complete && l.naturalWidth > 1 ? l.currentSrc : '';
    if (cur && /^https?:/i.test(cur)) c.setAttribute('src', cur);
    else if (fake(c.getAttribute('src'))) {
      for (const a of LAZY) {
        const v = c.getAttribute(a);
        if (v && !fake(v)) { c.setAttribute('src', v); break; }
      }
    }
    if (!c.getAttribute('srcset')) {
      for (const a of LAZYSET) {
        const v = c.getAttribute(a);
        if (v) { c.setAttribute('srcset', v); break; }
      }
    }
  });
  // Your highlights are the app's marks, not the article's: the copy has the words without them.
  doc.querySelectorAll('mark.hydor-hl').forEach((m) => m.replaceWith(...Array.from(m.childNodes)));
  if (doc.body) doc.body.normalize();
  const art = new Readability(doc, { keepClasses: false }).parse();
  if (!art || !art.content) return null;
  return { title: art.title || '', byline: art.byline || '', siteName: art.siteName || '', excerpt: art.excerpt || '', lang: art.lang || document.documentElement.lang || '', publishedTime: art.publishedTime || '', content: String(art.content).slice(0, 3000000), length: art.length || 0 };
} catch (e) {
  return null;
}
})()`;
