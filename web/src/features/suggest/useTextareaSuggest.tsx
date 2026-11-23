// Word suggestions in a plain textarea: the grey rest of the word after the caret (and the next word, dimmer) drawn
// by a mirror of the textarea laid over it, and the keys that take it. A message box gives its ref, its value, its
// place (chat for a message to an agent, notes, docs, other) and what goes with the text; it draws `overlay` after
// the textarea inside the same positioned box, and offers each key press to `onKeyDown` first.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboard, type ReactNode, type RefObject } from 'react';
import { useUI } from '../../lib/store';
import { makeSuggester, type Adapter } from './controller';
import type { Grey, Place } from './logic';
import { useSuggest, warmSuggest } from './store';

type Context = ReturnType<Adapter['context']>;

/** Put text in a textarea at its caret the way typing does, so that Undo takes it out again. */
export function insertInto(el: HTMLTextAreaElement, text: string) {
  el.focus();
  el.setSelectionRange(el.selectionEnd, el.selectionEnd);
  if (document.execCommand?.('insertText', false, text)) return;
  // Where the browser has no insertText for a textarea: set the value, and tell React as typing would.
  const at = el.selectionEnd;
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  set?.call(el, el.value.slice(0, at) + text + el.value.slice(at));
  el.setSelectionRange(at + text.length, at + text.length);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const COPIED = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontStretch',
  'fontKerning',
  'fontFeatureSettings',
  'fontVariantLigatures',
  'letterSpacing',
  'wordSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'textAlign',
  'textRendering',
  'tabSize',
  'direction',
  'writingMode',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
  'lineBreak',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
] as const;

/**
 * The textarea's text, wrapped as the textarea wraps it: its text up to the caret unseen, then the grey words. Laid
 * over the textarea (same font, padding, width and scroll, kept in step as it grows and scrolls), it lets the
 * pointer through and is hidden from screen readers and from translation.
 */
export function GreyMirror({ ta, before, grey }: { ta: HTMLTextAreaElement | null; before: string; grey: Grey }) {
  const box = useRef<HTMLDivElement>(null);
  const place = () => {
    const el = box.current;
    if (!el || !ta?.isConnected) return;
    const cs = getComputedStyle(ta);
    for (const k of COPIED) el.style[k as 'fontFamily'] = cs[k as 'fontFamily'];
    // Where the textarea's inside is, in the box the mirror is positioned in.
    const parent = el.offsetParent as HTMLElement | null;
    const p = parent?.getBoundingClientRect();
    const r = ta.getBoundingClientRect();
    el.style.left = `${r.left - (p?.left ?? 0) + ta.clientLeft + (parent?.scrollLeft ?? 0) - (parent?.clientLeft ?? 0)}px`;
    el.style.top = `${r.top - (p?.top ?? 0) + ta.clientTop + (parent?.scrollTop ?? 0) - (parent?.clientTop ?? 0)}px`;
    el.style.width = `${ta.clientWidth}px`;
    el.style.height = `${ta.clientHeight}px`;
    el.scrollTop = ta.scrollTop;
  };
  // Measured after every draw (the textarea grows with its text), and again as it resizes or scrolls.
  useLayoutEffect(place);
  useEffect(() => {
    if (!ta) return;
    const ro = new ResizeObserver(place);
    ro.observe(ta);
    ta.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      ta.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [ta]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={box} aria-hidden="true" translate="no" className="pointer-events-none absolute box-border overflow-hidden break-words" style={{ borderWidth: 0 }}>
      <span className="invisible">{before}</span>
      <span className="text-fg-3">{grey.word}</span>
      {grey.next && <span className="text-fg-3/50">{grey.next}</span>}
    </div>
  );
}

export interface TextareaSuggest {
  /** Offer a key press first: Tab, → at the end, Esc; true when it was taken (the box's own handling is then skipped). */
  onKeyDown: (e: ReactKeyboard<HTMLTextAreaElement>) => boolean;
  /** Draw it after the textarea, in the box it is in. */
  overlay: ReactNode;
  /** What is shown now (for a hint). */
  shown: boolean;
}

/**
 * Word suggestions for the textarea in `ref`. `value` is its text (the hook asks again when it changes); `context`
 * gives what goes with it (read when a request goes out, so it may be a function of the latest state).
 */
export function useTextareaSuggest(ref: RefObject<HTMLTextAreaElement | null>, o: { place: Place; value: string; context?: () => Context; off?: boolean }): TextareaSuggest {
  const [view, setView] = useState<{ grey: Grey; before: string } | null>(null);
  const composing = useRef(false);
  const opts = useRef(o);
  opts.current = o;
  const sg = useRef<ReturnType<typeof makeSuggester> | null>(null);
  if (!sg.current) {
    const adapter: Adapter = {
      get place() {
        return opts.current.place;
      },
      read() {
        const el = ref.current;
        if (!el || opts.current.off || document.activeElement !== el) return null;
        return { before: el.value.slice(0, el.selectionStart), after: el.value.slice(el.selectionEnd), selected: el.selectionStart !== el.selectionEnd, composing: composing.current };
      },
      insert: (text) => ref.current && insertInto(ref.current, text),
      context: () => opts.current.context?.() ?? {},
    };
    const s = makeSuggester(adapter, (g) => setView(g ? { grey: g, before: ref.current ? ref.current.value.slice(0, ref.current.selectionStart) : '' } : null));
    sg.current = s;
  }
  const ctl = sg.current;

  // The textarea's own events, on whichever element the ref holds now (a box may appear after the component did).
  const bound = useRef<HTMLTextAreaElement | null>(null);
  const unbind = useRef<(() => void) | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (el === bound.current) return;
    unbind.current?.();
    bound.current = el;
    if (!el) return;
    const sync = () => ctl.sync();
    const start = () => ((composing.current = true), ctl.sync());
    const end = () => ((composing.current = false), ctl.sync());
    const focus = () => (warmSuggest(), ctl.sync());
    const blur = () => ((composing.current = false), ctl.reset());
    const sel = () => document.activeElement === el && ctl.sync();
    const on: [EventTarget, string, EventListener][] = [
      [el, 'input', sync],
      [el, 'compositionstart', start],
      [el, 'compositionend', end],
      [el, 'focus', focus],
      [el, 'blur', blur],
      [el, 'click', sync],
      [el, 'keyup', sync],
      [document, 'selectionchange', sel],
    ];
    for (const [t, n, f] of on) t.addEventListener(n, f);
    unbind.current = () => on.forEach(([t, n, f]) => t.removeEventListener(n, f));
    if (document.activeElement === el) focus();
  });
  useEffect(
    () => () => {
      unbind.current?.();
      bound.current = null;
      ctl.reset();
    },
    [ctl],
  );

  // Text set from outside (a draft coming back, a send emptying the box), and the switches turned on or off.
  useEffect(() => ctl.sync(), [o.value, o.off, o.place, ctl]);
  useEffect(() => {
    const a = useSuggest.subscribe(() => ctl.sync());
    const b = useUI.subscribe((s, p) => s.wordSuggestions !== p.wordSuggestions && ctl.sync());
    return () => (a(), b());
  }, [ctl]);

  return {
    onKeyDown: (e) => ctl.key({ key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, isComposing: e.nativeEvent.isComposing, preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation() }),
    overlay: view ? <GreyMirror ta={ref.current} before={view.before} grey={view.grey} /> : null,
    shown: !!view,
  };
}
