// An app's view (shared/app-ui.ts), drawn inside the sandboxed frame every page renders in (kit.ts): its pages as
// tabs, each block's element filled with the view's values (a run's answer and form, what the app keeps, the
// view's own state), drawn again whenever they change, and what a click does (its events). Pages, ticks and the
// view's values change here; what reaches the app (ask the agent, run a flow, run it again, start another app,
// change a record, keep a value, copy, open, say) goes to the parent page by message, which does it for this app
// and this run only, and only what it was told the view may do (`can`).
//
// The function below runs in the browser, not here: its source is sent as text (Function#toString), so it uses
// only its arguments (its settings, and the template engine, made from uiEngine's source) and the browser's globals.
import { uiEngine } from '../../shared/app-ui.ts';
import { MEDIA_CSS, type MediaKitApi } from './media-kit.ts';

/** A function's source for a <script> element (as kit.ts writes its own): nothing in it may end the element. */
const scriptSafe = (src: string) => src.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/** The view's own look: tabs, blocks side by side, and the built-in elements, in the page kit's colours. */
const UI_CSS = `
.n-ui{display:block}
.n-ui-tabs{display:flex;gap:4px;margin:0 0 18px;padding:0 0 0;border-bottom:1px solid var(--n-line);overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.n-ui-tabs::-webkit-scrollbar{display:none}
.n-ui-tab{flex:none;position:relative;padding:9px 12px 11px;border:0;background:none;color:var(--n-muted);font:inherit;font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap}
.n-ui-tab:hover{color:var(--n-fg)}
.n-ui-tab[aria-selected=true]{color:var(--n-fg)}
.n-ui-tab[aria-selected=true]::after{content:"";position:absolute;left:10px;right:10px;bottom:-1px;height:2px;border-radius:2px;background:var(--n-accent)}
.n-ui-back{display:inline-flex;align-items:center;gap:6px;margin:0 0 14px;padding:4px 0;border:0;background:none;color:var(--n-muted);font:inherit;font-size:14px;cursor:pointer}
.n-ui-back:hover{color:var(--n-accent)}
.n-ui-blocks{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:16px;align-items:start}
.n-ui-block{grid-column:span 6;min-width:0}
@media (min-width:700px){.n-ui-w-half{grid-column:span 3}.n-ui-w-third{grid-column:span 2}.n-ui-w-two-thirds{grid-column:span 4}}
.n-ui-title{margin:0 0 10px!important;font-size:15px!important;font-weight:600;letter-spacing:-.005em}
.n-ui-each{display:flex;flex-direction:column;gap:12px}
.n-ui-each.n-ui-l-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr));gap:14px}
.n-ui-each.n-ui-l-row{flex-direction:row;flex-wrap:wrap;gap:8px}
.n-ui-empty{padding:14px 16px;border:1px dashed var(--n-line);border-radius:var(--n-radius);color:var(--n-muted);font-size:14px}
.n-ui-text>:first-child,.n-ui-md>:first-child{margin-top:0}
.n-ui-text>:last-child,.n-ui-md>:last-child{margin-bottom:0}
.n-ui-md{font-size:15px;line-height:1.6;overflow-wrap:anywhere}
.n-ui-md h2,.n-ui-md h3,.n-ui-md h4{margin:18px 0 6px;line-height:1.3}
.n-ui-md h2{font-size:19px}.n-ui-md h3{font-size:16.5px}.n-ui-md h4{font-size:15px}
.n-ui-md p{margin:0 0 10px}
.n-ui-md ul,.n-ui-md ol{margin:0 0 10px;padding-left:22px}
.n-ui-md li{margin:2px 0}
.n-ui-md blockquote{margin:0 0 10px;padding:2px 0 2px 14px;border-left:3px solid var(--n-line);color:var(--n-muted)}
.n-ui-md code{padding:1px 5px;border-radius:5px;background:var(--n-soft);font-size:.9em}
.n-ui-md pre{overflow-x:auto;padding:10px 12px;border-radius:10px;background:var(--n-soft)}
.n-ui-md pre code{padding:0;background:none}
.n-ui-md hr{border:0;border-top:1px solid var(--n-line);margin:16px 0}
.n-ui-scroll{overflow-x:auto;margin:0 0 10px}
.n-ui-md table,.n-ui-table table{width:100%;border-collapse:collapse;font-size:14px}
.n-ui-md th,.n-ui-md td,.n-ui-table th,.n-ui-table td{padding:8px 10px;border-bottom:1px solid var(--n-line);text-align:left;vertical-align:top}
.n-ui-md th,.n-ui-table th{color:var(--n-muted);font-weight:500;white-space:nowrap}
.n-ui-table{overflow-x:auto;border:1px solid var(--n-line);border-radius:var(--n-radius);background:var(--n-card)}
.n-ui-table tr:last-child td{border-bottom:0}
.n-ui-table td.n-ui-num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.n-ui-thumb{display:block;width:56px;height:56px;object-fit:cover;border-radius:8px;background:var(--n-soft);cursor:zoom-in}
.n-ui-list{margin:0;padding-left:20px;font-size:15px;line-height:1.55}
.n-ui-list li{margin:3px 0}
.n-ui-checklist{list-style:none;margin:0;padding:0;border:1px solid var(--n-line);border-radius:var(--n-radius);background:var(--n-card)}
.n-ui-checklist li{border-bottom:1px solid var(--n-line)}
.n-ui-checklist li:last-child{border-bottom:0}
.n-ui-checklist label{display:flex;gap:11px;align-items:flex-start;padding:11px 14px;cursor:pointer;font-size:15px;line-height:1.45}
.n-ui-checklist input{flex:none;width:18px;height:18px;margin:1px 0 0;accent-color:var(--n-accent);cursor:pointer}
.n-ui-checklist .n-ui-done span{color:var(--n-muted);text-decoration:line-through;text-decoration-color:var(--n-line)}
.n-ui-bars{display:grid;grid-template-columns:minmax(90px,32%) 1fr max-content;gap:10px 12px;align-items:center}
.n-ui-bar{display:contents;font-size:14px}
.n-ui-bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.n-ui-bar-track{height:10px;border-radius:999px;background:var(--n-soft);overflow:hidden}
.n-ui-bar-fill{display:block;height:100%;border-radius:999px;background:var(--n-accent)}
.n-ui-bar-value{color:var(--n-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.n-ui-answer{display:grid;gap:14px}
.n-ui-note{color:var(--n-muted);font-size:13px}
[data-event]{cursor:pointer}
[data-event][aria-busy=true]{opacity:.6;pointer-events:none}
.n-ui-err{padding:10px 12px;border:1px solid var(--n-err);border-radius:10px;color:var(--n-err);font-size:13px;white-space:pre-wrap}
`.trim();

/**
 * Draws a view and does what its events say. `cfg`: the view (def), its values (ctx: result, inputs, run, app,
 * last, view: what it keeps, answer: the answer's fields), what it may ask of the app (can), the app's words
 * (labels) and language (lang); `E`: the template engine. Runs after the bridge (and the app kit, on an app's own page).
 */
function uiKit(cfg: { n: string; def: any; ctx: any; can: string[]; labels: Record<string, string>; lang: string; css: string; start?: string; libs?: MediaKitApi['libs'] }, E: any, media?: (k: MediaKitApi) => void) {
  const P = window.parent;
  if (!P || P === window || !cfg?.def || !Array.isArray(cfg.def.pages)) return;
  const def = cfg.def;
  const can = new Set(Array.isArray(cfg.can) ? cfg.can : []);
  const L = (k: string, d: string): string => (typeof cfg.labels?.[k] === 'string' ? cfg.labels[k] : d);
  const isObj = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clone = (v: unknown) => JSON.parse(JSON.stringify(v ?? {}));
  let ctx: any = cfg.ctx ?? {};
  let state: Record<string, any> = isObj(ctx.view) ? clone(ctx.view) : {};
  const words = { yes: L('yes', 'Yes'), no: L('no', 'No') };

  // ---- talking to the app -----------------------------------------------------------------------------------------
  const send = (m: Record<string, unknown>) => P.postMessage({ ...m, n: cfg.n }, '*');
  const waits = new Map<number, [(v: any) => void, (e: Error) => void]>();
  let seq = 0;
  const call = (op: string, args: Record<string, unknown> = {}): Promise<any> =>
    new Promise((ok, fail) => {
      const id = ++seq;
      waits.set(id, [ok, fail]);
      try {
        send({ type: 'wa-ui', id, op, args });
      } catch (e) {
        waits.delete(id);
        fail(e as Error);
      }
    });

  // ---- the view's values ---------------------------------------------------------------------------------------------
  const pages = def.pages.filter((p: any) => (p.on ?? 'run') === (ctx.on === 'app' ? 'app' : 'run'));
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  // Records the app keeps, as blocks and templates ask for them: by what was asked, until they change.
  const records = new Map<string, any>();
  const loading = new Set<string>();
  const want = (collection: string, q: Record<string, unknown> = {}): any[] | null => {
    const key = JSON.stringify([collection, q]);
    if (records.has(key)) return records.get(key).records ?? [];
    if (!loading.has(key)) {
      loading.add(key);
      call('find', { collection, ...q }).then(
        (r) => {
          loading.delete(key);
          records.set(key, r ?? { records: [] });
          draw();
        },
        () => {
          loading.delete(key);
          records.set(key, { records: [] });
          draw();
        },
      );
    }
    return null;
  };
  // {{data.items}} in a template: the list's records (the first 200, oldest first).
  const dataRoot = new Proxy({} as Record<string, unknown>, {
    has: (_t, k) => typeof k === 'string' && /^[A-Za-z]\w*$/.test(k),
    get: (_t, k) => (typeof k === 'string' && /^[A-Za-z]\w*$/.test(k) ? (want(k, { limit: 200 }) ?? []) : undefined),
    getOwnPropertyDescriptor: (_t, k) => (typeof k === 'string' && /^[A-Za-z]\w*$/.test(k) ? { configurable: true, enumerable: true, value: want(k, { limit: 200 }) ?? [] } : undefined),
  });
  let page = '';
  let pageItem: unknown = null;
  // The key of the item a page was opened with: its element there takes it as its own (@key), so what is kept for it is the same on both pages.
  let pageKey = '';
  const history: { page: string; item: unknown; key: string }[] = [];
  const rootNow = (event: Record<string, unknown> = {}) => ({
    result: ctx.result ?? {},
    inputs: ctx.inputs ?? {},
    run: ctx.run ?? {},
    app: ctx.app ?? {},
    last: ctx.last ?? {},
    state,
    page: { id: page, item: pageItem, key: pageKey },
    data: dataRoot,
    event,
    today: today(),
    now: new Date().toISOString().slice(0, 16).replace('T', ' '),
  });
  const scope = (stack: any[] = [], event: Record<string, unknown> = {}) => ({ root: rootNow(event), stack, lang: cfg.lang || 'en', words });
  const shown = (p: any) => p.tab !== false && (!p.if || E.test(p.if, scope()));
  const firstPage = () => (pages.find((p: any) => p.id === cfg.start && shown(p)) ?? pages.find(shown) ?? pages[0])?.id ?? '';

  // ---- drawing -----------------------------------------------------------------------------------------------------
  const esc = E.esc;
  const label = (k: string) => String(k).replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
  /** Each element drawn, by its number in the page: what it was filled with, its key, the values around it. */
  let scopes: { stack: any[]; key: string }[] = [];
  const answerField = (path: string) => {
    const m = /^result\.([A-Za-z_]\w*)$/.exec(path || '');
    return m ? (ctx.answer ?? []).find((f: any) => f.id === m[1]) : null;
  };
  /** Items as a block draws them: matched, put in order, cut short; each with its key in the list as it came. */
  const itemsOf = (v: unknown, b: any, s: any): { x: unknown; key: string }[] => {
    let list = (Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v]).map((x, i) => ({ x, key: E.keyOf(x, i) }));
    if (isObj(b.where) && !/^data\./.test(b.data || '')) {
      for (const [f, w0] of Object.entries(b.where)) {
        const w = E.valueOf(w0, s);
        if (w === '' || w === null || w === undefined) continue;
        list = list.filter(({ x }) => {
          const got = isObj(x) ? x[f] : x;
          if (isObj(w)) {
            const [op, arg] = Object.entries(w)[0] ?? [];
            const a = E.valueOf(arg, s);
            if (a === '' || a === null || a === undefined) return true;
            if (op === '!=') return !E.same(got, a);
            if (op === 'contains') return E.show(got, s).toLowerCase().includes(E.show(a, s).toLowerCase());
            if (got === null || got === undefined || got === '') return false;
            const c = E.order(got, a);
            return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : op === '>=' ? c >= 0 : c === 0;
          }
          return Array.isArray(got) ? got.some((g) => E.same(g, w)) : E.same(got, w);
        });
      }
    }
    if (b.sort && !/^data\./.test(b.data || '')) {
      const desc = String(b.sort).startsWith('-');
      const f = String(b.sort).replace(/^-/, '');
      list.sort((p, q) => (desc ? -1 : 1) * E.order(isObj(p.x) ? p.x[f] : p.x, isObj(q.x) ? q.x[f] : q.x));
    }
    if (b.limit) list = list.slice(0, b.limit);
    return list;
  };
  const tick = (path: string) => `ticks.${String(path || 'list').replace(/[^\w-]+/g, '-').slice(0, 60)}`;
  // ---- pictures, videos and sounds ---------------------------------------------------------------------------------
  /**
   * An address as the view shows it: one of the app's own files by its name (asset:cover.jpg), a copy the app keeps
   * (/app-media/…), the web, or a picture written out (data:image/…); '' for anything else (a path on this computer).
   */
  const mediaUrl = (src: unknown): string => {
    const v = String(src ?? '').trim();
    if (v.startsWith('asset:')) {
      const name = v.slice(6);
      const a = isObj(ctx.assets) ? ctx.assets[name] : null;
      return isObj(a) && /^[a-f0-9]{40}$/.test(String(a.sha)) ? `/app-media/${a.sha}/${encodeURIComponent(name)}` : '';
    }
    if (/^https?:\/\/[^\s"'<>]+$/i.test(v) || /^\/app-media\/[a-f0-9]{40}\/[^\s"'<>/?#]+$/.test(v) || /^data:image\/(png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/i.test(v)) return v;
    return '';
  };
  /** A YouTube or Vimeo address as its player's, or ''. */
  const embedOf = (src: string): string => {
    let u: URL;
    try {
      u = new URL(src);
    } catch {
      return '';
    }
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = u.searchParams.get('v') ?? (/^\/(?:embed|shorts|live)\/([\w-]{6,20})/.exec(u.pathname)?.[1] ?? '');
    if (id && /^[\w-]{6,20}$/.test(id)) {
      const t = Number((u.searchParams.get('t') ?? u.searchParams.get('start') ?? '0').replace(/s$/, ''));
      return `https://www.youtube-nocookie.com/embed/${id}${t > 0 ? `?start=${Math.floor(t)}` : ''}`;
    }
    const vm = host === 'vimeo.com' ? /^\/(\d{4,12})/.exec(u.pathname)?.[1] : host === 'player.vimeo.com' ? /^\/video\/(\d{4,12})/.exec(u.pathname)?.[1] : undefined;
    return vm ? `https://player.vimeo.com/video/${vm}` : '';
  };
  const KIND: Record<string, RegExp> = { image: /\.(png|jpe?g|gif|webp|avif|svg|bmp)(?:$|[?#])/i, video: /\.(mp4|m4v|webm|mov|ogv)(?:$|[?#])/i, audio: /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba)(?:$|[?#])/i };
  const kindOf = (x: any): string => (['image', 'video', 'audio', 'file'].includes(x.kind) ? x.kind : /^data:image\//i.test(x.src) ? 'image' : embedOf(x.src) ? 'video' : (Object.keys(KIND).find((k) => KIND[k].test(x.src)) ?? 'file'));
  /** What fills a picture, video or sound: addresses, items with a caption, or rows with the field named in with.src. */
  const mediaItems = (v: unknown, w: Record<string, any>): { src: string; caption: string; kind?: string; poster?: string; name?: string }[] => {
    const list = Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v];
    return list
      .map((x: any) => {
        if (typeof x === 'string') return { src: x, caption: '' };
        if (!isObj(x)) return { src: '', caption: '' };
        const src = typeof w.src === 'string' ? x[w.src] : (x.src ?? x.url ?? x.image ?? x.photo ?? x.picture ?? x.video ?? x.audio ?? x.file);
        const cap = typeof w.caption === 'string' ? x[w.caption] : (x.caption ?? x.title ?? x.alt);
        return { src: String(src ?? ''), caption: cap === null || cap === undefined ? '' : E.show(cap, { root: {}, stack: [] }), kind: x.kind, poster: typeof x.poster === 'string' ? x.poster : undefined, name: typeof x.name === 'string' ? x.name : undefined };
      })
      .filter((x) => x.src);
  };
  const cssLen = (h: unknown, d = '') => (typeof h === 'number' && h > 0 && h < 4000 ? `${h}px` : typeof h === 'string' && /^\d{1,4}(\.\d+)?(px|vh|em|rem|%)$/.test(h) ? h : d);
  const images = (items: { src: string; caption: string }[], w: Record<string, any>) => {
    const ok = items.map((x) => ({ ...x, url: mediaUrl(x.src) })).filter((x) => x.url);
    if (!ok.length) return '';
    const cols = typeof w.columns === 'number' ? Math.max(1, Math.min(6, Math.round(w.columns))) : ok.length === 1 ? 1 : 0;
    const style = [cols ? `--n-cols:${cols}` : '', cssLen(w.height) ? `--n-h:${cssLen(w.height)}` : ok.length > 1 && !cols ? '--n-h:180px' : '', w.fit === 'contain' ? '--n-fit:contain' : ''].filter(Boolean).join(';');
    return `<div class="n-ui-images${cols ? '' : ' n-ui-auto'}"${style ? ` style="${esc(style)}"` : ''}>${ok.map((x) => `<figure class="n-ui-fig"><img src="${esc(x.url)}" alt="${esc(x.caption)}" loading="lazy" data-n-zoom>${x.caption ? `<figcaption>${esc(x.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`;
  };
  const videos = (items: { src: string; caption: string; poster?: string }[], w: Record<string, any>) =>
    items
      .map((x) => {
        const embed = embedOf(x.src);
        const url = embed ? '' : mediaUrl(x.src);
        if (!embed && !url) return '';
        const poster = x.poster ? mediaUrl(x.poster) : typeof w.poster === 'string' ? mediaUrl(w.poster) : '';
        const player = embed ? `<n-embed src="${esc(embed)}" title="${esc(x.caption || 'Video')}"></n-embed>` : `<video controls playsinline preload="metadata" src="${esc(url)}"${poster ? ` poster="${esc(poster)}"` : ''}></video>`;
        return `<div class="n-ui-video">${player}${x.caption ? `<div class="n-ui-cap">${esc(x.caption)}</div>` : ''}</div>`;
      })
      .join('');
  const sounds = (items: { src: string; caption: string }[]) =>
    items
      .map((x) => {
        const url = mediaUrl(x.src);
        return url ? `<div class="n-ui-audio">${x.caption ? `<div class="n-ui-cap">${esc(x.caption)}</div>` : ''}<audio controls preload="metadata" src="${esc(url)}"></audio></div>` : '';
      })
      .join('');
  const fileLinks = (items: { src: string; caption: string; name?: string }[]) =>
    items
      .map((x) => {
        const url = mediaUrl(x.src);
        const label = x.caption || x.name || decodeURIComponent(url.split('/').pop() ?? '') || url;
        return url ? `<a class="n-ui-file" href="${esc(url)}" target="_blank" rel="noopener noreferrer" download><span aria-hidden="true">↓</span> <span>${esc(label)}</span></a>` : '';
      })
      .join(' ');
  /** A mix of files (a media answer): pictures together, then videos, sounds and other files. */
  const mediaMix = (v: unknown, w: Record<string, any> = {}) => {
    const items = mediaItems(v, w);
    const of = (k: string) => items.filter((x) => kindOf(x) === k);
    return [images(of('image'), w), videos(of('video'), w), sounds(of('audio')), of('file').length ? `<div>${fileLinks(of('file'))}</div>` : ''].filter(Boolean).join('');
  };
  /** A part drawn by a script (a map, a plot, a widget): what fills it, and its settings, in one attribute. */
  const scripted = (tag: string, v: unknown, w: Record<string, any>, extra = '') => `<${tag}${extra} data-n-v="${esc(JSON.stringify({ v: v === undefined ? null : v, w }))}"></${tag}>`;
  /** A built-in element, filled with v. */
  const builtIn = (name: string, v: unknown, b: any, s: any): string => {
    const w = isObj(b.with) ? b.with : {};
    const rows = (Array.isArray(v) ? v : []) as any[];
    switch (name) {
      case 'markdown':
        return `<div class="n-ui-md">${E.md(typeof v === 'string' ? v : E.asText(v, s))}</div>`;
      case 'list': {
        const items = Array.isArray(v) ? v : E.evaluate('.|split', { ...s, stack: [{ v }] });
        return items.length ? `<ul class="n-ui-list">${items.map((x: unknown) => `<li>${esc(E.show(isObj(x) ? (w.label ? x[w.label as string] : Object.values(x)[0]) : x, s))}</li>`).join('')}</ul>` : '';
      }
      case 'checklist': {
        const items = Array.isArray(v) ? v : E.evaluate('.|split', { ...s, stack: [{ v }] });
        const base = tick(b.data);
        return items.length
          ? `<ul class="n-ui-checklist">${items
              .map((x: unknown, i: number) => {
                const key = String(E.keyOf(x, i)).replace(/[^\w-]+/g, '-');
                const done = E.given(E.lookup(`state.${base}.${key}`, s).value);
                const text = E.show(isObj(x) ? (w.label ? x[w.label as string] : Object.values(x)[0]) : x, s);
                return `<li${done ? ' class="n-ui-done"' : ''}><label><input type="checkbox" data-event="@tick" data-name="${esc(`${base}.${key}`)}"${done ? ' checked' : ''}><span>${esc(text)}</span></label></li>`;
              })
              .join('')}</ul>`
          : '';
      }
      case 'table': {
        if (!rows.length) return '';
        const f = answerField(b.data);
        const named = Array.isArray(w.columns) ? (w.columns as unknown[]).map((c) => (isObj(c) ? { id: String(c.id), label: String(c.label ?? label(String(c.id))), type: c.type } : { id: String(c), label: label(String(c)) })) : null;
        const cols: any[] = named ?? (f?.columns?.length ? f.columns : [...new Set(rows.flatMap((r) => (isObj(r) ? Object.keys(r) : [])))].filter((k) => !['id', 'createdAt', 'updatedAt'].includes(k)).map((id) => ({ id, label: label(id) })));
        const cell = (c: any, x: unknown) => {
          const t = c.type ?? f?.columns?.find((y: any) => y.id === c.id)?.type;
          if (t === 'url' && typeof x === 'string' && /^https?:\/\//.test(x)) return `<a href="${esc(x)}" target="_blank" rel="noopener noreferrer">${esc(E.evaluate('.|host', { ...s, stack: [{ v: x }] }))}</a>`;
          if (t === 'date') return esc(E.evaluate('.|date', { ...s, stack: [{ v: x }] }));
          if (t === 'image') {
            const url = mediaUrl(x);
            return url ? `<img class="n-ui-thumb" src="${esc(url)}" alt="" loading="lazy" data-n-zoom>` : '';
          }
          return esc(E.show(x, s));
        };
        return `<div class="n-ui-table"><table><thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${cols.map((c) => `<td${c.type === 'number' ? ' class="n-ui-num"' : ''}>${cell(c, isObj(r) ? r[c.id] : r)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`;
      }
      case 'chart': {
        const list = rows.filter(isObj);
        if (!list.length) return '';
        const keys = Object.keys(list[0]);
        const lf = (w.label as string) || keys.find((k) => typeof list[0][k] === 'string') || keys[0];
        const vf = (w.value as string) || keys.find((k) => k !== lf && E.firstNum(list[0][k]) !== null) || keys[1];
        const vals = list.map((r) => Math.max(0, E.firstNum(r[vf]) ?? 0));
        const max = Math.max(...vals, 0) || 1;
        return `<div class="n-ui-bars">${list
          .map((r, i) => `<div class="n-ui-bar"><span class="n-ui-bar-label" title="${esc(E.show(r[lf], s))}">${esc(E.show(r[lf], s))}</span><span class="n-ui-bar-track"><span class="n-ui-bar-fill" style="width:${Math.round((vals[i] / max) * 1000) / 10}%"></span></span><span class="n-ui-bar-value">${esc(E.show(r[vf], s))}</span></div>`)
          .join('')}</div>`;
      }
      case 'answer': {
        const res = isObj(v) ? v : isObj(ctx.result) ? ctx.result : {};
        const fields: any[] = (ctx.answer ?? []).length ? ctx.answer : Object.keys(res).map((id) => ({ id, label: label(id), type: Array.isArray(res[id]) ? (isObj(res[id][0]) ? 'table' : 'list') : 'text' }));
        return `<div class="n-ui-answer">${fields
          .filter((x) => E.given(res[x.id]) || res[x.id] === 0)
          .map((x) => {
            const body =
              x.type === 'table'
                ? builtIn('table', res[x.id], { data: `result.${x.id}` }, s)
                : x.type === 'list'
                  ? builtIn('list', res[x.id], {}, s)
                  : x.type === 'markdown'
                    ? builtIn('markdown', res[x.id], {}, s)
                    : x.type === 'media'
                      ? mediaMix(res[x.id])
                      : `<div>${esc(E.show(res[x.id], s))}</div>`;
            return `<section><h3 class="n-ui-title">${esc(x.label)}</h3>${body}</section>`;
          })
          .join('')}</div>`;
      }
      // Each takes its own kind of file from what fills it (a mix of pictures and videos shows each in its place).
      case 'image':
        return images(mediaItems(v, w).filter((x) => !['video', 'audio'].includes(kindOf(x)) && (!x.kind || x.kind === 'image')), w);
      case 'video':
        return videos(mediaItems(v, w).filter((x) => kindOf(x) === 'video' || (!x.kind && kindOf(x) === 'file')), w);
      case 'audio':
        return sounds(mediaItems(v, w).filter((x) => kindOf(x) === 'audio' || (!x.kind && kindOf(x) === 'file')));
      case 'media':
        return mediaMix(v, w);
      case 'map':
        return scripted('n-map', v, w);
      case 'plot':
        return scripted('n-plot', v, w);
      case 'form':
      case 'runs':
      case 'chat': {
        if (!(window as any).hydor?.app) return `<p class="n-ui-note">${esc(L('ownPage', 'This shows on the app’s own page.'))}</p>`;
        const flow = typeof w.flow === 'string' ? w.flow : 'run';
        if (name === 'form') return `<n-form flow="${esc(flow)}"${w.submit ? ` submit="${esc(w.submit)}"` : ''}${w.keep ? ' keep' : ''}></n-form>`;
        if (name === 'runs') return `<n-runs flow="${esc(flow)}" limit="${esc(String(w.limit ?? 5))}"></n-runs>`;
        return `<n-chat${w.placeholder ? ` placeholder="${esc(w.placeholder)}"` : ''}></n-chat>`;
      }
      default:
        return '';
    }
  };
  const BUILT = new Set(['text', 'markdown', 'list', 'checklist', 'table', 'chart', 'answer', 'form', 'runs', 'chat', 'image', 'video', 'audio', 'map', 'plot']);
  /** One element: its template filled, in a box of its own that remembers what filled it. */
  const element = (b: any, stack: any[], key: string): string => {
    const s = scope(stack);
    let html = '';
    let name = 'block';
    try {
      if (b.html) html = E.render(b.html, s);
      else if (b.text) html = `<div class="n-ui-text n-ui-md">${E.md(E.fill(b.text, s))}</div>`;
      else if (b.element && isObj(def.widgets) && isObj(def.widgets[b.element])) {
        // One of the view's widgets: drawn by its own script, with what fills it and the block's settings.
        name = b.element;
        html = scripted('n-widget', stack.length ? stack[stack.length - 1].v : undefined, isObj(b.with) ? b.with : {}, ` name="${esc(b.element)}"`);
      } else if (b.element && !BUILT.has(b.element)) {
        name = b.element;
        const el = def.elements?.[b.element];
        const p = el ? E.parse(el.html) : null;
        html = !el ? `<div class="n-ui-err">${esc(`${L('noElement', 'No element')}: ${b.element}`)}</div>` : p.error ? `<div class="n-ui-err">${esc(`${b.element}: ${p.error}`)}</div>` : E.render(el.html, s);
      } else {
        name = b.element;
        html = builtIn(b.element, stack.length ? stack[stack.length - 1].v : undefined, b, s);
      }
    } catch (e) {
      html = `<div class="n-ui-err">${esc(String((e as Error)?.message ?? e))}</div>`;
    }
    const i = scopes.push({ stack, key }) - 1;
    return `<div class="n-el n-el-${esc(name)}" data-n-i="${i}">${html}</div>`;
  };
  const block = (b: any, j: number): string => {
    const s = scope();
    if (b.if && !E.test(b.if, s)) return '';
    let v: unknown;
    let waiting = false;
    const m = /^data\.([A-Za-z]\w*)$/.exec(b.data || '');
    if (m) {
      // Records the app keeps: found as the block asks, its where filled with the view's values (empty ones left out).
      const where: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(isObj(b.where) ? b.where : {})) {
        const y = E.valueOf(x, s);
        if (y !== '' && y !== null && y !== undefined) where[k] = y;
      }
      const got = want(m[1], { ...(Object.keys(where).length ? { where } : {}), ...(b.sort ? { sort: b.sort } : {}), limit: b.limit ?? 100 });
      waiting = got === null;
      v = got ?? [];
    } else if (b.data) v = E.evaluate(b.data, s);
    let body = '';
    if (waiting) body = `<div class="n-ui-note">${esc(L('loading', 'Loading…'))}</div>`;
    else if (b.each) {
      const items = itemsOf(v, b, s);
      const n = items.length;
      body = n
        ? `<div class="n-ui-each n-ui-l-${b.layout ?? 'list'}">${items.map(({ x, key }, k) => element(b, [{ v: x, item: true, meta: { index: k, number: k + 1, first: k === 0, last: k === n - 1, key, count: n } }], key)).join('')}</div>`
        : b.empty
          ? `<div class="n-ui-empty">${esc(E.fill(b.empty, s))}</div>`
          : '';
      if (!n && !b.empty) return '';
    } else {
      // A whole list into one element (a table, a chart…): matched, in order and cut short as the block says.
      if (Array.isArray(v) && !m && (b.where || b.sort || b.limit)) v = itemsOf(v, b, s).map((x) => x.x);
      const blank = b.data && !E.given(v) && v !== 0;
      if (blank && b.empty) body = `<div class="n-ui-empty">${esc(E.fill(b.empty, s))}</div>`;
      else if (blank && b.element && BUILT.has(b.element)) return '';
      else if (/^page\.item\b/.test(b.data || '') && pageKey) body = element(b, [{ v, item: true, meta: { index: 0, number: 1, first: true, last: true, key: pageKey, count: 1 } }], pageKey);
      else body = element(b, b.data ? [{ v, item: true }] : [], '');
    }
    const title = b.title ? `<h2 class="n-ui-title">${esc(E.fill(b.title, s))}</h2>` : '';
    return `<section class="n-ui-block n-ui-w-${esc(b.width ?? 'full')}" data-n-b="${j}">${title}${body}</section>`;
  };
  const viewHtml = (): string => {
    scopes = [];
    const tabs = pages.filter(shown);
    const p = pages.find((x: any) => x.id === page) ?? tabs[0] ?? pages[0];
    if (!p) return '';
    page = p.id;
    const nav =
      tabs.length > 1
        ? `<nav class="n-ui-tabs" role="tablist">${tabs.map((t: any) => `<button type="button" class="n-ui-tab" role="tab" data-n-page="${esc(t.id)}" aria-selected="${t.id === p.id || (p.tab === false && history.length && history[history.length - 1].page === t.id) ? 'true' : 'false'}">${esc(t.title)}</button>`).join('')}</nav>`
        : '';
    const back = p.tab === false ? `<button type="button" class="n-ui-back" data-n-back>← ${esc(history.length ? (pages.find((x: any) => x.id === history[history.length - 1].page)?.title ?? L('back', 'Back')) : L('back', 'Back'))}</button>` : '';
    return `${nav}${back}<div class="n-ui-blocks" data-n-pg="${esc(p.id)}">${p.blocks.map(block).join('')}</div>`;
  };

  // What a template may not do: run scripts, load frames, or point a link at a script. Its values are escaped
  // already; this holds for what an element writes itself, too.
  const clean = (root: DocumentFragment | Element) => {
    for (const el of root.querySelectorAll('script,iframe,object,embed,base,meta,link,frame,frameset')) el.remove();
    for (const el of root.querySelectorAll('*'))
      for (const a of [...el.attributes]) {
        const n = a.name.toLowerCase();
        if (n.startsWith('on') || n === 'srcdoc') el.removeAttribute(a.name);
        else if (['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'background'].includes(n)) {
          const v = a.value.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
          if (/^(javascript|vbscript):/.test(v) || (/^data:/.test(v) && !(n === 'src' && /^data:image\/(png|jpe?g|gif|webp|avif)/.test(v)))) el.removeAttribute(a.name);
          // One of the app's own files, by its name.
          else if (v.startsWith('asset:')) {
            const url = mediaUrl(a.value.trim());
            if (url) el.setAttribute(a.name, url);
            else el.removeAttribute(a.name);
          }
        }
      }
  };
  const sameAttrs = (a: Element, b: Element) => a.attributes.length === b.attributes.length && [...b.attributes].every((x) => a.getAttribute(x.name) === x.value);
  /** Makes `to` look like `from`, keeping the nodes they share (a field keeps its focus and what was typed). */
  const morph = (to: Element, from: Element) => {
    for (const a of [...to.attributes]) if (!from.hasAttribute(a.name)) to.removeAttribute(a.name);
    for (const a of [...from.attributes]) if (to.getAttribute(a.name) !== a.value) to.setAttribute(a.name, a.value);
    if (to instanceof HTMLInputElement && (to.type === 'checkbox' || to.type === 'radio')) to.checked = from.hasAttribute('checked');
    let t = to.firstChild;
    let f = from.firstChild;
    while (f) {
      const nextF: ChildNode | null = f.nextSibling;
      if (!t) to.appendChild(f.cloneNode(true));
      else if (t.nodeType === f.nodeType && (t.nodeType !== 1 || ((t as Element).tagName === (f as Element).tagName && (!(t as Element).tagName.includes('-') || sameAttrs(t as Element, f as Element))))) {
        // An App part (n-form, n-chat…) draws itself: with the same attributes, it stays as it is, with what it shows.
        if (t.nodeType === 1 && !(t as Element).tagName.includes('-')) morph(t as Element, f as Element);
        else if (t.nodeType !== 1 && t.nodeValue !== f.nodeValue) t.nodeValue = f.nodeValue;
        t = t.nextSibling;
      } else {
        const n = f.cloneNode(true);
        to.replaceChild(n, t);
        t = n.nextSibling;
      }
      f = nextF;
    }
    while (t) {
      const nextT: ChildNode | null = t.nextSibling;
      to.removeChild(t);
      t = nextT;
    }
  };
  // Where it draws: the page's #n-ui, once the page is there (this runs in its head, before its body).
  let box: HTMLElement = document.createElement('div');

  let drawing = 0;
  let ready = false;
  function draw() {
    if (drawing || !ready) return;
    drawing = requestAnimationFrame(() => {
      drawing = 0;
      const t = document.createElement('template');
      t.innerHTML = viewHtml();
      clean(t.content);
      const next = document.createElement('div');
      next.append(t.content);
      morph(box, Object.assign(next, { id: 'n-ui', className: 'n-ui' }));
    });
  }

  // ---- what a click does -----------------------------------------------------------------------------------------
  const toast = (text: string, error = false) => text && call('say', { text, error }).catch(() => {});
  const setAt = (name: string, value: unknown) => {
    const parts = name.split('.');
    let at: Record<string, any> = state;
    for (const k of parts.slice(0, -1)) {
      if (!isObj(at[k])) at[k] = {};
      at = at[k];
    }
    const last = parts[parts.length - 1];
    if (value === null || value === undefined || value === false || value === '') delete at[last];
    else at[last] = value;
  };
  /** A value's name in the view's state: @key as the item's key, {{values}} filled, only letters, digits, - and _ between its dots. */
  const nameOf = (n: string, s: any, key: string) =>
    E.fill(String(n).replace(/(^|[^{\s])@key\b/g, (_m: string, b: string) => `${b}${key}`), s)
      .split('.')
      .map((x: string) => x.trim().replace(/[^\w-]+/g, '-').slice(0, 60) || '_')
      .slice(0, 4)
      .join('.');
  const keep = (name: string, value: unknown) => {
    if (!can.has('keep')) return;
    call('keep', { name, value: value === false || value === '' || value === undefined ? null : value }).catch(() => {});
  };
  const go = (to: string, item: unknown, key: string) => {
    if (!pages.some((p: any) => p.id === to)) return;
    history.push({ page, item: pageItem, key: pageKey });
    if (history.length > 30) history.shift();
    page = to;
    pageItem = item ?? null;
    pageKey = item === null || item === undefined ? '' : key;
    draw();
    send({ type: 'wa-ui-top' });
  };
  // The runs a view started (run … as), by their ids: their names in its state, kept up to date.
  const started = new Map<string, string>();
  const ACTIVE = ['queued', 'starting', 'running', 'waiting'];
  const runState = (r: any) => ({ id: r.id, status: r.status, working: ACTIVE.includes(r.status), result: r.result ?? {}, reply: r.reply ?? '', error: r.error ?? '' });

  const copyText = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  };

  async function act(a: any, s: any, key: string): Promise<boolean> {
    const val = (v: unknown) => E.valueOf(v, s);
    switch (a.do) {
      case 'page':
        go(a.page, val(a.item), key);
        return true;
      case 'back': {
        const h = history.pop();
        if (h) {
          page = h.page;
          pageItem = h.item;
          pageKey = h.key;
        } else {
          page = firstPage();
          pageItem = null;
          pageKey = '';
        }
        draw();
        send({ type: 'wa-ui-top' });
        return true;
      }
      case 'set':
      case 'toggle': {
        const name = nameOf(a.name, s, key);
        const value = a.do === 'set' ? val(a.value) : !E.given(E.lookup(`state.${name}`, s).value);
        setAt(name, value);
        draw();
        if (a.keep) keep(name, value);
        return true;
      }
      case 'say':
        toast(E.fill(a.text, s));
        return true;
      case 'copy': {
        // Here, where the click was (the page around it has no focus then); else the page around it tries.
        const text = E.fill(a.text, s);
        if (await copyText(text)) toast(L('copied', 'Copied'));
        else await call('copy', { text });
        return true;
      }
      case 'open':
        await call('open', { url: E.fill(a.url, s) });
        return true;
      default: {
        if (!can.has(a.do)) {
          toast(L('cannot', 'This can’t be done here.'), true);
          return false;
        }
        if (a.do === 'ask') await call('ask', { text: E.fill(a.text, s) });
        else if (a.do === 'again') await call('again', { inputs: isObj(a.inputs) ? val(a.inputs) : {} });
        else if (a.do === 'start') await call('start', { app: E.fill(a.app, s), inputs: isObj(a.inputs) ? val(a.inputs) : {} });
        else if (a.do === 'data') {
          const out = { op: a.op, collection: a.collection, ...(a.record ? { record: val(a.record) } : {}), ...(a.id ? { id: E.fill(a.id, s) } : {}) };
          await call('data', out);
        } else if (a.do === 'run') {
          const name = a.as ? nameOf(a.as, s, key) : '';
          if (name) {
            setAt(name, { working: true, status: 'starting' });
            draw();
          }
          try {
            const r = await call('run', { flow: a.flow || 'run', inputs: isObj(a.inputs) ? val(a.inputs) : {} });
            if (name && r?.id) {
              started.set(r.id, name);
              setAt(name, runState(r));
              draw();
            }
          } catch (e) {
            if (name) {
              setAt(name, { working: false, status: 'failed', error: String((e as Error).message ?? e) });
              draw();
            }
            throw e;
          }
        }
        return true;
      }
    }
  }

  async function fire(name: string, el: Element, event: Record<string, unknown>) {
    const wrap = el.closest('[data-n-i]');
    const sc = wrap ? scopes[Number(wrap.getAttribute('data-n-i'))] : null;
    const key = el.closest('[data-key]')?.getAttribute('data-key') ?? sc?.key ?? '';
    const s = scope(sc ? sc.stack : [], event);
    if (name === '@tick') {
      const n = String(event.name ?? '');
      if (!/^[\w.-]{1,250}$/.test(n)) return;
      const value = !E.given(E.lookup(`state.${n}`, s).value);
      setAt(n, value);
      draw();
      keep(n, value);
      return;
    }
    const acts = def.events?.[name];
    if (!Array.isArray(acts)) return;
    // What waits for the app shows so on what was clicked; what happens here at once does not.
    if (acts.some((a: any) => !['page', 'back', 'set', 'toggle', 'say'].includes(a.do))) el.setAttribute('aria-busy', 'true');
    try {
      for (const a of acts) {
        if (a.confirm && !window.confirm(E.fill(a.confirm, s))) break;
        if (!(await act(a, s, key))) break;
      }
    } catch {
      // The app said what went wrong.
    } finally {
      el.removeAttribute('aria-busy');
    }
  }

  /** What an element says of itself when it sends its event: its data-… values, a field's value, a form's fields. */
  const valuesOf = (el: Element): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    // {{event.text}}: what it says on screen (in the app's language), for a question to ask first.
    if (!(el instanceof HTMLFormElement)) out.text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    for (const a of [...el.attributes]) if (a.name.startsWith('data-') && a.name !== 'data-event' && !a.name.startsWith('data-n-')) out[a.name.slice(5).replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())] = a.value;
    if (el instanceof HTMLInputElement) {
      out.value = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'checkbox') out.checked = el.checked;
    } else if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) out.value = el.value;
    if (el instanceof HTMLFormElement)
      new FormData(el).forEach((v, k) => {
        if (typeof v === 'string') out[k.slice(0, 60)] = v.slice(0, 4000);
      });
    return out;
  };
  const mine = (el: Element | null) => !!el && box.contains(el);
  document.addEventListener('click', (e) => {
    const t = e.target as Element | null;
    const tab = t?.closest?.('[data-n-page]');
    if (tab && mine(tab)) {
      const to = tab.getAttribute('data-n-page')!;
      history.length = 0;
      page = to;
      pageItem = null;
      pageKey = '';
      return void draw();
    }
    const back = t?.closest?.('[data-n-back]');
    if (back && mine(back)) return void act({ do: 'back' }, scope(), '');
    // A picture opens large, with the others beside it.
    const zoom = t?.closest?.('img[data-n-zoom]') as HTMLImageElement | null;
    if (zoom && mine(zoom) && !zoom.closest('[data-event]')) {
      const group = zoom.closest('.n-ui-images,.n-ui-table') ?? zoom.parentElement;
      const all = [...(group?.querySelectorAll('img[data-n-zoom]') ?? [zoom])] as HTMLImageElement[];
      e.preventDefault();
      return void call('media', { images: all.map((x) => ({ src: x.currentSrc || x.src, name: x.alt })), at: Math.max(0, all.indexOf(zoom)) }).catch(() => {});
    }
    const el = t?.closest?.('[data-event]');
    if (!el || !mine(el)) return;
    if (el.tagName === 'FORM' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['button', 'submit', 'image'].includes((el as HTMLInputElement).type))) return;
    e.preventDefault();
    void fire(el.getAttribute('data-event')!, el, valuesOf(el));
  });
  // A field sends its event when it changes; a search box (or a field with data-live) as it is typed in, a moment after.
  const live = (el: Element) => el.matches('input[type=search],[data-live]');
  document.addEventListener('change', (e) => {
    const el = e.target as Element | null;
    if (!el || !mine(el) || !el.matches('input[data-event],select[data-event],textarea[data-event]') || live(el)) return;
    if (el.tagName === 'INPUT' && ['button', 'submit', 'image'].includes((el as HTMLInputElement).type)) return;
    void fire(el.getAttribute('data-event')!, el, valuesOf(el));
  });
  let typing: any = 0;
  document.addEventListener('input', (e) => {
    const el = e.target as Element | null;
    if (!el || !mine(el) || !el.matches('input[data-event],textarea[data-event]') || !live(el)) return;
    clearTimeout(typing);
    typing = setTimeout(() => void fire(el.getAttribute('data-event')!, el, valuesOf(el)), 250);
  });
  document.addEventListener(
    'submit',
    (e) => {
      const f = e.target as HTMLFormElement | null;
      if (!f || !mine(f) || !f.matches('form[data-event]')) return;
      e.preventDefault();
      void fire(f.getAttribute('data-event')!, f, valuesOf(f));
    },
    true,
  );
  // Choices that are not buttons or links can be reached and used from the keyboard too.
  document.addEventListener('keydown', (e) => {
    const t = e.target as Element | null;
    if ((e.key === 'Enter' || e.key === ' ') && t && mine(t) && t.matches('[data-event]:not(button):not(a):not(input):not(select):not(textarea):not(form)')) {
      e.preventDefault();
      void fire(t.getAttribute('data-event')!, t, valuesOf(t));
    }
  });
  // ---- news from the app ---------------------------------------------------------------------------------------------
  addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== P || !d || typeof d !== 'object') return;
    if (d.type === 'wa-ui-reply' && waits.has(d.id)) {
      const [ok, fail] = waits.get(d.id)!;
      waits.delete(d.id);
      if (typeof d.error === 'string') fail(new Error(d.error));
      else ok(d.value ?? null);
      return;
    }
    if (d.n !== cfg.n) return;
    if (d.type === 'wa-ui-ctx' && isObj(d.ctx)) {
      ctx = { ...d.ctx, on: ctx.on };
      draw();
    } else if (d.type === 'wa-ui-data') {
      for (const k of [...records.keys()]) if (JSON.parse(k)[0] === d.collection) records.delete(k);
      draw();
    } else if (d.type === 'wa-ui-run' && isObj(d.run) && started.has(d.run.id)) {
      setAt(started.get(d.run.id)!, runState(d.run));
      draw();
    }
  });

  const start = () => {
    let el = document.getElementById('n-ui');
    if (!el) {
      el = document.createElement('div');
      el.id = 'n-ui';
      (document.body ?? document.documentElement).appendChild(el);
    }
    el.classList.add('n-ui');
    box = el;
    // The elements' own style: each element's rules inside it (& is the element), then the view's.
    const style = document.createElement('style');
    style.id = 'n-ui-style';
    style.textContent = `${cfg.css || ''}\n${Object.entries(def.elements ?? {})
      .map(([k, e]: [string, any]) => (e?.css ? `.n-el-${k}{${String(e.css).replace(/<\/?style/gi, '')}}` : ''))
      .join('\n')}\n${Object.entries(isObj(def.widgets) ? def.widgets : {})
      .map(([k, e]: [string, any]) => (e?.css ? `.n-widget-${k}{${String(e.css).replace(/<\/?style/gi, '')}}` : ''))
      .join('\n')}\n${String(def.style ?? '').replace(/<\/?style/gi, '')}`;
    document.head.appendChild(style);
    // Maps, plots, videos from YouTube or Vimeo, and the view's own widgets.
    if (typeof media === 'function' && cfg.libs)
      media({ libs: cfg.libs, esc, L, url: mediaUrl, fire: (n, el, ev) => void fire(n, el, ev), play: (src, title) => void call('media', { video: src, title }).catch(() => {}), setAt, draw, state: () => state, lang: cfg.lang || 'en', widgets: isObj(def.widgets) ? def.widgets : {} });
    new MutationObserver(() => {
      for (const x of box.querySelectorAll('[data-event]:not(button):not(a):not(input):not(select):not(textarea):not(form):not([tabindex])')) {
        x.setAttribute('tabindex', '0');
        x.setAttribute('role', 'button');
      }
    }).observe(box, { childList: true, subtree: true });
    ready = true;
    page = firstPage();
    draw();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

export const UI_SRC = scriptSafe(uiKit.toString());
export const ENGINE_SRC = scriptSafe(uiEngine.toString());
export const UI_KIT_CSS = `${UI_CSS}\n${MEDIA_CSS}`.replace(/\n/g, '');
