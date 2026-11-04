// The live view of a browser: its screencast, and while the user drives, their mouse, touch, wheel and
// keys sent to the page. A phone's own keyboard types through a hidden field.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { BrowserView } from '@shared/browser';
import { MOD } from '@shared/browser';
import { cx, Throbber } from '../../components/ui';
import { browserCall, frames, InputRelay, onFrame } from './store';

export interface LiveViewApi {
  /** Opens the phone's keyboard (call it from a tap). */
  keyboard(): void;
  /** Presses a key, like "Enter" or "ArrowDown". */
  press(key: string): void;
}

const KEYCODES: Record<string, number> = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, PageUp: 33, PageDown: 34, ' ': 32 };
const mods = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => (e.altKey ? MOD.alt : 0) | (e.ctrlKey ? MOD.ctrl : 0) | (e.metaKey ? MOD.meta : 0) | (e.shiftKey ? MOD.shift : 0);
/** What the phone keyboard's field holds between keys, so a backspace on "nothing" still shows up. */
const BASE = '  ';

/** `maxH` caps its height (a CSS length): it keeps the page's shape within it. `plain`: no ring while the user drives (Preview, where they always do). */
export const LiveView = forwardRef<LiveViewApi, { k: string; view: BrowserView; driving: boolean; small?: boolean; plain?: boolean; className?: string; maxH?: string }>(function LiveView({ k, view, driving, small, plain, className, maxH }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const kb = useRef<HTMLInputElement>(null);
  const relay = useRef<InputRelay | null>(null);
  // Each view on the page asks for its own size (the server sends the largest asked for): with one id
  // for all, a small thumbnail still on the page under full screen overwrote the big view's size, and
  // full screen showed thumbnail-sized frames stretched.
  const viewerId = useRef(Math.random().toString(36).slice(2, 10)).current;
  const first = frames.get(k);
  const [size, setSize] = useState<{ w: number; h: number }>(() => (first ? { w: first.w, h: first.h } : { w: view.viewport.w, h: view.viewport.h }));
  const [has, setHas] = useState(!!first);
  if (!relay.current) relay.current = new InputRelay(k);

  // Frames go straight to the image; only a change of shape re-renders.
  useEffect(() => {
    const show = (f: { data: string; w: number; h: number }) => {
      if (img.current) img.current.src = `data:image/jpeg;base64,${f.data}`;
      setHas(true);
      setSize((s) => (Math.abs(s.w / s.h - f.w / f.h) > 0.01 ? { w: f.w, h: f.h } : s));
    };
    const f = frames.get(k);
    if (f) show(f);
    return onFrame(k, show);
  }, [k]);

  // While on screen, ask for frames as large as they show (the server stops when nobody asks).
  useEffect(() => {
    let stop = false;
    const ask = () => {
      if (stop || document.visibilityState !== 'visible' || !box.current) return;
      // Its laid-out size (an opening animation's transform does not count).
      const r = { width: box.current.offsetWidth, height: box.current.offsetHeight };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      void browserCall(k, '/watch', { w: Math.max(160, r.width * dpr), h: Math.max(100, r.height * dpr), viewer: viewerId });
    };
    ask();
    const t = window.setInterval(ask, 20_000);
    const vis = () => document.visibilityState === 'visible' && ask();
    document.addEventListener('visibilitychange', vis);
    const ro = new ResizeObserver(() => {
      window.clearTimeout(rt);
      rt = window.setTimeout(ask, 400);
    });
    let rt = 0;
    if (box.current) ro.observe(box.current);
    return () => {
      stop = true;
      window.clearInterval(t);
      window.clearTimeout(rt);
      document.removeEventListener('visibilitychange', vis);
      ro.disconnect();
    };
  }, [k, small, viewerId]);

  const at = (e: { clientX: number; clientY: number }) => {
    const r = img.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const send = relay.current;
  const press = (key: string, m = 0) => {
    const text = key === 'Enter' ? '\r' : key.length === 1 ? key : undefined;
    send.push({ t: 'key', type: 'down', key, code: key.length === 1 ? '' : key, keyCode: KEYCODES[key] ?? (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0), text, mods: m });
    send.push({ t: 'key', type: 'up', key, code: key.length === 1 ? '' : key, keyCode: KEYCODES[key] ?? 0, mods: m });
  };
  useImperativeHandle(ref, () => ({
    keyboard: () => {
      const el = kb.current;
      if (!el) return;
      el.value = BASE;
      el.focus();
    },
    press: (key) => press(key),
  }));

  // The wheel needs a listener that may stop the app's own page from scrolling.
  useEffect(() => {
    const el = img.current;
    if (!el || !driving) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = at(e);
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      send.push({ t: 'wheel', x: p.x, y: p.y, dx: e.deltaX * unit, dy: e.deltaY * unit });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [driving, send]);

  // A finger: a tap clicks, a drag scrolls the page.
  const touch = useRef<{ id: number; x: number; y: number; px: number; py: number; drag: boolean } | null>(null);
  const lastMove = useRef(0);
  const down = (e: React.PointerEvent) => {
    if (!driving) return;
    e.preventDefault();
    box.current?.focus({ preventScroll: true });
    const p = at(e);
    if (e.pointerType === 'touch') {
      touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: p.x, py: p.y, drag: false };
      return;
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    send.push({ t: 'mouse', type: 'down', x: p.x, y: p.y, button: (['left', 'middle', 'right'] as const)[e.button] ?? 'left', clicks: Math.max(1, e.detail || 1), mods: mods(e) });
  };
  const move = (e: React.PointerEvent) => {
    if (!driving) return;
    const t = touch.current;
    if (e.pointerType === 'touch' && t && t.id === e.pointerId) {
      const dx = e.clientX - t.x;
      const dy = e.clientY - t.y;
      if (!t.drag && Math.hypot(dx, dy) < 8) return;
      t.drag = true;
      const r = img.current!.getBoundingClientRect();
      send.push({ t: 'wheel', x: t.px, y: t.py, dx: (-dx / r.width) * size.w, dy: (-dy / r.height) * size.h });
      t.x = e.clientX;
      t.y = e.clientY;
      return;
    }
    if (e.pointerType === 'touch') return;
    const now = performance.now();
    if (now - lastMove.current < 40 && !e.buttons) return;
    lastMove.current = now;
    const p = at(e);
    send.push({ t: 'mouse', type: 'move', x: p.x, y: p.y, button: e.buttons & 1 ? 'left' : undefined, mods: mods(e) });
  };
  const up = (e: React.PointerEvent) => {
    if (!driving) return;
    const t = touch.current;
    if (e.pointerType === 'touch') {
      if (t && t.id === e.pointerId && !t.drag) {
        send.push({ t: 'mouse', type: 'move', x: t.px, y: t.py });
        send.push({ t: 'mouse', type: 'down', x: t.px, y: t.py, button: 'left', clicks: 1 });
        send.push({ t: 'mouse', type: 'up', x: t.px, y: t.py, button: 'left', clicks: 1 });
      }
      touch.current = null;
      return;
    }
    const p = at(e);
    send.push({ t: 'mouse', type: 'up', x: p.x, y: p.y, button: (['left', 'middle', 'right'] as const)[e.button] ?? 'left', clicks: Math.max(1, e.detail || 1), mods: mods(e) });
  };

  // A computer's keyboard: keys go to the page as they are (the app's own shortcuts wait).
  const keyDown = (e: React.KeyboardEvent) => {
    if (!driving || e.target === kb.current) return;
    if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) return; // paste comes as text
    e.preventDefault();
    e.stopPropagation();
    const m = mods(e);
    const text = e.key === 'Enter' ? '\r' : e.key.length === 1 && !(m & (MOD.ctrl | MOD.meta | MOD.alt)) ? e.key : undefined;
    send.push({ t: 'key', type: 'down', key: e.key, code: e.code, keyCode: e.keyCode, text, mods: m });
  };
  const keyUp = (e: React.KeyboardEvent) => {
    if (!driving || e.target === kb.current) return;
    e.preventDefault();
    send.push({ t: 'key', type: 'up', key: e.key, code: e.code, keyCode: e.keyCode, mods: mods(e) });
  };
  const paste = (e: React.ClipboardEvent) => {
    if (!driving) return;
    const text = e.clipboardData.getData('text');
    if (text) {
      e.preventDefault();
      send.push({ t: 'text', text });
    }
  };

  // A phone's keyboard: what lands in the hidden field goes on as text; a shorter field is backspaces.
  const composing = useRef(false);
  const kbInput = () => {
    const el = kb.current;
    if (!el || composing.current) return;
    const v = el.value;
    if (v.length < BASE.length) for (let i = v.length; i < BASE.length; i++) press('Backspace');
    else if (v.startsWith(BASE) && v.length > BASE.length) send.push({ t: 'text', text: v.slice(BASE.length) });
    else if (!v.startsWith(BASE)) send.push({ t: 'text', text: v.trim() });
    el.value = BASE;
  };
  const kbKey = (e: React.KeyboardEvent) => {
    if (['Enter', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      press(e.key);
    }
  };

  const ratio = size.w / Math.max(1, size.h);
  return (
    <div
      ref={box}
      tabIndex={driving ? 0 : -1}
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      onPaste={paste}
      className={cx('relative mx-auto overflow-hidden bg-bg-2 outline-none', driving && !plain && 'ring-2 ring-accent', className)}
      style={{ aspectRatio: ratio, width: maxH ? `min(100%, calc(${maxH} * ${ratio}))` : undefined }}
    >
      <img
        ref={img}
        alt="The browser’s page"
        draggable={false}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => (touch.current = null)}
        onContextMenu={(e) => driving && e.preventDefault()}
        className={cx('block h-full w-full select-none', driving ? 'cursor-default touch-none' : 'pointer-events-none', !has && 'invisible')}
      />
      {!has && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[12.5px] text-fg-3">
          <Throbber size={small ? 18 : 30} />
          {!small && <span>Connecting to the browser…</span>}
        </div>
      )}
      {driving && (
        <input
          ref={kb}
          aria-label="Type into the page"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={BASE}
          onInput={kbInput}
          onKeyDown={kbKey}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={() => {
            composing.current = false;
            kbInput();
          }}
          className="absolute bottom-0 left-0 h-px w-px opacity-0"
          style={{ fontSize: 16 }}
        />
      )}
    </div>
  );
});
