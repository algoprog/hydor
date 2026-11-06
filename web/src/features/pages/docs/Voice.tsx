// Voice typing and Read aloud in documents (Tools → Voice typing, Ctrl+Shift+S; Tools → Read aloud). Voice typing is
// the app's own dictation (the message box's: the browser's speech recognition, or the server's, Settings → Voice): a
// bar over the page shows what is heard, and the words go in at the caret when you stop (Done, or the keys again).
// Read aloud speaks the document from the caret (or the words picked) with the browser's voices (Settings → Voice's
// voice and speed), a sentence at a time, the sentence being read marked on the page; Pause, Resume and Stop.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AudioLines, Check, Mic, Pause, Play, Square } from 'lucide-react';
import { toast } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { IconButton, Throbber } from '../../../components/ui';
import { useDictation } from '../../voice/dictation';
import { canSpeak, dictationMode, speechLang, useServerVoice, useVoicePrefs } from '../../voice/prefs';
import type { DocEngine } from './engine';
import * as ops from './ops';

type HighlightsApi = { set(name: string, h: unknown): void; delete(name: string): void };
const highlights = (): HighlightsApi | null => (globalThis as unknown as { CSS?: { highlights?: HighlightsApi } }).CSS?.highlights ?? null;
const HighlightCtor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;

/** A sentence to read: its words, and where they are (a block's words, or a table's cell's). */
interface Said {
  b: string;
  c?: [number, number];
  s: number;
  e: number;
  text: string;
}

/** The sentences from a place to the end of the document (or to `end`), each where it is. */
function sentencesFrom(engine: DocEngine, from: ops.Pos, end?: ops.Pos): Said[] {
  const out: Said[] = [];
  const doc = engine.doc;
  for (const box of ops.allBoxes(doc)) {
    const at = { b: box.b, ...(box.c ? { c: box.c } : {}), o: 0 };
    if (ops.cmp(doc, { ...at, o: ops.lenOf(box.runs) }, from) < 0) continue;
    if (end && ops.cmp(doc, at, end) > 0) break;
    // The words as they read (a thing of its own, as a gap; words to take out, left out).
    const text = box.runs.map((r) => (r.del ? ' '.repeat(r.t.length) : r.math || r.fn || r.cite || r.xref ? ' '.repeat(r.t.length) : r.t)).join('');
    const lo = ops.sameBox(at, from) ? from.o : 0;
    const hi = end && ops.sameBox(at, end) ? end.o : text.length;
    for (const m of text.matchAll(/[^.!?。！？\n]+[.!?。！？]*["”’)]*\s*/g)) {
      const s = m.index!;
      const e = s + m[0].trimEnd().length;
      if (e <= lo || s >= hi) continue;
      const words = text.slice(Math.max(s, lo), Math.min(e, hi)).replace(/\s+/g, ' ').trim();
      if (words) out.push({ b: box.b, ...(box.c ? { c: box.c } : {}), s: Math.max(s, lo), e: Math.min(e, hi), text: words });
    }
  }
  return out;
}

export function useDocVoice(engine: DocEngine | null, readOnly: boolean) {
  const server = useServerVoice();
  const use = useVoicePrefs((p) => p.use);
  const mode = dictationMode(server, use);
  const d = useDictation((text) => {
    if (!engine || readOnly) return;
    // The words heard go in at the caret, a space before them where words come before.
    const [s] = engine.range();
    const before = ops.boxRuns(engine.doc, s.b, s.c)?.map((r) => r.t).join('').slice(0, s.o) ?? '';
    engine.typeText(`${before && !/\s$/.test(before) ? ' ' : ''}${text}`);
  });
  const typing = d.phase !== 'idle';

  // ---- reading aloud --------------------------------------------------------------------------------------------------
  const [reading, setReading] = useState<'off' | 'on' | 'paused'>('off');
  const list = useRef<Said[]>([]);
  const at = useRef(0);
  const token = useRef(0);
  const mark = (x: Said | null) => {
    const api = highlights();
    if (!api || !HighlightCtor || !engine) return;
    if (!x) return api.delete('nd-read');
    const a = engine.domOf({ b: x.b, ...(x.c ? { c: x.c } : {}), o: x.s });
    const z = engine.domOf({ b: x.b, ...(x.c ? { c: x.c } : {}), o: x.e });
    if (!a || !z) return api.delete('nd-read');
    const r = document.createRange();
    try {
      r.setStart(a.node, a.offset);
      r.setEnd(z.node, z.offset);
    } catch {
      return;
    }
    api.set('nd-read', new HighlightCtor(r));
    // Kept in view.
    const box = r.getBoundingClientRect();
    if (box.top < 80 || box.bottom > window.innerHeight - 60) engine.elementOf(x.b)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const sayNext = () => {
    const t = ++token.current;
    const x = list.current[at.current];
    if (!x) return stopReading();
    mark(x);
    const u = new SpeechSynthesisUtterance(x.text);
    const p = useVoicePrefs.getState();
    const v = p.voice ? window.speechSynthesis.getVoices().find((y) => y.voiceURI === p.voice) : undefined;
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = speechLang(p.lang);
    u.rate = Math.min(2, Math.max(0.5, p.rate || 1));
    u.onend = () => {
      if (t !== token.current) return;
      at.current++;
      sayNext();
    };
    u.onerror = (e) => {
      if (t !== token.current || e.error === 'interrupted' || e.error === 'canceled') return;
      stopReading();
      toast(`${tr('Reading aloud stopped')} (${e.error})`, 'error');
    };
    window.speechSynthesis.speak(u);
  };
  const stopReading = () => {
    token.current++;
    if (canSpeak()) window.speechSynthesis.cancel();
    mark(null);
    setReading('off');
  };
  const read = () => {
    if (!engine) return;
    if (!canSpeak()) return void toast(tr('This browser cannot read aloud.'), 'error');
    if (reading !== 'off') return stopReading();
    const [s, e] = engine.range();
    const picked = !ops.samePos(s, e);
    list.current = sentencesFrom(engine, s, picked ? e : undefined);
    at.current = 0;
    if (!list.current.length) return void toast(tr('There are no words to read from here.'));
    window.speechSynthesis.cancel();
    setReading('on');
    sayNext();
  };
  const pause = () => {
    // Pausing stops the sentence; resuming says it again (pausing midway is unreliable in browsers).
    token.current++;
    window.speechSynthesis.cancel();
    setReading('paused');
  };
  const resume = () => {
    setReading('on');
    sayNext();
  };
  useEffect(
    () => () => {
      token.current++;
      if (canSpeak()) window.speechSynthesis.cancel();
      highlights()?.delete('nd-read');
    },
    [],
  );

  const dictate = () => {
    if (readOnly) return;
    if (typing) return d.stop();
    if (!mode) return void toast(tr('Speech recognition is not available here: turn it on in Settings → Voice, or use Chrome, Edge or Safari.'), 'error');
    d.start(mode);
  };

  const bar: ReactNode =
    typing || reading !== 'off' ? (
      <div role="status" data-keeps-editing className="flex max-w-[min(560px,calc(100vw-48px))] items-center gap-2 rounded-xl border border-line bg-elevated py-1 pr-1 pl-3 shadow-lg">
        {typing ? (
          <>
            {d.phase === 'transcribing' ? <Throbber size={14} /> : <Mic size={14} className="shrink-0 text-err" />}
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">
              {d.phase === 'transcribing' ? tr('Turning your words into text…') : d.phase === 'starting' ? tr('Starting the microphone…') : d.heard ? d.heard.slice(-120) : tr('Voice typing: speak now')}
            </span>
            {d.phase === 'listening' && (
              <button type="button" onClick={d.stop} className="flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-accent hover:bg-accent-soft">
                <Check size={13} />
                Done
              </button>
            )}
          </>
        ) : (
          <>
            <AudioLines size={14} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">
              {reading === 'paused' ? tr('Paused') : tr('Reading aloud')}
              <span className="text-fg-3">
                {' '}
                · {Math.min(at.current + 1, list.current.length)} / {list.current.length}
              </span>
            </span>
            <IconButton label={reading === 'paused' ? 'Resume reading' : 'Pause reading'} size="sm" onClick={reading === 'paused' ? resume : pause}>
              {reading === 'paused' ? <Play size={14} /> : <Pause size={14} />}
            </IconButton>
            <IconButton label="Stop reading" size="sm" onClick={stopReading}>
              <Square size={11} fill="currentColor" strokeWidth={0} />
            </IconButton>
          </>
        )}
      </div>
    ) : null;

  return { dictate, typing, read, reading: reading !== 'off', bar, canDictate: !!mode, canRead: canSpeak() };
}
