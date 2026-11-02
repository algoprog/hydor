// A page as an agent reads it: a numbered outline of what it can click or type into, between the
// page's own text, built from Chrome's DOM snapshot (layout, styles, values) and its accessibility
// tree (roles, names, states). Any model can use it, a small text-only one included.

/** What the accessibility tree says about an element. */
export interface AxInfo {
  role: string;
  name: string;
  props: Record<string, unknown>;
}

/** One frame's snapshot: the tab's own (with its same-process frames) or a frame in another process. */
export interface FrameSnap {
  /** The CDP session its nodes belong to ('' for the tab's own target). */
  session: string;
  snap: { documents: any[]; strings: string[] };
  ax: Map<number, AxInfo>;
  /** For a frame in another process: its <iframe> element in the parent (by backend node id), and that parent's session. */
  owner?: { session: string; backendNodeId: number };
}

/** An element the outline numbered. */
export interface El {
  id: number;
  session: string;
  backendNodeId: number;
  role: string;
  name: string;
  /** Where it was, in the viewport's CSS pixels. */
  box: { x: number; y: number; w: number; h: number };
  inView: boolean;
  tag: string;
  type?: string;
  /** A password, card number, security code or one-time code: its value is never shown. */
  sensitive?: boolean;
  fileInput?: boolean;
  /** Pressing it would likely pay or place an order. */
  payment?: boolean;
  /** A <select>, with its options' labels. */
  options?: string[];
}

export interface OutlineIn {
  frames: FrameSnap[];
  /** The viewport in CSS pixels, and the page's full size. */
  vw: number;
  vh: number;
  pageW: number;
  pageH: number;
  scrollX: number;
  scrollY: number;
  /** The number for an element: stable while it exists, never reused within the session. */
  idFor: (session: string, backendNodeId: number) => number;
  /** Ids in the last outline of this same page, to mark what is new; null for a page seen the first time. */
  prev: Set<number> | null;
  /** Elements the user typed into while driving: their values stay with the user. */
  userTyped: Set<string>;
  /** Fields filled with a key from the vault: the key's name, never the value. */
  vaultTyped?: Map<string, string>;
  /** Most characters for the outline's body. */
  budget: number;
  /** The page's address, to show links on it briefly. */
  url: string;
}

export interface Outline {
  /** The numbered lines and text, as the agent reads them. */
  body: string;
  /** Every numbered element on the page, shown or not (each can be acted on). */
  els: El[];
  /** The whole page's lines, for find. */
  lines: Line[];
  /** Interactive elements past the part shown, above and below. */
  above: number;
  below: number;
  cut: number;
}

const STYLES = ['display', 'visibility', 'opacity', 'cursor'] as const;
export const SNAPSHOT_STYLES = [...STYLES];

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'head', 'meta', 'link', 'title', 'base', 'param', 'source', 'track']);
const ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'combobox',
  'textbox',
  'searchbox',
  'slider',
  'spinbutton',
  'treeitem',
  'listbox',
  'gridcell',
]);
const BLOCK = /^(block|flex|grid|list-item|table|table-row|table-caption|flow-root|-webkit-box)$/;
const SENSITIVE_AC = /\b(cc-(number|csc|exp|exp-month|exp-year)|one-time-code|current-password|new-password)\b/i;
const SENSITIVE_NAME = /passw|card.?num|cc.?num|cvv|cvc|\bcsc\b|security.?code|otp|one.?time|passcode|\b2fa\b|totp|verification.?code|\bpin\b|\bssn\b/i;
const CARD = /\bcc-(number|csc|exp)|card.?num|cc.?num|cvv|cvc|\bcsc\b/i;
const PAY = /\b(pay( now)?|place (my |your |the )?order|buy( it)? now|buy|purchase|complete (my |your |the )?(purchase|order|payment|checkout)|confirm (and pay|payment|purchase|order)|submit (order|payment)|subscribe now|start (my |your )?(subscription|trial)|donate( now)?|book now|rent now|order now)\b/i;
const PAY_FRAME = /stripe|braintree|adyen|checkout\.com|paypal|squareup|klarna|affirm|afterpay|authorize\.net|worldpay|cybersource/i;

const SECRET_PARAM = /^(pw|pwd|pass|passwd|password|passcode|pin|cvc|cvv|csc|card|cardnumber|card_number|ccnum|cc_number|otp|totp|secret)$/i;

/** An address as the agent sees it: password-like values in its query are hidden. */
export function shownUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const keys = [...u.searchParams.keys()].filter((k) => SECRET_PARAM.test(k));
    if (!keys.length) return raw;
    for (const k of keys) u.searchParams.set(k, 'hidden');
    return u.toString();
  } catch {
    return raw;
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const quote = (s: string) => `"${s.replace(/"/g, '”')}"`;

type Zone = 'above' | 'view' | 'below' | 'far';

/** A line of the page: an element or a run of its text, with where it is. */
export interface Line {
  text: string;
  zone: Zone;
  /** Text of the page is dropped before elements when the budget is short. */
  kind: 'el' | 'text' | 'head';
  /** Its top, in viewport pixels. */
  y: number;
  /** The element's number, for an element line. */
  id?: number;
}

/** A link's address as briefly as is clear: the path on the same site, else the host and path. */
function shortHref(href: string, base: string): string | null {
  if (!href || /^(javascript:|#$)/i.test(href)) return null;
  try {
    const u = new URL(href, base);
    const b = new URL(base);
    if (u.protocol === 'mailto:' || u.protocol === 'tel:') return clip(u.href, 60);
    if (u.host === b.host) return u.pathname === b.pathname && u.search === b.search ? (u.hash ? clip(u.hash, 40) : null) : clip(u.pathname + u.search, 60);
    return clip(u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname), 60);
  } catch {
    return null;
  }
}

export function buildOutline(o: OutlineIn): Outline {
  const lines: Line[] = [];
  const els: El[] = [];
  // Forms with card fields, and whether the page embeds a payment provider's frame.
  const cardForms = new Set<string>();
  let payFrame = false;
  const pending: { el: El; form: string | null; submitLike: boolean }[] = [];

  // Text gathered for the line being built (inline content between blocks).
  let cur: { parts: string[]; zone: Zone | null; y: number; prefix: string } = { parts: [], zone: null, y: 0, prefix: '' };
  const flush = () => {
    const t = squash(cur.parts.join(''));
    if (t && cur.zone) lines.push({ text: clip(cur.prefix + t, 300), zone: cur.zone, kind: cur.prefix.startsWith('#') ? 'head' : 'text', y: cur.y });
    cur = { parts: [], zone: null, y: 0, prefix: '' };
  };

  const zoneOf = (y: number, h: number): Zone => (y + h <= 0 ? 'above' : y < o.vh ? 'view' : y < o.vh * 2 ? 'below' : 'far');

  const walkFrame = (f: FrameSnap, docIndex: number, ox: number, oy: number, depth: number) => {
    const S = f.snap.strings;
    const d = f.snap.documents[docIndex];
    if (!d || depth > 6) return;
    const N = d.nodes;
    const L = d.layout;
    const n = N.parentIndex.length as number;
    const layoutOf = new Int32Array(n).fill(-1);
    for (let li = 0; li < L.nodeIndex.length; li++) if (layoutOf[L.nodeIndex[li]] === -1) layoutOf[L.nodeIndex[li]] = li;
    const kids: number[][] = Array.from({ length: n }, () => []);
    for (let i = 1; i < n; i++) if (N.parentIndex[i] >= 0) kids[N.parentIndex[i]].push(i);
    const rare = (r?: { index: number[] }) => new Set<number>(r?.index ?? []);
    const rareStr = (r?: { index: number[]; value: number[] }) => {
      const m = new Map<number, string>();
      r?.index.forEach((ni, k) => m.set(ni, S[r.value[k]] ?? ''));
      return m;
    };
    const checked = rare(N.inputChecked);
    const selected = rare(N.optionSelected);
    const clickable = rare(N.isClickable);
    const values = rareStr(N.inputValue);
    const textValues = rareStr(N.textValue);
    const docIdx = new Map<number, number>();
    N.contentDocumentIndex?.index.forEach((ni: number, k: number) => docIdx.set(ni, N.contentDocumentIndex.value[k]));
    const sx = d.scrollOffsetX ?? 0;
    const sy = d.scrollOffsetY ?? 0;
    // Where this document's own (0,0) is in the viewport.
    const bx = ox - sx;
    const by = oy - sy;

    const attrsOf = (i: number): Record<string, string> => {
      const a: Record<string, string> = {};
      const list: number[] = N.attributes[i] ?? [];
      for (let k = 0; k + 1 < list.length; k += 2) a[(S[list[k]] ?? '').toLowerCase()] = S[list[k + 1]] ?? '';
      return a;
    };
    const style = (li: number, k: number) => (li >= 0 ? (S[L.styles[li]?.[k]] ?? '') : '');
    const boxOf = (li: number) => {
      const b = L.bounds[li] as number[];
      return { x: bx + b[0], y: by + b[1], w: b[2], h: b[3] };
    };
    /** The text inside a node (layout text where it is laid out, else the DOM's). */
    const textIn = (i: number, max = 200): string => {
      let out = '';
      const go = (k: number) => {
        if (out.length > max) return;
        if (N.nodeType[k] === 3) {
          const li = layoutOf[k];
          out += li >= 0 && L.text[li] >= 0 ? S[L.text[li]] : (S[N.nodeValue[k]] ?? '');
          return;
        }
        const tag = (S[N.nodeName[k]] ?? '').toLowerCase();
        if (SKIP.has(tag)) return;
        if (tag === 'img') {
          const alt = attrsOf(k).alt;
          if (alt) out += ` ${alt} `;
        }
        for (const c of kids[k]) go(c);
        out += ' ';
      };
      go(i);
      return squash(out).slice(0, max);
    };

    /** Whether a node holds a real control (a heuristic wrapper around one is not itself the element). */
    const hasControl = (i: number): boolean => {
      let left = 400;
      const go = (k: number): boolean => {
        for (const c of kids[k]) {
          if (--left < 0) return false;
          if (N.nodeType[c] !== 1) continue;
          const t = (S[N.nodeName[c]] ?? '').toLowerCase();
          const ca = attrsOf(c);
          if ((t === 'input' && (ca.type ?? '').toLowerCase() !== 'hidden') || t === 'select' || t === 'textarea' || t === 'button' || (t === 'a' && ca.href !== undefined)) return true;
          if (ROLES.has((ca.role ?? '').toLowerCase()) || (ca.contenteditable !== undefined && ca.contenteditable !== 'false')) return true;
          if (go(c)) return true;
        }
        return false;
      };
      return go(i);
    };

    const visit = (i: number, opacity: number, inEl: El | null, form: string | null, editable: boolean, pointer: boolean, quiet = false) => {
      const type = N.nodeType[i];
      if (type === 3) {
        if (inEl || quiet) return;
        const li = layoutOf[i];
        if (li < 0 || L.text[li] < 0 || opacity < 0.05) return;
        const t = S[L.text[li]];
        if (!t || !t.trim()) {
          if (t) cur.parts.push(' ');
          return;
        }
        const b = boxOf(li);
        if (b.x + b.w <= 0 || b.x >= o.vw) return;
        if (!cur.zone) {
          cur.zone = zoneOf(b.y, b.h);
          cur.y = b.y;
        }
        cur.parts.push(t);
        return;
      }
      if (type !== 1 && type !== 9 && type !== 11) {
        for (const c of kids[i]) visit(c, opacity, inEl, form, editable, pointer, quiet);
        return;
      }
      const tag = (S[N.nodeName[i]] ?? '').toLowerCase();
      if (SKIP.has(tag)) return;
      if (type !== 1) {
        for (const c of kids[i]) visit(c, opacity, inEl, form, editable, pointer, quiet);
        return;
      }
      const a = attrsOf(i);
      if (tag === 'input' && (a.type ?? '').toLowerCase() === 'hidden') return;
      const li = layoutOf[i];
      const display = style(li, 0);
      const visibility = style(li, 1);
      const op = opacity * (li >= 0 ? Number(style(li, 2) || 1) : 1);
      const cursor = style(li, 3);
      const box = li >= 0 ? boxOf(li) : null;
      const shown = !!box && box.w > 0 && box.h > 0 && visibility !== 'hidden' && visibility !== 'collapse' && op >= 0.05;
      const zone = box ? zoneOf(box.y, box.h) : 'far';
      const onScreen = !!box && box.x + box.w > 0 && box.x < o.vw;
      const myForm = tag === 'form' ? `${f.session}:${docIndex}:${i}` : form;
      const itype = (a.type ?? (tag === 'input' ? 'text' : '')).toLowerCase();
      const ax = f.ax.get(N.backendNodeId[i]);
      const role = (a.role ?? '').toLowerCase().split(/\s+/)[0];

      // Card fields mark their form (and payment providers' frames the page) for the payment check.
      if ((tag === 'input' || tag === 'textarea') && myForm && CARD.test(`${a.autocomplete ?? ''} ${a.name ?? ''} ${a.id ?? ''}`)) cardForms.add(myForm);
      if (tag === 'iframe' && PAY_FRAME.test(`${a.src ?? ''} ${a.name ?? ''} ${a.title ?? ''}`)) payFrame = true;

      const isEditable = a.contenteditable !== undefined && a.contenteditable !== 'false';
      const big = !!box && box.w * box.h > o.vw * o.vh * 0.5;
      const fileInput = tag === 'input' && itype === 'file';
      const semantic = (tag === 'a' && a.href !== undefined) || tag === 'button' || tag === 'select' || tag === 'textarea' || tag === 'summary' || tag === 'input' || ROLES.has(role) || (isEditable && !editable);
      // Something with a click handler or a hand cursor counts too, unless it only wraps real controls.
      const heuristic =
        !semantic &&
        tag !== 'label' &&
        !big &&
        tag !== 'html' &&
        tag !== 'body' &&
        (clickable.has(i) || (cursor === 'pointer' && !pointer) || (a.tabindex !== undefined && Number(a.tabindex) >= 0 && !!(a.role || a['aria-label']))) &&
        !hasControl(i);
      let interactive = !inEl && (semantic || heuristic);
      // A label that wraps a checkbox or radio stands for it (the box itself is often hidden for styling);
      // one that wraps another control only names it, so its own text is not repeated as a line.
      let labelFor: number | null = null;
      let naming = false;
      if (!inEl && tag === 'label') {
        const find = (k: number): number | null => {
          for (const c of kids[k]) {
            const t = (S[N.nodeName[c]] ?? '').toLowerCase();
            if (t === 'input' && /^(checkbox|radio)$/.test((attrsOf(c).type ?? '').toLowerCase())) return c;
            const r = find(c);
            if (r !== null) return r;
          }
          return null;
        };
        labelFor = find(i);
        if (labelFor !== null) interactive = true;
        else naming = hasControl(i);
      }
      // A file input is listed even when hidden behind a styled button: browser_upload needs it.
      const listHidden = fileInput && !inEl;

      const isBlock = BLOCK.test(display) || /^h[1-6]$/.test(tag) || tag === 'li' || tag === 'br' || tag === 'p' || tag === 'tr';
      if (isBlock || (interactive && (shown || listHidden))) flush();
      if (/^h[1-6]$/.test(tag)) cur.prefix = `${'#'.repeat(Number(tag[1]))} `;
      else if (tag === 'li') cur.prefix = '- ';

      let el: El | null = null;
      if (interactive && ((shown && onScreen) || listHidden)) {
        const src = labelFor ?? i;
        const sa = labelFor !== null ? attrsOf(labelFor) : a;
        const stype = labelFor !== null ? (sa.type ?? '').toLowerCase() : itype;
        const tagName = labelFor !== null ? 'input' : tag;
        const sax = labelFor !== null ? f.ax.get(N.backendNodeId[labelFor]) : ax;
        const r = (sax?.role && !/^(generic|none|presentation|StaticText|LabelText)$/i.test(sax.role) ? sax.role : '') || role || implicitRole(tagName, stype, sa);
        let name = squash(sax?.name || ax?.name || a['aria-label'] || a.title || a.placeholder || a.alt || '');
        if (!name) name = textIn(i, 120);
        if (!name && (tagName === 'input' || tagName === 'button') && sa.value && !/password/.test(stype) && !o.vaultTyped?.has(`${f.session}:${N.backendNodeId[labelFor ?? i]}`)) name = sa.value;
        if (!name && a.name) name = a.name;
        const sensitive = stype === 'password' || SENSITIVE_AC.test(sa.autocomplete ?? '') || (tagName === 'input' && SENSITIVE_NAME.test(`${sa.name ?? ''} ${sa.id ?? ''} ${sa['aria-label'] ?? ''} ${sa.placeholder ?? ''}`));
        const id = o.idFor(f.session, N.backendNodeId[labelFor ?? i]);
        const vbox = box ?? { x: 0, y: 0, w: 0, h: 0 };
        el = { id, session: f.session, backendNodeId: N.backendNodeId[labelFor ?? i], role: r, name: clip(name, 80), box: vbox, inView: zone === 'view', tag: tagName, type: stype || undefined };
        if (sensitive) el.sensitive = true;
        if (fileInput) el.fileInput = true;
        const parts: string[] = [`${o.prev && !o.prev.has(id) ? '*' : ''}[${id}] ${fileInput ? 'file input' : r}`];
        if (el.name) parts.push(quote(el.name));
        // Values: what a field holds, never a password, card, code, or what the user typed themselves.
        const st: string[] = [];
        const isText = /^(textbox|searchbox|combobox|spinbutton|textarea)$/i.test(r) || (tagName === 'input' && !/^(checkbox|radio|button|submit|reset|image|file|range|color)$/.test(stype)) || tagName === 'textarea' || isEditable;
        if (stype && tagName === 'input' && !/^(text|checkbox|radio|submit|button)$/.test(stype)) st.push(`type=${stype}`);
        if (tagName === 'select') {
          const opts: { label: string; on: boolean }[] = [];
          const collect = (k: number) => {
            for (const c of kids[k]) {
              const t = (S[N.nodeName[c]] ?? '').toLowerCase();
              if (t === 'option') opts.push({ label: clip(squash(textIn(c, 80) || attrsOf(c).value || ''), 50), on: selected.has(c) });
              else if (t === 'optgroup') collect(c);
            }
          };
          collect(src);
          el.options = opts.map((x) => x.label);
          const on = opts.find((x) => x.on) ?? opts[0];
          if (on) st.push(`selected ${quote(on.label)}`);
          const others = opts.filter((x) => x !== on).map((x) => x.label);
          if (others.length) st.push(`options: ${others.slice(0, 8).map(quote).join(', ')}${others.length > 8 ? `, … ${others.length - 8} more` : ''}`);
          if (a.multiple !== undefined) st.push('multiple');
        } else if (isText && !fileInput) {
          const v = tagName === 'textarea' ? (textValues.get(src) ?? values.get(src) ?? '') : isEditable ? textIn(i, 200) : (values.get(src) ?? '');
          const vault = o.vaultTyped?.get(`${f.session}:${N.backendNodeId[src]}`);
          if (vault) st.push(v ? `filled with ${vault} from the vault, value hidden` : 'empty');
          else if (o.userTyped.has(`${f.session}:${N.backendNodeId[src]}`)) st.push(v ? 'filled by the user, value hidden' : 'empty');
          else if (sensitive) st.push(v ? 'filled, value hidden' : 'empty');
          else st.push(v ? `value ${quote(clip(squash(v), 80))}` : 'empty');
        }
        if (/^(checkbox|radio|switch|menuitemcheckbox|menuitemradio)$/i.test(r) || /^(checkbox|radio)$/.test(stype)) {
          const c = checked.has(src) || sax?.props.checked === 'true' || sax?.props.checked === true || a['aria-checked'] === 'true';
          st.push(c ? 'checked' : 'not checked');
        }
        const p = sax?.props ?? {};
        if (tagName !== 'select' && (p.expanded !== undefined || a['aria-expanded'] !== undefined)) st.push(String(p.expanded ?? a['aria-expanded']) === 'true' ? 'expanded' : 'collapsed');
        if (p.selected === true && /^(tab|option|treeitem)$/i.test(r)) st.push('selected');
        if (p.disabled === true || a.disabled !== undefined || a['aria-disabled'] === 'true') st.push('disabled');
        if (p.required === true || a.required !== undefined) st.push('required');
        if (p.invalid && p.invalid !== 'false') st.push('invalid');
        if (p.focused === true) st.push('focused');
        if (fileInput) st.push(shown ? 'use browser_upload' : 'hidden: use browser_upload');
        if (st.length) parts.push(`(${st.join(', ')})`);
        if (tag === 'a') {
          const h = shortHref(a.href, o.url);
          if (h) parts.push(`→ ${h}`);
        }
        lines.push({ text: parts.join(' '), zone: listHidden && !shown ? 'view' : zone, kind: 'el', y: vbox.y, id });
        els.push(el);
        const submitLike = tagName === 'button' ? (a.type ?? 'submit').toLowerCase() === 'submit' : tagName === 'input' ? /^(submit|image)$/.test(stype) : /^(button|link)$/i.test(r);
        pending.push({ el, form: myForm, submitLike });
      }

      // Frames: the same process's documents, and those of other processes that were snapshotted.
      if (tag === 'iframe' || tag === 'frame') {
        if (shown && box) {
          flush();
          const inner = docIdx.get(i);
          if (inner !== undefined) walkFrame(f, inner, box.x, box.y, depth + 1);
          else {
            const oop = o.frames.find((x) => x.owner && x.owner.session === f.session && x.owner.backendNodeId === N.backendNodeId[i]);
            if (oop) walkFrame(oop, 0, box.x, box.y, depth + 1);
            else if (box.w > 60 && box.h > 30) {
              let host = '';
              try {
                host = new URL(a.src ?? '', o.url).host;
              } catch {}
              lines.push({ text: `(a frame${host ? ` from ${host}` : ''}${a.title ? ` titled ${quote(clip(a.title, 60))}` : ''}: its content is not readable here)`, zone, kind: 'text', y: box.y });
            }
          }
          flush();
        }
        return;
      }

      if (tag === 'img' && shown && !inEl && a.alt && squash(a.alt).length > 2) {
        if (!cur.zone) {
          cur.zone = zone;
          cur.y = box!.y;
        }
        cur.parts.push(` [image: ${clip(squash(a.alt), 80)}] `);
      }
      if (tag === 'td' || tag === 'th') cur.parts.push(' | ');
      if (tag === 'br') flush();

      // Inside a numbered element its text is its name; options of a select are listed with it.
      if (tag !== 'select') {
        const next = el ?? inEl;
        for (const c of kids[i]) visit(c, op, next, myForm, editable || isEditable, pointer || cursor === 'pointer', quiet || naming);
      }
      if (isBlock || el) flush();
    };

    for (let i = 0; i < n; i++) if (N.parentIndex[i] < 0) visit(i, 1, null, null, false, false);
  };

  const main = o.frames.find((f) => !f.owner);
  if (main) walkFrame(main, 0, 0, 0, 0);
  flush();

  for (const p of pending) if (PAY.test(p.el.name) || (p.submitLike && ((p.form && cardForms.has(p.form)) || (payFrame && /\b(pay|order|purchase|buy|confirm|complete|place|submit)\b/i.test(p.el.name))))) p.el.payment = true;

  // Within the budget: what is on screen first, then elements before the page's text.
  const view = lines.filter((l) => l.zone === 'view');
  const next = lines.filter((l) => l.zone === 'below');
  const size = (ls: Line[]) => ls.reduce((s, l) => s + l.text.length + 1, 0);
  const above = lines.filter((l) => l.kind === 'el' && l.zone === 'above').length;
  let below = lines.filter((l) => l.kind === 'el' && l.zone === 'far').length;
  let shown = [...view, ...next];
  let cut = 0;
  let belowShown = next.length > 0;
  if (size(shown) > o.budget) {
    shown = view;
    belowShown = false;
    below += next.filter((l) => l.kind === 'el').length;
  }
  if (size(shown) > o.budget) shown = shown.map((l) => (l.kind === 'text' ? { ...l, text: clip(l.text, 120) } : l));
  if (size(shown) > o.budget) shown = shown.filter((l) => l.kind !== 'text');
  if (size(shown) > o.budget) {
    let total = 0;
    const keep: Line[] = [];
    for (const l of shown) {
      if (total + l.text.length + 1 > o.budget) {
        cut++;
        continue;
      }
      total += l.text.length + 1;
      keep.push(l);
    }
    shown = keep;
  }
  const out: string[] = [];
  let wasBelow = false;
  for (const l of shown) {
    if (l.zone === 'below' && !wasBelow && belowShown) {
      out.push('--- below the visible part (scroll down to use these) ---');
      wasBelow = true;
    }
    out.push(l.text);
  }
  return { body: out.join('\n'), els, lines, above, below, cut };
}

function implicitRole(tag: string, type: string, a: Record<string, string>): string {
  switch (tag) {
    case 'a':
      return 'link';
    case 'button':
      return 'button';
    case 'select':
      return a.multiple !== undefined ? 'listbox' : 'select';
    case 'textarea':
      return 'textbox';
    case 'summary':
      return 'button';
    case 'input':
      if (/^(submit|button|reset|image)$/.test(type)) return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      if (type === 'number') return 'spinbutton';
      if (type === 'search') return 'searchbox';
      return 'textbox';
    default:
      return a.contenteditable !== undefined ? 'textbox' : 'clickable';
  }
}
