// The app's side of a page's frame (/htmlframe, sandboxed; the bridge inside is server/pages/kit.ts).
// It posts the page with a fresh number each time the frame is ready, and takes only messages from
// that frame, carrying that number, of a known shape and size: the page's height, a choice or a form
// to put in the message box, and calls of window.naget.storage, which a store answers.
import { useLayoutEffect, useRef } from 'react';
import { STORAGE_LIMITS } from '@shared/pages';
import { enc, post } from '../../lib/api';
import { cx } from '../../components/ui';

export interface StoreCall {
  op: 'get' | 'set' | 'remove' | 'keys';
  key?: string;
  value?: unknown;
}
export type Store = (c: StoreCall) => Promise<unknown>;

/** A page that is not saved: its storage lasts while it is on screen. */
export function memoryStore(): Store & { dump(): Record<string, unknown> } {
  const m = new Map<string, string>();
  const store = async (c: StoreCall) => {
    if (c.op === 'keys') return [...m.keys()];
    if (c.op === 'get') return m.has(c.key!) ? JSON.parse(m.get(c.key!)!) : null;
    if (c.op === 'remove') m.delete(c.key!);
    else {
      if (!m.has(c.key!) && m.size >= STORAGE_LIMITS.keys) throw new Error(`A page keeps at most ${STORAGE_LIMITS.keys} keys`);
      m.set(c.key!, JSON.stringify(c.value));
    }
    return null;
  };
  return Object.assign(store, { dump: () => Object.fromEntries([...m].map(([k, v]) => [k, JSON.parse(v)])) });
}

/** A saved page's storage, kept by the server. */
export const pageStore =
  (id: string): Store =>
  (c) =>
    post<{ value: unknown }>(`/api/pages/${enc(id)}/storage`, c).then((r) => r.value ?? null);

/** An older version on view: it reads the page's data, but what it changes is not kept. */
export function previewStore(id: string): Store {
  const real = pageStore(id);
  const mine = memoryStore();
  const gone = new Set<string>();
  return async (c) => {
    if (c.op === 'keys') {
      const keys = new Set([...((await real(c)) as string[]), ...((await mine(c)) as string[])]);
      return [...keys].filter((k) => !gone.has(k));
    }
    if (c.op === 'get') return gone.has(c.key!) ? null : (await mine({ op: 'keys' }) as string[]).includes(c.key!) ? mine(c) : real(c);
    if (c.op === 'remove') gone.add(c.key!);
    else gone.delete(c.key!);
    return mine(c);
  };
}

/** One line of text from a page: no control characters, no runs of spaces. */
const line = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** What a choice puts in the message box: "Chose: B", "Color: Blue, Green"; nothing once none is picked. */
export function pickText(name: string, values: string[]): string {
  const v = values.map(line).filter(Boolean);
  return v.length ? `${line(name) || 'Chose'}: ${v.join(', ')}` : '';
}

/** What a form puts there: its name, then a line per filled field (fields of one name together). */
export function formText(name: string, fields: [string, string][]): string {
  const by = new Map<string, string[]>();
  for (const [k, v] of fields) {
    const val = clip(v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim(), 500);
    if (val) by.set(line(k) || 'answer', [...(by.get(line(k) || 'answer') ?? []), val]);
  }
  const head = line(name) || 'Answers';
  return by.size ? `${head}:\n${[...by].map(([k, v]) => `- ${k}: ${v.join(', ')}`).join('\n')}` : `${head}: (nothing filled in)`;
}

const nonce = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const OPS = new Set(['get', 'set', 'remove', 'keys']);

export interface Pick {
  /** Which choice it is, so a later pick in the same group takes its place. */
  group: string;
  text: string;
}

/**
 * A page, rendered in the sandboxed frame. Give it a `key` that changes with the page: the frame takes
 * its page once, when it loads.
 */
export function PageFrame({
  html,
  store,
  onHeight,
  onPick,
  title = 'Page',
  className,
}: {
  html: string;
  store: Store;
  onHeight?: (h: number) => void;
  onPick?: (p: Pick) => void;
  title?: string;
  className?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const cb = useRef({ html, store, onHeight, onPick });
  cb.current = { html, store, onHeight, onPick };
  // Before the frame can load (it posts "ready" as soon as it does).
  useLayoutEffect(() => {
    let n = '';
    let busy = 0;
    let picks: number[] = [];
    const onMessage = (e: MessageEvent) => {
      const w = ref.current?.contentWindow;
      // Only this frame: a sandboxed page's origin is opaque ("null").
      if (!w || e.source !== w || e.origin !== 'null') return;
      const d = e.data;
      if (!d || typeof d !== 'object' || Array.isArray(d) || typeof d.type !== 'string') return;
      if (d.type === 'wa-html-ready') {
        n = nonce();
        const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        w.postMessage({ type: 'wa-html-page', html: cb.current.html, n, theme, max: { key: STORAGE_LIMITS.key, value: STORAGE_LIMITS.value } }, '*');
        return;
      }
      const { store, onHeight, onPick } = cb.current;
      // The height alone may come without the number (a frame from before the bridge had one).
      if (d.type === 'wa-html-size' && (d.n === n || d.n === undefined)) {
        if (typeof d.h === 'number' && Number.isFinite(d.h) && d.h >= 0) onHeight?.(Math.min(d.h, 100_000));
        return;
      }
      if (!n || d.n !== n) return;
      if (d.type === 'wa-pick' || d.type === 'wa-form') {
        // Ten a second at most: a page cannot fill the message box by itself.
        const now = Date.now();
        picks = picks.filter((t) => now - t < 1000);
        if (!onPick || picks.length >= 10) return;
        if (d.type === 'wa-pick') {
          if (!isStr(d.g, 120) || !isStr(d.name, 100) || !Array.isArray(d.values) || d.values.length > 20 || !d.values.every((v: unknown) => isStr(v, 200))) return;
          picks.push(now);
          onPick({ group: `pick:${d.g}`, text: pickText(d.name, d.values) });
        } else {
          if (!isStr(d.name, 100) || !Array.isArray(d.fields) || d.fields.length > 40) return;
          if (!d.fields.every((f: unknown) => Array.isArray(f) && f.length === 2 && isStr(f[0], 100) && isStr(f[1], 2000))) return;
          picks.push(now);
          onPick({ group: `form:${d.name}`, text: formText(d.name, d.fields) });
        }
      } else if (d.type === 'wa-store') {
        if (!Number.isInteger(d.id) || d.id < 1) return;
        const reply = (m: { value?: unknown; error?: string }) => w.postMessage({ type: 'wa-store-reply', id: d.id, ...m }, '*');
        if (!OPS.has(d.op) || (d.op !== 'keys' && (!isStr(d.key, STORAGE_LIMITS.key) || !d.key))) return reply({ error: 'Not a storage call' });
        if (d.op === 'set') {
          const json = JSON.stringify(d.value);
          if (json === undefined) return reply({ error: 'set needs a value' });
          if (json.length > STORAGE_LIMITS.value) return reply({ error: `That value is over ${STORAGE_LIMITS.value / 1024} KB` });
        }
        if (busy >= 16) return reply({ error: 'Too many storage calls at once' });
        busy++;
        store({ op: d.op, key: d.key, value: d.value })
          .then(
            (value) => reply({ value }),
            (err) => reply({ error: String((err as Error)?.message ?? err) }),
          )
          .finally(() => busy--);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return (
    <iframe
      ref={ref}
      src="/htmlframe"
      title={title}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals"
      className={cx('block h-full w-full border-0 bg-white', className)}
    />
  );
}
