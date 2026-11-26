/**
 * Pictures in an agent's reply (components/Markdown.tsx, `rich`): pictures one after another become one grid
 * (`groupPictures`, a rehype plugin), the viewer goes through all of the reply's pictures (`replyPictureRefs` reads them
 * from its text), and a picture-only paragraph is told from other text (`picturesOnly`, for streamBlocks: a run of them
 * stays one block).
 */

/** A picture as Markdown writes it, `![alt](address "title")` (the address may be <in angle brackets>). */
const PIC = String.raw`!\[(?:[^\[\]\\]|\\.|\[[^\]]*\])*\]\(\s*(?:<[^<>\n]*>|(?:[^\s()\\]|\\.|\([^\s()]*\))*)(?:\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))?\s*\)`;
/** A picture that is a link, `[![alt](address)](link)`. */
const LINKED = String.raw`\[\s*${PIC}\s*\]\((?:[^\s()\\]|\\.|\([^\s()]*\))*(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)`;
const PIC_RE = new RegExp(PIC, 'g');
const LINKED_RE = new RegExp(LINKED, 'g');

/** Whether a text holds pictures and nothing else (whitespace aside): such a paragraph joins the pictures around it. */
export function picturesOnly(text: string): boolean {
  let n = 0;
  const rest = text.replace(LINKED_RE, () => (n++, '')).replace(PIC_RE, () => (n++, ''));
  return n > 0 && !rest.trim();
}

type Node = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: Node[] };

const blank = (n: Node) => (n.type === 'text' && !String(n.value ?? '').trim()) || (n.type === 'element' && n.tagName === 'br');
const isImg = (n: Node) => n.type === 'element' && n.tagName === 'img';

/** The picture a paragraph's child is: an image, or a link holding only an image. */
function picture(n: Node): Node | null {
  if (isImg(n)) return n;
  if (n.type === 'element' && n.tagName === 'a') {
    const inner = (n.children ?? []).filter((c) => !blank(c));
    if (inner.length === 1 && isImg(inner[0])) return inner[0];
  }
  return null;
}

/** The pictures (as the nodes that show them) of a paragraph that holds only pictures, else null. */
function paragraphPictures(p: Node): { items: Node[]; imgs: Node[] } | null {
  if (p.type !== 'element' || p.tagName !== 'p') return null;
  const items: Node[] = [];
  const imgs: Node[] = [];
  for (const c of p.children ?? []) {
    if (blank(c)) continue;
    const img = picture(c);
    if (!img) return null;
    items.push(c);
    imgs.push(img);
  }
  return items.length ? { items, imgs } : null;
}

/**
 * Two or more pictures one after another (paragraphs of only pictures, or one paragraph of them) become one
 * `<div class="md-pics" data-n="…">` that holds them, each marked `data-grid` (Markdown's picture then shows its caption
 * and fits a box). A single picture, and a paragraph with words, stay as they are.
 */
export function groupPictures() {
  const visit = (node: Node) => {
    const kids = node.children;
    if (!kids) return;
    for (const k of kids) if (k.type === 'element' && k.tagName !== 'pre' && k.tagName !== 'code') visit(k);
    const out: Node[] = [];
    for (let i = 0; i < kids.length; ) {
      const first = paragraphPictures(kids[i]);
      if (!first) {
        out.push(kids[i++]);
        continue;
      }
      // The run: paragraphs of pictures with only whitespace between them.
      const items = [...first.items];
      const imgs = [...first.imgs];
      let end = i + 1;
      for (let j = i + 1; j < kids.length; j++) {
        if (kids[j].type === 'text' && !String(kids[j].value ?? '').trim()) continue;
        const next = paragraphPictures(kids[j]);
        if (!next) break;
        items.push(...next.items);
        imgs.push(...next.imgs);
        end = j + 1;
      }
      if (items.length < 2) {
        out.push(kids[i]);
        i++;
        continue;
      }
      for (const img of imgs) img.properties = { ...img.properties, dataGrid: 'true' };
      out.push({ type: 'element', tagName: 'div', properties: { className: ['md-pics'], dataN: items.length }, children: items });
      i = end;
    }
    node.children = out;
  };
  return (tree: Node) => visit(tree);
}

export interface PictureRef {
  /** The address as the reply's text gives it, as the Markdown parser hands it on (percent-encoded). */
  src: string;
  alt: string;
  title: string;
}

/** An address as the Markdown parser hands it on: escapes undone, and what an address may not hold percent-encoded. */
function address(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('<') && s.endsWith('>')) s = s.slice(1, -1);
  s = s.replace(/\\([!-/:-@[-`{-~])/g, '$1').replace(/%(?![0-9a-f]{2})/gi, '%25');
  return Array.from(s)
    .map((c) => (/[A-Za-z0-9\-._~:/?#@!$&'()*+,;=%[\]]/.test(c) ? c : encodeURIComponent(c)))
    .join('');
}

/** The text without code (fenced blocks, and spans of code in a line), its other characters in place. */
function withoutCode(text: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of text.split('\n')) {
    const t = line.replace(/^(?:[ \t]*>)*[ \t]*/, '');
    if (fence) {
      const close = /^(`{3,}|~{3,})\s*$/.exec(t)?.[1];
      if (close && close[0] === fence[0] && close.length >= fence.length) fence = null;
      out.push('');
      continue;
    }
    const open = /^(`{3,}|~{3,})/.exec(t)?.[1];
    if (open) {
      fence = open;
      out.push('');
      continue;
    }
    out.push(line.replace(/(`+)(?:(?!\1)[\s\S])*?\1(?!`)/g, (m) => ' '.repeat(m.length)));
  }
  return out.join('\n');
}

/** Every picture a reply's text shows, in order (code left out): the list the viewer steps through. */
export function replyPictureRefs(text: string): PictureRef[] {
  const out: PictureRef[] = [];
  const re = new RegExp(String.raw`!\[((?:[^\[\]\\]|\\.|\[[^\]]*\])*)\]\(\s*(<[^<>\n]*>|(?:[^\s()\\]|\\.|\([^\s()]*\))*)(?:\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))?\s*\)`, 'g');
  const unescape = (s: string) => s.replace(/\\([!-/:-@[-`{-~])/g, '$1');
  for (const m of withoutCode(text).matchAll(re)) {
    const src = address(m[2]);
    if (!src) continue;
    out.push({ src, alt: unescape(m[1]).trim(), title: m[3] ? unescape(m[3].slice(1, -1)).trim() : '' });
  }
  return out;
}
