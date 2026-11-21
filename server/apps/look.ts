// Pictures of a run's answer in its app's view, for the agent that builds the app to look at what it designed
// (app_try with look): on a computer in the dark and in the light, and on a phone in the dark. The view is drawn
// as a run's page draws it, by the document every page renders in (/htmlframe's, from pages/kit.ts), in a frame of
// a small page the capture browser opens at an address of no site, in a fresh context with no sign-in: the page
// hands the frame the view and the run's values, as the app's pages do by message, and answers what the view asks
// of its app with nothing (no session, no records). The app's own files show from this server's /app-media/,
// which needs no sign-in either; nothing else on this computer or its network is reached.
import { libsHead } from '../../shared/app-media.ts';
import { pagesFor } from '../../shared/app-ui.ts';
import { captureJpeg } from '../browser/jpeg.ts';
import { canCapture, withTab } from '../capture/index.ts';
import { config } from '../config.ts';
import { frameHtml, scriptSafe } from '../pages/kit.ts';
import type { RunRecord } from './store.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const js = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

/** The page the view's kit draws in, as a run's page has it, with this server as the base its files show from. */
const shell = (title: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><base href="http://127.0.0.1:${config.port}/"><style>body.n-page{padding:0 0 4px}</style></head><body class="n-page" data-n-fit><div id="n-ui" class="n-ui"></div></body></html>`;

/** The holder page's script (it runs in the capture browser: only its argument and the browser's globals). */
function holderScript(cfg: { html: string; theme: string; ui: unknown }) {
  const f = document.getElementById('v') as HTMLIFrameElement;
  addEventListener('message', (e) => {
    const w = f.contentWindow;
    const d = e.data;
    if (!w || e.source !== w || !d || typeof d !== 'object') return;
    const reply = (type: string, m: Record<string, unknown>) => w.postMessage({ type, id: d.id, ...m }, '*');
    if (d.type === 'wa-html-ready') {
      const n = Math.random().toString(36).slice(2);
      w.postMessage({ type: 'wa-html-page', html: cfg.html, n, theme: cfg.theme, css: '', max: { key: 200, value: 524288 }, fill: false, play: false, open: false, ui: cfg.ui }, '*');
    } else if (d.type === 'wa-html-size' && typeof d.h === 'number') f.style.height = `${Math.min(Math.max(d.h, 40), 6000)}px`;
    // What the view asks of its app reaches nothing from a picture: a search finds no records.
    else if (d.type === 'wa-ui' && Number.isInteger(d.id)) reply('wa-ui-reply', d.op === 'find' ? { value: { records: [], count: 0 } } : { error: 'Not here' });
    else if (d.type === 'wa-store' && Number.isInteger(d.id)) reply('wa-store-reply', { value: null });
  });
}

/** The small page around the frame: it posts the view to the frame once it is ready, and grows with what it draws. */
function holder(o: { html: string; theme: 'dark' | 'light'; ui: unknown }) {
  const bg = o.theme === 'dark' ? '#151412' : '#ffffff';
  const script = `(${scriptSafe(holderScript.toString())})(${js({ html: o.html, theme: o.theme, ui: o.ui })})`;
  // Not sandboxed, unlike in the app: a sandboxed frame gets a process of its own, which the capture browser paints
  // only as far as the first window reached. Here that guards nothing: the page around it is of no site, and signed in nowhere.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;background:${bg}}main{padding:20px 16px 28px}iframe{display:block;width:100%;height:320px;border:0}</style></head><body><main><iframe id="v" srcdoc="${esc(frameHtml())}"></iframe></main><script>${script}</script></body></html>`;
}

/** The view and the values a run's page gives it (web/src/features/apps/View.tsx), with nothing it may ask of the app. */
function uiOf(r: RunRecord) {
  const ui = r.recipe.ui!;
  const ctx = {
    on: 'run',
    result: r.result ?? {},
    inputs: r.inputs ?? {},
    run: { id: r.id, status: r.status, source: r.source, createdAt: r.createdAt, endedAt: r.endedAt ?? null, costUsd: r.costUsd ?? null, error: r.error ?? '' },
    app: { name: r.recipe.name, description: r.recipe.description ?? '', id: r.app },
    last: {},
    view: {},
    answer: r.recipe.answer,
    assets: r.recipe.assets ?? {},
  };
  return { def: ui, ctx, can: [], labels: {}, lang: 'en', ...(ui.libs ? { libs: libsHead(ui.libs) } : {}) };
}

/** The tallest picture, in CSS pixels. */
const MAX_HEIGHT = 3000;

/** One picture of the holder page, as tall as what it shows (up to MAX_HEIGHT): the window is made that tall first. */
function shot(html: string, l: (typeof LOOKS)[number]): Promise<Buffer> {
  // The view's own code runs here, on this computer: it may reach the web (its libraries, a map's tiles), but nothing on
  // this machine or its network beyond the app's own files.
  const own = `http://127.0.0.1:${config.port}/app-media/`;
  return withTab({ html, width: l.width, height: l.height, scale: l.scale, mobile: l.mobile, settleMs: 2500, colorScheme: l.theme, blockPrivate: true, allowPrivate: [own] }, async ({ s, evaluate }) => {
    const h = Number(await evaluate<number>('Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)')) || l.height;
    const height = Math.min(Math.max(h, l.height), MAX_HEIGHT);
    if (height !== l.height) {
      await s.send('Emulation.setDeviceMetricsOverride', { width: l.width, height, deviceScaleFactor: l.scale, mobile: l.mobile });
      await new Promise((r) => setTimeout(r, 400));
    }
    const scale = l.out ? l.out / (l.width * l.scale) : 1;
    return Buffer.from(await captureJpeg(s, { clip: { x: 0, y: 0, width: l.width, height, scale } }, 72), 'base64');
  });
}

/** The three ways it is looked at: what each is called, its window, and its colours. */
const LOOKS = [
  { label: 'a computer, dark', theme: 'dark', width: 1100, height: 800, scale: 1, mobile: false, out: undefined },
  { label: 'a computer, light', theme: 'light', width: 1100, height: 800, scale: 1, mobile: false, out: undefined },
  { label: 'a phone, dark', theme: 'dark', width: 390, height: 844, scale: 2, mobile: true, out: 520 },
] as const;

export interface Looked {
  text: string;
  images: { data: string; mimeType: string }[];
}

/**
 * Pictures of a finished run's answer in its view, as a person sees it on its page; or a line that says why there
 * are none (no view, no answer, no capture browser here). `can`: whether this server can take pictures (tests say no).
 */
export async function lookAtRun(r: RunRecord, can: () => boolean = canCapture): Promise<Looked> {
  const ui = r.recipe.ui;
  if (r.status !== 'done' || !r.result) return { text: `No pictures: run ${r.id} did not finish with an answer.`, images: [] };
  if (!ui || !pagesFor(ui, 'run').length) return { text: 'No pictures: it has no view of its own, so its answer shows as its fields and cards, which the app draws itself and need no look (a view, ui, is only for what no card draws).', images: [] };
  if (!can()) return { text: 'No pictures: this computer has no browser to draw them with (the user can download one in Settings → Browser). Open the run’s page to see it, or ask the user how it looks.', images: [] };
  const html = shell(r.recipe.name);
  const view = uiOf(r);
  const images: Looked['images'] = [];
  const said: string[] = [];
  for (const l of LOOKS) {
    try {
      // Its plots, maps and widgets load their libraries from the web: the page settles for a moment first.
      const data = await shot(holder({ html, theme: l.theme, ui: view }), l);
      images.push({ data: data.toString('base64'), mimeType: 'image/jpeg' });
      said.push(l.label);
    } catch (e) {
      said.push(`${l.label}: could not be drawn (${(e as Error).message})`);
    }
  }
  const first = pagesFor(ui, 'run')[0];
  return {
    text: images.length
      ? `Pictures of run ${r.id}'s answer in its view, on its first page (“${first.title}”), as a person sees it: ${said.join('; ')}. Look for what reads badly or breaks (text cut off or overlapping, empty blocks, colours that vanish in the light or the dark, a phone layout that does not fit) and fix it with app_save.`
      : `No pictures of run ${r.id}: ${said.join('; ')}.`,
    images,
  };
}
