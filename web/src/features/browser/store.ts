// A session's browser as the pages know it: its state from the server's news, the latest frame of its
// live view and what the agent's pointer does in it, and the user's input on its way to the page while
// they drive.
import { create } from 'zustand';
import type { BrowserEvent, BrowserInput, BrowserView, ChromeDownload, SessionBrowserOptions } from '@shared/browser';
import type { AgentPointer } from '@shared/pointer';
import { api, enc, post } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { toastError } from '../../lib/store';

export const useBrowser = create<{
  views: Record<string, BrowserView>;
  options: Record<string, SessionBrowserOptions>;
  download: ChromeDownload | null;
}>(() => ({ views: {}, options: {}, download: null }));

/** The latest frame of each browser, by key (kept outside React: frames come several times a second). */
export const frames = new Map<string, { data: string; w: number; h: number; tab: string }>();
type FrameFn = (f: { data: string; w: number; h: number; tab: string }) => void;
const frameFns = new Map<string, Set<FrameFn>>();

export function onFrame(key: string, fn: FrameFn): () => void {
  let set = frameFns.get(key);
  if (!set) frameFns.set(key, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

/** What the agent's pointer does, as it happens, by key (outside React too: each view animates it itself). */
type PointerFn = (p: AgentPointer) => void;
const pointerFns = new Map<string, Set<PointerFn>>();

export function onPointer(key: string, fn: PointerFn): () => void {
  let set = pointerFns.get(key);
  if (!set) pointerFns.set(key, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

let listening = false;
/** Hears the server's browser news, once for the whole app. */
export function listenBrowser() {
  if (listening) return;
  listening = true;
  onFeatureEvent('browser', (e) => {
    const d = e.data as BrowserEvent;
    if (d.type === 'download') return useBrowser.setState({ download: d.download });
    if (!e.key) return;
    const key = e.key;
    if (d.type === 'state') {
      useBrowser.setState((s) => ({ views: { ...s.views, [key]: d.view } }));
      if (!d.view.open) frames.delete(key);
    } else if (d.type === 'frame') {
      const f = { data: d.data, w: d.w, h: d.h, tab: d.tab };
      frames.set(key, f);
      for (const fn of frameFns.get(key) ?? []) fn(f);
    } else if (d.type === 'pointer') {
      for (const fn of pointerFns.get(key) ?? []) fn(d.pointer);
    }
  });
}

export const bpath = (key: string, rest = '') => `/api/browser/sessions/${enc(key)}${rest}`;

export async function loadBrowser(key: string) {
  try {
    const r = await api<{ view: BrowserView; options: SessionBrowserOptions }>(bpath(key));
    useBrowser.setState((s) => ({ views: { ...s.views, [key]: r.view }, options: { ...s.options, [key]: r.options } }));
  } catch {}
}

/** Calls the browser's API for a session and takes the new state it answers with. */
export async function browserCall(key: string, rest: string, body: unknown = {}): Promise<BrowserView | null> {
  try {
    const r = await post<{ view?: BrowserView }>(bpath(key, rest), body);
    if (r.view) useBrowser.setState((s) => ({ views: { ...s.views, [key]: r.view! } }));
    return r.view ?? null;
  } catch (e) {
    toastError(e);
    return null;
  }
}

/** The user's input, sent in order: moves merge, wheel turns add up, one request at a time. */
export class InputRelay {
  private queue: BrowserInput[] = [];
  private busy = false;
  constructor(private key: string) {}

  push(e: BrowserInput) {
    const last = this.queue[this.queue.length - 1];
    if (e.t === 'mouse' && e.type === 'move' && last?.t === 'mouse' && last.type === 'move') this.queue[this.queue.length - 1] = e;
    else if (e.t === 'wheel' && last?.t === 'wheel') {
      last.dx += e.dx;
      last.dy += e.dy;
    } else this.queue.push(e);
    void this.flush();
  }

  private async flush() {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const batch = this.queue.splice(0, 100);
    try {
      await post(bpath(this.key, '/input'), { events: batch });
    } catch {
      // Taken back meanwhile, or the browser closed: what was typed is dropped.
      this.queue = [];
    } finally {
      this.busy = false;
      if (this.queue.length) void this.flush();
    }
  }
}

export const hostOf = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === 'about:' ? '' : u.host.replace(/^www\./, '');
  } catch {
    return '';
  }
};
