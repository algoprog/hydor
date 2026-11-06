// AI on the page, as Notion AI: part of the page editor (writing.ts hands it what it needs). Space on an empty line,
// "/ai", Ctrl+J, Ask AI in a block's menu (⋮⋮) or on the bar over picked words open a bar under what it is about, with a
// field to ask anything and a list of what the AI does: Continue writing, Write about…, Summarize, Make shorter or
// longer, Improve the writing, Fix spelling and grammar, Simplify, Change the tone, Translate, Explain, Make a table or a
// list of…, Brainstorm, Action items. The app asks the helper model (server/write/page-ai.ts) and sends its answer back as
// Markdown, which shows in place as blocks, marked as the AI's, with what to do with it: Replace what was picked or
// Insert it below (Done, on an empty line), Continue writing, Make longer, Try again, Discard, or a follow-up in words.
// Nothing changes in the page until it is kept, and keeping it is one step to undo; while an answer waits, the page
// keeps still (a press elsewhere asks to keep or discard it first).
//
// Like the writing, the function runs in the browser: its source is sent as text, so it uses only its argument and the
// browser's own globals.
import type { Extra, ExtraCore } from './writing.ts';

export function writingAi(X: ExtraCore): Extra {
  const E = X.E;
  const L = E.L;
  const doc = document;
  const { accent, panel, line, ink, muted, dark } = E.look;
  const purple = dark ? '#b9a7ff' : '#6b4fd8';
  const hover = dark ? '#2a303c' : '#efebe3';
  const LANGS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Greek', 'Chinese (Simplified)', 'Japanese', 'Korean', 'Arabic'];
  const TONES: [string, string][] = [
    ['professional', 'Professional'],
    ['casual', 'Casual'],
    ['straightforward', 'Straightforward'],
    ['confident', 'Confident'],
    ['friendly', 'Friendly'],
  ];
  let canAi = true;

  // ---- what it is about ---------------------------------------------------------------------------------------------
  interface Ctx {
    kind: 'empty' | 'words' | 'blocks' | 'page';
    blocks: Element[];
    /** words: the block written in, and where the words picked start and end in it (characters). */
    host?: HTMLElement;
    a?: number;
    b?: number;
    whole?: boolean;
    /** What is picked, as Markdown. */
    text: string;
    /** The page before it, and all of it, as Markdown. */
    before: string;
    page: string;
  }
  interface Session {
    ctx: Ctx;
    state: 'ask' | 'working' | 'answer';
    view: 'main' | 'tone' | 'lang';
    /** A chip before the field (Write about, Make a list of, Translate into…): what the words typed are for. */
    chip: { action: string; label: string } | null;
    i: number;
    req: string;
    /** The request last sent (Try again sends it again). */
    last: Record<string, unknown> | null;
    markdown: string;
    preview: HTMLElement | null;
    model: string;
    cost: number;
    error: string;
    escOnce: boolean;
    /** The answer, as it was before a Continue writing: the new words go after it. */
    append: boolean;
  }
  let S: Session | null = null;
  let seq = 0;
  /** Words of characters in a block's own text, so a range picked can be found again after the block is left. */
  const offsetOf = (h: Node, node: Node, off: number) => {
    const r = doc.createRange();
    r.selectNodeContents(h);
    try {
      r.setEnd(node, off);
    } catch {
      return 0;
    }
    return r.toString().length;
  };
  const rangeOf = (h: Element, a: number, b: number): Range => {
    const r = doc.createRange();
    r.selectNodeContents(h);
    const w = doc.createTreeWalker(h, NodeFilter.SHOW_TEXT);
    let n = 0;
    let startSet = false;
    for (let t = w.nextNode() as Text | null; t; t = w.nextNode() as Text | null) {
      const len = t.data.length;
      if (!startSet && a <= n + len) {
        r.setStart(t, Math.max(0, a - n));
        startSet = true;
      }
      if (startSet && b <= n + len) {
        r.setEnd(t, Math.max(0, b - n));
        return r;
      }
      n += len;
    }
    return r;
  };
  /** The page's blocks before a block (its top-level ones, and those before it in its own container). */
  const beforeOf = (b: Element | null): string => {
    const f = X.flow();
    const frag = doc.createDocumentFragment();
    if (!b) return E.db.mdOf(f, 12_000).slice(-8000);
    for (let x: Element | null = b; x && x !== f && x !== doc.body; x = x.parentElement) {
      const sibs: Element[] = [];
      for (let s = x.previousElementSibling; s; s = s.previousElementSibling) sibs.unshift(s);
      frag.prepend(...sibs.map((s) => s.cloneNode(true)));
    }
    return E.db.mdOf(frag, 60_000).slice(-8000);
  };
  const outerOf = (b: Element) => {
    let x = b;
    while (x.parentElement && /^(UL|OL|LI)$/.test(x.parentElement.tagName) && x.parentElement !== X.flow()) x = x.parentElement;
    return x;
  };
  const gather = (): Ctx => {
    const h = E.editing();
    const page = E.db.mdOf(X.flow(), 24_000);
    if (h) {
      const s = getSelection();
      const r = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
      const u = X.unitOf(h);
      if (r && !r.collapsed && h.contains(r.commonAncestorContainer)) {
        const a = offsetOf(h, r.startContainer, r.startOffset);
        const b = offsetOf(h, r.endContainer, r.endOffset);
        const all = (h.textContent ?? '').length;
        const text = E.db.mdOf(r.cloneContents(), 24_000) || r.toString();
        E.finish();
        return { kind: 'words', blocks: [u], host: h, a, b, whole: a === 0 && b >= all, text, before: beforeOf(u), page };
      }
      E.finish();
      if (X.emptyHost(h)) return { kind: 'empty', blocks: [u], text: '', before: beforeOf(u), page };
      return { kind: 'blocks', blocks: [u], text: E.db.mdOf(u, 24_000), before: beforeOf(u), page };
    }
    const list = X.picked().length > 1 ? X.inOrder(X.picked()) : E.sel() && E.sel() !== doc.body ? [X.unitOf(E.sel()!)] : [];
    if (list.length) {
      const frag = doc.createDocumentFragment();
      frag.append(...list.map((b) => b.cloneNode(true)));
      return { kind: 'blocks', blocks: list, text: E.db.mdOf(frag, 24_000), before: beforeOf(list[0]), page };
    }
    return { kind: 'page', blocks: [], text: '', before: page.slice(-8000), page };
  };

  // ---- the bar, the list, and the marks on the page ---------------------------------------------------------------------
  const ui = doc.createElement('div');
  ui.innerHTML = `<style>
    .aib{position:fixed;display:none;flex-direction:column;gap:2px;box-sizing:border-box;pointer-events:auto;padding:6px;border-radius:12px;background:${panel};border:1px solid ${line};box-shadow:0 10px 32px rgba(0,0,0,${dark ? '.5' : '.18'});font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:${ink}}
    .aif{display:flex;align-items:center;gap:6px;min-height:30px}
    .aii{display:grid;place-items:center;width:22px;color:${purple};flex:none}
    .aic{display:none;flex:none;padding:2px 7px;border-radius:6px;background:${purple}22;color:${purple};font-weight:600;font-size:12px;white-space:nowrap}
    .aic.on{display:inline-block}
    .aiq{all:unset;flex:1;min-width:0;height:28px;font:13.5px system-ui,-apple-system,sans-serif;color:${ink}}
    .aiq::placeholder{color:${muted}}
    .aig{all:unset;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:${purple};color:#fff;cursor:pointer;flex:none}
    .aig[disabled]{opacity:.35;cursor:default}
    .aiw{display:none;align-items:center;gap:8px;padding:2px 4px;color:${muted}}
    .aiw.on{display:flex}
    .aiw button,.aix button{all:unset;padding:2px 8px;border-radius:6px;border:1px solid ${line};color:${ink};cursor:pointer;font-size:12px}
    .aiw button:hover,.aix button:hover{background:${hover}}
    .aie{display:none;padding:2px 4px;color:${dark ? '#f28b8b' : '#bd2525'};font-size:12.5px;white-space:normal}
    .aie.on{display:block}
    .aim{display:none;padding:0 4px;color:${muted};font-size:11.5px}
    .aim.on{display:block}
    .aix{display:none;padding:2px 4px;color:${muted};font-size:12px}
    .aix.on{display:block}
    .spin{display:inline-block;width:12px;height:12px;border:2px solid ${line};border-top-color:${purple};border-radius:50%;animation:aisp 1s linear infinite;flex:none}
    @keyframes aisp{to{transform:rotate(360deg)}}
    .ail{position:fixed;display:none;flex-direction:column;box-sizing:border-box;min-width:250px;max-width:calc(100vw - 12px);padding:4px;border-radius:12px;background:${panel};border:1px solid ${line};box-shadow:0 10px 32px rgba(0,0,0,${dark ? '.45' : '.18'});font:13px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;color:${ink};overflow-y:auto;overscroll-behavior:contain;pointer-events:auto}
    .ail>*{flex:none}
    .ail .row{all:unset;display:flex;align-items:center;gap:9px;height:30px;padding:0 9px;border-radius:7px;cursor:pointer;white-space:nowrap;box-sizing:border-box}
    .ail .row.on{background:${hover}}
    .ail .ri{display:grid;place-items:center;width:20px;flex:none;color:${purple}}
    .ail .rl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
    .ail .mh{padding:6px 9px 3px;color:${muted};font-size:11.5px;font-weight:600}
    .ail .ms{height:1px;margin:4px 6px;background:${line}}
    .aiw2{position:fixed;display:none;pointer-events:none;box-sizing:border-box;border-radius:6px;background:${purple}14;border:1px solid ${purple}55}
    @media (pointer:coarse){.ail .row{height:40px}.aiq{height:34px}}
  </style>
  <div class="aiw2"></div><div class="aiw2"></div><div class="aiw2"></div>
  <div class="aib" role="dialog" aria-label="AI">
    <div class="aif"><span class="aii"></span><span class="aic"></span><input class="aiq" autocomplete="off" spellcheck="false"><button class="aig" type="button"></button></div>
    <div class="aiw"><span class="spin"></span><span class="aiwt"></span><button type="button" data-a="stop"></button></div>
    <div class="aie" role="alert"></div>
    <div class="aix"></div>
    <div class="aim"></div>
  </div>
  <div class="ail" role="listbox"></div>`;
  E.shadow.append(...ui.childNodes);
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => E.shadow.querySelector(s) as T;
  const bar = $('.aib');
  const field = $<HTMLInputElement>('.aiq');
  const chipEl = $('.aic');
  const go = $<HTMLButtonElement>('.aig');
  const workEl = $('.aiw');
  const errEl = $('.aie');
  const escEl = $('.aix');
  const metaEl = $('.aim');
  const listEl = $('.ail');
  const marks = [...E.shadow.querySelectorAll<HTMLElement>('.aiw2')];
  // (its own icons: the writing takes this part's icons once it is made)
  const own = (d: string, n: number) => `<svg viewBox="0 0 24 24" width="${n}" height="${n}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  $('.aii').innerHTML = own('<path d="m12 3-1.9 5.8L4 10.6l5.6 2.1L12 19l2-6.3 6-2.1-6-1.8z"/><path d="M5 3v4"/><path d="M3 5h4"/>', 16);
  go.innerHTML = own('<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>', 14);
  go.title = L('ai.send', 'Ask');
  ($('.aiw button') as HTMLElement).textContent = L('ai.stop', 'Stop');
  $('.aiwt').textContent = L('ai.writing', 'The AI is writing…');

  // ---- what the AI can do here ------------------------------------------------------------------------------------------
  interface Row {
    id: string;
    label: string;
    icon: string;
    run: () => void;
    more?: boolean;
  }
  type Item = Row | { head: string } | '-';
  const picked = () => !!S && (S.ctx.kind === 'words' || S.ctx.kind === 'blocks');
  const hasWords = () => !!S && !!(S.ctx.text.trim() || S.ctx.page.trim());
  const topic = (action: string, label: string) => () => {
    if (!S) return;
    S.chip = { action, label };
    field.value = '';
    S.i = -1;
    render();
    field.focus();
  };
  const rows = (): Item[] => {
    if (!S) return [];
    const s = S;
    if (s.state === 'answer') {
      const out: Item[] = [];
      if (s.ctx.kind === 'empty') out.push({ id: 'keep', label: L('ai.done', 'Done'), icon: 'check', run: () => keep('keep') });
      else if (s.ctx.kind === 'page') out.push({ id: 'keep', label: L('ai.insertEnd', 'Insert it at the end'), icon: 'check', run: () => keep('keep') });
      else {
        out.push({ id: 'replace', label: s.ctx.kind === 'words' ? L('ai.replaceWords', 'Replace the words picked') : L('ai.replaceBlocks', 'Replace what was picked'), icon: 'check', run: () => keep('replace') });
        out.push({ id: 'below', label: L('ai.below', 'Insert it below'), icon: 'below', run: () => keep('below') });
      }
      out.push('-');
      out.push({ id: 'more', label: L('ai.continue', 'Continue writing'), icon: 'pen', run: () => follow({ action: 'continue' }) });
      out.push({ id: 'longer', label: L('ai.longer', 'Make longer'), icon: 'longer', run: () => follow({ action: 'longer' }) });
      out.push({ id: 'again', label: L('ai.again', 'Try again'), icon: 'again', run: () => again() });
      out.push({ id: 'discard', label: L('ai.discard', 'Discard'), icon: 'del', run: () => close() });
      return out;
    }
    if (s.view === 'tone')
      return [
        { id: 'back', label: L('ai.tone', 'Change the tone'), icon: 'left', run: () => ((s.view = 'main'), (s.i = -1), render()) },
        '-',
        ...TONES.map(([id, en]): Row => ({ id: `tone:${id}`, label: L(`ai.t.${id}`, en), icon: '', run: () => ask({ action: 'tone', tone: id }) })),
      ];
    if (s.view === 'lang')
      return [
        { id: 'back', label: L('ai.translate', 'Translate'), icon: 'left', run: () => ((s.view = 'main'), (s.i = -1), render()) },
        '-',
        ...LANGS.map((l): Row => ({ id: `lang:${l}`, label: l, icon: '', run: () => ask({ action: 'translate', lang: l }) })),
        '-',
        { id: 'langOther', label: L('ai.otherLang', 'Another language'), icon: 'pen', run: () => ((s.view = 'main'), topic('translate', L('ai.translateInto', 'Translate into'))()) },
      ];
    const out: Item[] = [];
    if (picked()) {
      out.push({ head: L('ai.editHead', 'Edit or review') });
      out.push({ id: 'improve', label: L('ai.improve', 'Improve the writing'), icon: 'magic', run: () => ask({ action: 'improve' }) });
      out.push({ id: 'fix', label: L('ai.fix', 'Fix spelling and grammar'), icon: 'check', run: () => ask({ action: 'fix' }) });
      out.push({ id: 'shorter', label: L('ai.shorter', 'Make shorter'), icon: 'shorter', run: () => ask({ action: 'shorter' }) });
      out.push({ id: 'longer', label: L('ai.longer', 'Make longer'), icon: 'longer', run: () => ask({ action: 'longer' }) });
      out.push({ id: 'tone', label: L('ai.tone', 'Change the tone'), icon: 'tone', more: true, run: () => ((s.view = 'tone'), (s.i = 0), render()) });
      out.push({ id: 'simplify', label: L('ai.simplify', 'Simplify the language'), icon: 'simplify', run: () => ask({ action: 'simplify' }) });
      out.push({ id: 'translate', label: L('ai.translate', 'Translate'), icon: 'lang', more: true, run: () => ((s.view = 'lang'), (s.i = 0), render()) });
      out.push({ id: 'explain', label: L('ai.explain', 'Explain this'), icon: 'help', run: () => ask({ action: 'explain' }) });
      out.push({ head: L('ai.makeHead', 'Make from it') });
      out.push({ id: 'summarize', label: L('ai.summarize', 'Summarize'), icon: 'summary', run: () => ask({ action: 'summarize' }) });
      out.push({ id: 'actions', label: L('ai.actions', 'Find action items'), icon: 'todo', run: () => ask({ action: 'actions' }) });
      out.push({ id: 'table', label: L('ai.tableOf', 'Make a table of it'), icon: 'table', run: () => ask({ action: 'table' }) });
      out.push({ id: 'continue', label: L('ai.continue', 'Continue writing'), icon: 'pen', run: () => ask({ action: 'continue' }) });
      return out;
    }
    out.push({ head: L('ai.writeHead', 'Write with AI') });
    if (s.ctx.before.trim()) out.push({ id: 'continue', label: L('ai.continue', 'Continue writing'), icon: 'pen', run: () => ask({ action: 'continue' }) });
    out.push({ id: 'write', label: L('ai.write', 'Write about…'), icon: 'pen', run: topic('write', L('ai.writeChip', 'Write about')) });
    out.push({ id: 'brainstorm', label: L('ai.brainstorm', 'Brainstorm ideas on…'), icon: 'idea', run: topic('brainstorm', L('ai.brainstormChip', 'Brainstorm ideas on')) });
    out.push({ id: 'list', label: L('ai.list', 'Make a list of…'), icon: 'bullet', run: topic('list', L('ai.listChip', 'Make a list of')) });
    out.push({ id: 'table', label: L('ai.table', 'Make a table of…'), icon: 'table', run: topic('table', L('ai.tableChip', 'Make a table of')) });
    if (hasWords()) {
      out.push({ head: L('ai.pageHead', 'From this page') });
      out.push({ id: 'summarize', label: L('ai.summarizePage', 'Summarize the page'), icon: 'summary', run: () => ask({ action: 'summarize' }) });
      out.push({ id: 'actions', label: L('ai.actionsPage', 'Find the action items'), icon: 'todo', run: () => ask({ action: 'actions' }) });
      out.push({ id: 'explain', label: L('ai.explainPage', 'Explain the page'), icon: 'help', run: () => ask({ action: 'explain' }) });
      out.push({ id: 'translate', label: L('ai.translatePage', 'Translate the page'), icon: 'lang', more: true, run: () => ((s.view = 'lang'), (s.i = 0), render()) });
    }
    return out;
  };
  /** The rows the words typed fit (all of them while nothing is typed, or a chip waits for its words). */
  const shown = (): Item[] => {
    const all = rows();
    const q = field.value.trim().toLowerCase();
    if (!q || S?.chip || S?.state !== 'ask') return all;
    const hits = all.filter((r): r is Row => typeof r === 'object' && 'id' in r && r.label.toLowerCase().includes(q));
    return hits;
  };
  const pressable = (r: Item): r is Row => typeof r === 'object' && 'id' in r;

  // ---- drawing ------------------------------------------------------------------------------------------------------------
  const anchorRect = (): DOMRect | null => {
    if (!S) return null;
    if (S.preview?.isConnected) return S.preview.getBoundingClientRect();
    const bs = S.ctx.blocks.filter((b) => b.isConnected);
    if (!bs.length) {
      const last = X.lastBlock(X.flow());
      const r = (last ?? X.flow()).getBoundingClientRect();
      return new DOMRect(r.left, r.bottom, r.width, 0);
    }
    const rs = bs.map((b) => b.getBoundingClientRect());
    const left = Math.min(...rs.map((r) => r.left));
    const right = Math.max(...rs.map((r) => r.right));
    const top = Math.min(...rs.map((r) => r.top));
    const bottom = Math.max(...rs.map((r) => r.bottom));
    return new DOMRect(left, top, right - left, bottom - top);
  };
  const place = () => {
    if (!S) return;
    const r = anchorRect();
    if (!r) return;
    const f = X.flow().getBoundingClientRect();
    const w = Math.max(300, Math.min(680, Math.max(r.width, Math.min(f.width, 560)), innerWidth - 12));
    bar.style.width = `${w}px`;
    const left = Math.max(6, Math.min(r.left, innerWidth - w - 6));
    bar.style.left = `${left}px`;
    const bh = bar.offsetHeight;
    let top = r.bottom + 6;
    if (top + bh > innerHeight - 6 && r.top - bh - 6 > 6) top = r.top - bh - 6;
    bar.style.top = `${Math.max(6, Math.min(top, innerHeight - bh - 6))}px`;
    if (listEl.style.display !== 'none') X.placeAt(listEl, { left, top: bar.getBoundingClientRect().top, bottom: bar.getBoundingClientRect().bottom }, 4);
    // The blocks it is about, marked while it works on them (the words picked are lit up in the page).
    const bs = S.state === 'answer' || S.ctx.kind === 'empty' || S.ctx.kind === 'page' || S.ctx.kind === 'words' ? [] : S.ctx.blocks.filter((b) => b.isConnected).slice(0, marks.length);
    marks.forEach((m, i) => {
      const b = bs[i];
      if (!b) return void (m.style.display = 'none');
      const q = b.getBoundingClientRect();
      Object.assign(m.style, { display: 'block', left: `${q.left - 4}px`, top: `${q.top - 3}px`, width: `${q.width + 8}px`, height: `${q.height + 6}px` });
    });
  };
  const render = () => {
    if (!S) {
      bar.style.display = 'none';
      listEl.style.display = 'none';
      for (const m of marks) m.style.display = 'none';
      lit(null);
      return;
    }
    const s = S;
    bar.style.display = 'flex';
    chipEl.textContent = s.chip?.label ?? '';
    chipEl.classList.toggle('on', !!s.chip);
    field.placeholder = s.state === 'answer' ? L('ai.follow', 'Tell the AI what to change…') : s.chip ? L('ai.what', 'What about?') : picked() ? L('ai.askPicked', 'Ask the AI to change it, or pick below…') : L('ai.ask', 'Ask the AI to write anything…');
    field.disabled = s.state === 'working';
    go.disabled = s.state === 'working';
    workEl.classList.toggle('on', s.state === 'working');
    errEl.textContent = s.error;
    errEl.classList.toggle('on', !!s.error);
    escEl.textContent = L('ai.escAgain', 'Press Esc again to throw the answer away.');
    escEl.classList.toggle('on', s.escOnce);
    const cost = s.cost > 0 ? ` · $${s.cost < 0.01 ? s.cost.toPrecision(2) : s.cost.toFixed(2)}` : '';
    metaEl.textContent = s.state === 'answer' && s.model ? `${L('ai.by', 'Written by {model}').replace('{model}', s.model)}${cost} · ${L('ai.check', 'Check it before you keep it.')}` : '';
    metaEl.classList.toggle('on', !!metaEl.textContent);
    if (s.preview) s.preview.style.opacity = s.state === 'working' ? '.5' : '';
    // The list: under the bar (not while it works).
    const items = s.state === 'working' ? [] : shown();
    const can = items.map((r, i) => (pressable(r) ? i : -1)).filter((i) => i >= 0);
    if (s.i >= 0 && !can.includes(s.i)) s.i = can[0] ?? -1;
    if (!items.length) listEl.style.display = 'none';
    else {
      listEl.innerHTML = items
        .map((r, i) => {
          if (r === '-') return '<div class="ms"></div>';
          if ('head' in r) return `<div class="mh">${X.esc(r.head)}</div>`;
          return `<button class="row${i === s.i ? ' on' : ''}" data-i="${i}" role="option" aria-selected="${i === s.i}"><span class="ri">${r.icon ? X.svg(r.icon, 15) : ''}</span><span class="rl">${X.esc(r.label)}</span>${r.more ? `<span class="ri">${X.svg('right', 13)}</span>` : ''}</button>`;
        })
        .join('');
      listEl.style.display = 'flex';
      listEl.style.minWidth = `${Math.min(300, bar.offsetWidth)}px`;
    }
    place();
    listEl.querySelector('.row.on')?.scrollIntoView({ block: 'nearest' });
    lit(s.ctx.kind === 'words' && s.ctx.host?.isConnected ? rangeOf(s.ctx.host, s.ctx.a ?? 0, s.ctx.b ?? 0) : null);
  };
  /** The words picked, lit up in the page while the AI works on them (where the browser can). */
  const lit = (r: Range | null) => {
    const C = (window as unknown as { CSS?: { highlights?: Map<string, unknown> } }).CSS;
    const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    if (!C?.highlights || !H) return;
    if (r) C.highlights.set('n-ai', new H(r));
    else C.highlights.delete('n-ai');
  };

  // ---- asking, and what comes back --------------------------------------------------------------------------------------
  const open = (ctx?: Ctx) => {
    if (!canAi) return;
    if (S) close();
    X.closeMenu();
    X.closeSlash();
    const c = ctx ?? gather();
    // (the part picked loses its frame and bar while the AI's bar is open: the AI's marks say what it is about)
    E.select(null);
    S = { ctx: c, state: 'ask', view: 'main', chip: null, i: 0, req: '', last: null, markdown: '', preview: null, model: '', cost: 0, error: '', escOnce: false, append: false };
    field.value = '';
    // The blocks it is about stay in sight, and the bar under them.
    (c.blocks[c.blocks.length - 1] as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
    render();
    requestAnimationFrame(() => field.focus({ preventScroll: true }));
  };
  const send = (req: Record<string, unknown>) => {
    if (!S) return;
    const s = S;
    s.req = `ai${++seq}`;
    s.last = req;
    s.state = 'working';
    s.error = '';
    s.escOnce = false;
    render();
    E.send({ type: 'wa-ed-ai', id: s.req, ask: req });
  };
  const base = () => {
    const c = S!.ctx;
    return { text: c.kind === 'words' || c.kind === 'blocks' ? c.text : '', before: c.before, page: c.kind === 'page' || c.kind === 'empty' ? c.page : '', title: doc.title };
  };
  const ask = (o: Record<string, unknown>) => {
    if (!S) return;
    S.view = 'main';
    S.append = false;
    send({ ...base(), ...o });
  };
  /** After an answer: the AI goes on from it, or changes it. */
  const follow = (o: Record<string, unknown>) => {
    if (!S) return;
    const s = S;
    if (o.action === 'continue') {
      s.append = true;
      send({ action: 'continue', before: `${s.ctx.before}\n\n${s.markdown}`.slice(-8000), title: doc.title });
    } else {
      s.append = false;
      send({ action: o.action, text: s.markdown, title: doc.title });
    }
  };
  const again = () => {
    if (!S?.last) return;
    send(S.last);
  };
  /** What was typed in the field, sent: words for a chip, a follow-up to an answer, or a request of its own. */
  const submit = () => {
    if (!S) return;
    const s = S;
    const q = field.value.trim();
    if (s.state === 'answer') {
      if (!q) {
        const r = shown()[s.i];
        if (r && pressable(r)) r.run();
        return;
      }
      field.value = '';
      s.append = false;
      return send({ ...(s.last ?? base()), action: (s.last?.action as string) ?? 'ask', answer: s.markdown, ask: q });
    }
    if (s.chip) {
      if (!q) return;
      const action = s.chip.action;
      field.value = '';
      s.chip = null;
      return action === 'translate' ? ask({ action, lang: q }) : ask({ action, topic: q });
    }
    const items = shown();
    const r = items[s.i];
    if (q && (!r || !pressable(r) || !r.label.toLowerCase().includes(q.toLowerCase()))) {
      field.value = '';
      return ask({ action: 'ask', ask: q });
    }
    if (r && pressable(r)) r.run();
    else if (q) {
      field.value = '';
      ask({ action: 'ask', ask: q });
    }
  };
  /** The answer's blocks, made from its Markdown (words are words: nothing of it becomes markup but the blocks'). */
  const blocksOf = (md: string): HTMLElement[] => {
    const t = doc.createElement('template');
    t.innerHTML = X.sanitize(E.db.md(md));
    return [...t.content.children] as HTMLElement[];
  };
  const showAnswer = (md: string) => {
    if (!S) return;
    const s = S;
    s.markdown = s.append && s.markdown ? `${s.markdown}\n\n${md}` : md;
    s.append = false;
    let p = s.preview;
    if (!p || !p.isConnected) {
      p = doc.createElement('div');
      p.setAttribute('data-n-own', '');
      p.setAttribute('data-n-ai', '');
      const c = s.ctx;
      const bs = c.blocks.filter((b) => b.isConnected);
      if (c.kind === 'empty' && bs[0]) {
        bs[0].before(p);
        bs[0].setAttribute('data-n-ai-hide', '');
      } else if (bs.length) outerOf(bs[bs.length - 1]).after(p);
      else {
        const f = X.flow();
        const last = X.lastBlock(f);
        if (last) last.after(p);
        else f.append(p);
      }
      s.preview = p;
    }
    p.replaceChildren(...blocksOf(s.markdown));
    s.state = 'answer';
    s.i = 0;
    field.value = '';
    render();
    p.scrollIntoView({ block: 'nearest' });
    field.focus({ preventScroll: true });
  };
  /** Takes the answer's preview out, and shows the block it stood in for again. */
  const unpreview = () => {
    const s = S;
    if (!s) return;
    s.preview?.remove();
    s.preview = null;
    for (const b of s.ctx.blocks) b.removeAttribute('data-n-ai-hide');
  };
  const close = () => {
    if (!S) return;
    if (S.state === 'working') E.send({ type: 'wa-ed-ai-stop', id: S.req });
    unpreview();
    S = null;
    render();
  };
  /** Keeps the answer: in the empty block's place, in place of what was picked, below it, or at the end; one step to undo. */
  const keep = (how: 'keep' | 'replace' | 'below') => {
    if (!S || !S.markdown) return;
    const s = S;
    unpreview();
    S = null;
    render();
    const c = s.ctx;
    const nodes = blocksOf(s.markdown);
    if (!nodes.length) return;
    E.change(() => {
      const bs = c.blocks.filter((b) => b.isConnected);
      const writeEnd = () => {
        const last = nodes[nodes.length - 1];
        const h = X.lastHostIn(last) ?? (X.kindOf(last) ? X.hostOf(last, true) : null);
        return h ? X.writeIn(h, { end: true }) : { pick: last };
      };
      // The words picked in one block, and an answer of one paragraph: it takes their place in the block.
      if (how === 'replace' && c.kind === 'words' && c.host?.isConnected && !c.whole && nodes.length === 1 && nodes[0].tagName === 'P') {
        const r = rangeOf(c.host, c.a ?? 0, c.b ?? 0);
        r.deleteContents();
        const frag = doc.createDocumentFragment();
        frag.append(...nodes[0].childNodes);
        const len = frag.textContent?.length ?? 0;
        r.insertNode(frag);
        return X.writeIn(c.host, { off: (c.a ?? 0) + len });
      }
      const listOut = (b: Element) => {
        const list = b.tagName === 'LI' ? b.parentElement : null;
        b.remove();
        if (list && !list.children.length) list.remove();
      };
      if ((how === 'keep' || how === 'replace') && bs.length && c.kind !== 'page') {
        const first = bs[0];
        const at = first.tagName === 'LI' ? outerOf(first) : first;
        if (at === first) first.before(...nodes);
        else at.after(...nodes);
        for (const b of bs) listOut(b);
        return writeEnd();
      }
      if (how === 'below' && bs.length) {
        outerOf(bs[bs.length - 1]).after(...nodes);
        return writeEnd();
      }
      const f = X.flow();
      const last = X.lastBlock(f);
      if (last) last.after(...nodes);
      else f.append(...nodes);
      return writeEnd();
    });
  };
  const answer = (arg: any) => {
    if (!S || arg?.id !== S.req || S.state !== 'working') return;
    const s = S;
    s.model = typeof arg.model === 'string' ? arg.model.slice(0, 80) : '';
    s.cost = (typeof arg.cost === 'number' && Number.isFinite(arg.cost) ? arg.cost : 0) + (s.markdown ? s.cost : 0);
    if (typeof arg.error === 'string' || typeof arg.markdown !== 'string' || !arg.markdown.trim()) {
      s.state = s.markdown ? 'answer' : 'ask';
      s.error = typeof arg.error === 'string' ? arg.error.slice(0, 400) : L('ai.nothing', 'The AI gave nothing back: try again.');
      return render();
    }
    showAnswer(String(arg.markdown).slice(0, 60_000));
  };

  // ---- its own presses and keys --------------------------------------------------------------------------------------------
  for (const el of [bar, listEl])
    el.addEventListener('pointerdown', (e) => {
      // (the field takes the focus; the rest keeps it where it is)
      if (!(e.composedPath()[0] instanceof HTMLInputElement)) e.preventDefault();
    });
  listEl.addEventListener('click', (e) => {
    const b = ((e.composedPath()[0] as HTMLElement).closest?.('[data-i]') as HTMLElement | null) ?? null;
    if (!b || !S) return;
    const r = shown()[Number(b.dataset.i)];
    if (r && pressable(r)) r.run();
  });
  listEl.addEventListener('pointermove', (e) => {
    const b = ((e.composedPath()[0] as HTMLElement).closest?.('[data-i]') as HTMLElement | null) ?? null;
    if (!b || !S || Number(b.dataset.i) === S.i) return;
    S.i = Number(b.dataset.i);
    for (const x of listEl.querySelectorAll('.row')) x.classList.toggle('on', (x as HTMLElement).dataset.i === b.dataset.i);
  });
  go.addEventListener('click', () => submit());
  ($('.aiw button') as HTMLElement).addEventListener('click', () => {
    if (!S) return;
    E.send({ type: 'wa-ed-ai-stop', id: S.req });
    S.req = '';
    S.state = S.markdown ? 'answer' : 'ask';
    render();
  });
  field.addEventListener('input', () => {
    if (!S) return;
    S.i = 0;
    S.escOnce = false;
    render();
  });
  const escape = () => {
    if (!S) return;
    if (S.state === 'ask' && (S.chip || S.view !== 'main')) {
      S.chip = null;
      S.view = 'main';
      return render();
    }
    if (S.state === 'answer' && !S.escOnce) {
      S.escOnce = true;
      return render();
    }
    const back = S.ctx;
    close();
    // Back where it was asked: the empty block written in again, or the blocks picked.
    const h = back.kind === 'empty' && back.blocks[0]?.isConnected ? X.hostOf(back.blocks[0]) : back.host?.isConnected ? back.host : null;
    if (h) E.write(h, back.kind === 'words' ? { off: back.b ?? 0 } : { off: 0 });
    else if (back.blocks[0]?.isConnected) E.select(back.blocks[0]);
  };
  field.addEventListener('keydown', (e) => {
    if (!S) return;
    const s = S;
    const items = shown();
    const can = items.map((r, i) => (pressable(r) ? i : -1)).filter((i) => i >= 0);
    if (e.key === 'Escape') {
      e.preventDefault();
      return escape();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!can.length) return;
      const at = can.indexOf(s.i);
      s.i = can[(at + (e.key === 'ArrowDown' ? 1 : -1) + can.length) % can.length];
      return render();
    }
    if (e.key === 'ArrowLeft' && s.view !== 'main' && !field.value) {
      e.preventDefault();
      s.view = 'main';
      return render();
    }
    if (e.key === 'ArrowRight' && !field.value) {
      const r = items[s.i];
      if (r && pressable(r) && r.more) {
        e.preventDefault();
        r.run();
      }
      return;
    }
    if (e.key === 'Backspace' && !field.value && s.chip) {
      e.preventDefault();
      s.chip = null;
      return render();
    }
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });
  // A double click elsewhere would start writing there while an answer waits.
  addEventListener(
    'dblclick',
    (e) => {
      if (S && !e.composedPath().some((x) => x === bar || x === listEl)) X.stop(e);
    },
    true,
  );

  const outside = (e: Event) => !e.composedPath().some((x) => x === bar || x === listEl);
  return {
    icons: {
      ai: '<path d="m12 3-1.9 5.8L4 10.6l5.6 2.1L12 19l2-6.3 6-2.1-6-1.8z"/><path d="M5 3v4"/><path d="M3 5h4"/>',
      send: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
      pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
      magic: '<path d="m21.6 2.4-.9-.9a1.2 1.2 0 0 0-1.7 0L2.4 18.2a1.2 1.2 0 0 0 0 1.7l.9.9a1.2 1.2 0 0 0 1.7 0L21.6 4.1a1.2 1.2 0 0 0 0-1.7Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
      shorter: '<path d="M4 7h16"/><path d="M4 12h10"/><path d="M4 17h6"/>',
      longer: '<path d="M4 6h16"/><path d="M4 10h16"/><path d="M4 14h16"/><path d="M4 18h10"/>',
      tone: '<path d="M2 12h3l3-8 4 16 3-8h7"/>',
      simplify: '<path d="M4 6h16"/><path d="M4 12h8"/><path d="M4 18h12"/>',
      lang: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
      help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
      summary: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
      idea: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
      below: '<path d="M12 5v14"/><path d="m5 12 7 7 7-7"/>',
      again: '<path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/>',
    },
    items: [{ id: 'ai', key: 'ai.slash', en: 'Ask AI', also: 'ai write summarize translate assistant generate continue brainstorm notion', icon: 'ai', mark: 'Space' }],
    css: `::highlight(n-ai){background-color:${purple}38}[data-n-ai]{display:block;margin:4px 0;padding:2px 12px;border-left:3px solid ${purple};border-radius:4px;background:${purple}10;pointer-events:none}[data-n-ai-hide]{display:none!important}`,
    hint(h) {
      return canAi && X.kindOf(X.unitOf(h)) === 'p' ? L('ai.hint', 'Press ‘space’ for AI, ‘/’ for commands') : null;
    },
    pick(id, at) {
      if (id !== 'ai') return false;
      E.noteTyping();
      at.drop();
      const h = at.h;
      const empty = X.emptyHost(h);
      const u = at.u;
      E.finish();
      open({ kind: empty ? 'empty' : 'blocks', blocks: [u], text: empty ? '' : E.db.mdOf(u, 24_000), before: beforeOf(u), page: E.db.mdOf(X.flow(), 24_000) });
      return true;
    },
    menu(blocks) {
      if (!canAi || !blocks.length || blocks.some((b) => b === doc.body)) return [];
      return [
        {
          icon: X.svg('ai'),
          label: L('ai.slash', 'Ask AI'),
          keys: 'Ctrl+J',
          run: () => {
            const list = X.inOrder(blocks.filter((b) => b.isConnected));
            const frag = doc.createDocumentFragment();
            frag.append(...list.map((b) => b.cloneNode(true)));
            open({ kind: 'blocks', blocks: list, text: E.db.mdOf(frag, 24_000), before: beforeOf(list[0]), page: E.db.mdOf(X.flow(), 24_000) });
          },
        },
      ];
    },
    key(e) {
      if (S) {
        // While the AI's bar is open, keys go to it, never to the page.
        if (e.key === 'Escape') escape();
        else field.focus({ preventScroll: true });
        return true;
      }
      if (!canAi) return false;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
        open();
        return true;
      }
      const h = E.editing();
      if (e.key === ' ' && !mod && !e.altKey && !e.shiftKey && h && X.kindOf(X.unitOf(h)) === 'p' && X.emptyHost(h) && !X.unitOf(h).closest('td,th,.n-cols,.n-card')) {
        open();
        return true;
      }
      return false;
    },
    press(e) {
      if (!S || !outside(e)) return false;
      // An answer waits: keep or throw it away first (Esc twice), the bar says so.
      X.stop(e);
      if (S.state === 'answer') {
        S.escOnce = true;
        render();
      }
      field.focus({ preventScroll: true });
      return true;
    },
    click(e) {
      if (!S || !outside(e)) return false;
      X.stop(e);
      return true;
    },
    act(a, arg) {
      if (a === 'caps') {
        if (arg && typeof arg === 'object' && 'ai' in arg) canAi = arg.ai !== false;
        return false;
      }
      if (a === 'aiOpen') {
        open();
        return true;
      }
      if (a === 'aiAnswer') {
        answer(arg);
        return true;
      }
      return false;
    },
    draw() {
      if (S) place();
    },
    restored() {
      if (S) close();
    },
    clean(root) {
      for (const x of root.querySelectorAll('[data-n-ai]')) x.remove();
      for (const x of root.querySelectorAll('[data-n-ai-hide]')) x.removeAttribute('data-n-ai-hide');
    },
  };
}
