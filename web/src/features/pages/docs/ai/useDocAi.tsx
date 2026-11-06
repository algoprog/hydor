// The document editor's AI, in one place for the editor to use: Write with AI's box at the caret (WriteBox.tsx);
// Proofread, Change the tone and Translate for the whole document, part by part with a bar that says how far it has
// come (Stop ends it; what was done stays), their changes the editor's own suggestions by "AI" (or, asked for, made;
// a translation also as a copy in the Library); suggestions as you type, grey after the caret (Tab takes them, Esc
// drops them); and the panel that answers questions about the document (AskPanel.tsx). What it costs is said where
// the helper model says (one paid by the word).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Languages, Square, Sparkles } from 'lucide-react';
import { WRITE_LANGS, cleanLang } from '@shared/write';
import { type Doc } from '@shared/docs';
import { post } from '../../../../lib/api';
import { go } from '../../../../lib/nav';
import { toast, toastError } from '../../../../lib/store';
import { tr } from '../../../../i18n/runtime';
import { Button, Dialog, inputCls, Segmented, Throbber } from '../../../../components/ui';
import { Select } from '../../studio/fields';
import type { DocEngine, SelState } from '../engine';
import * as ops from '../ops';
import { applyFixes, complete, costWords, itemsOf, partsOf, proofread, rewriteAll, withWords, type Fix } from './ai';
import { AskPanel } from './AskPanel';
import { WriteBox } from './WriteBox';

/** Tones the whole document can be rewritten in (Tools → Change the tone). */
export const TONES: { id: string; label: string }[] = [
  { id: 'more formal', label: 'More formal' },
  { id: 'friendlier, warmer', label: 'Friendlier' },
  { id: 'more confident', label: 'More confident' },
  { id: 'simpler, plain-language', label: 'Simpler' },
  { id: 'more persuasive', label: 'More persuasive' },
  { id: 'more academic', label: 'More academic' },
  { id: 'more concise', label: 'More concise' },
];

interface Run {
  what: string;
  part: number;
  parts: number;
  stop: AbortController;
}

export function useDocAi(o: {
  engine: DocEngine | null;
  st: SelState | null;
  doc: Doc | null;
  title: string;
  host: RefObject<HTMLDivElement | null>;
  width: number;
  readOnly: boolean;
  ghostOn: boolean;
  tick: string;
}) {
  const { engine: e, st } = o;
  const [box, setBox] = useState<{ x: number; top: number; bottom: number; words: string } | null>(null);
  const [tint, setTint] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [ask, setAsk] = useState(false);
  const [dialog, setDialog] = useState<'tone' | 'translate' | null>(null);
  const [ghost, setGhost] = useState<{ text: string; at: ops.Pos; left: number; top: number; width: number; indent: number; font: string; key: string } | null>(null);

  /** Write with AI, at the caret (or for the words picked). */
  const write = () => {
    if (!e || o.readOnly) return;
    const r = e.caretRect();
    const h = o.host.current?.getBoundingClientRect();
    const s = e.state();
    setBox(r && h ? { x: r.left - h.left, top: r.top - h.top, bottom: r.bottom - h.top, words: s.collapsed ? '' : s.text } : { x: 40, top: 40, bottom: 60, words: '' });
  };

  /** A part-by-part run over the document's paragraphs; each part's answer put in as it comes. */
  const parts = async (what: string, f: (items: ReturnType<typeof itemsOf>['items'], signal: AbortSignal) => Promise<{ items: Fix[]; model?: string; cost?: number }>, put: (items: ReturnType<typeof itemsOf>['items'], fixes: Fix[]) => number, done: (n: number, by: string, waiting: number) => void) => {
    if (!e || run) return;
    const { items, waiting } = itemsOf(e.doc);
    if (!items.length) return void toast(tr('The document has no paragraphs to work on.'));
    const list = partsOf(items);
    const stop = new AbortController();
    let n = 0;
    let by = 'AI';
    let cost = 0;
    try {
      for (let k = 0; k < list.length; k++) {
        if (stop.signal.aborted) break;
        setRun({ what, part: k + 1, parts: list.length, stop });
        const r = await f(list[k], stop.signal);
        by = r.model ?? by;
        cost += r.cost ?? 0;
        n += put(list[k], r.items);
      }
      done(n, `${by}${costWords({ cost })}`, waiting);
    } catch (err) {
      if (!stop.signal.aborted) toastError(err);
      else if (n) done(n, by, waiting);
    } finally {
      setRun(null);
    }
  };

  /** Tools → Proofread: corrections as suggestions by AI. */
  const proof = () =>
    void parts(
      tr('Proofreading'),
      (items, signal) => proofread(items, signal),
      (items, fixes) => {
        if (!e || !fixes.length) return 0;
        const r = applyFixes(e.doc, items, fixes, true);
        if (r.changes) e.change(r.doc);
        return r.changes;
      },
      (n, by, waiting) =>
        toast(
          n
            ? `${tr('Proofreading suggests')} ${n} ${n === 1 ? tr('change') : tr('changes')} (${by}): ${tr('accept or reject each beside the page, or all of them in Tools.')}`
            : `${tr('Proofreading found nothing to change')} (${by}).${waiting ? ` ${tr('Paragraphs with suggestions waiting were left out.')}` : ''}`,
          n ? 'ok' : 'info',
        ),
    );

  /** Tools → Change the tone (as suggestions, or made). */
  const tone = (t: string, suggest: boolean) =>
    void parts(
      tr('Changing the tone'),
      (items, signal) => rewriteAll({ how: 'tone', tone: t, items }, signal),
      (items, fixes) => {
        if (!e || !fixes.length) return 0;
        const r = applyFixes(e.doc, items, fixes, suggest);
        if (r.changes) e.change(r.doc);
        return r.changes;
      },
      (n, by) => toast(n ? `${suggest ? tr('The new tone is suggested') : tr('The tone is changed')} (${by}).` : `${tr('Nothing changed')} (${by}).`, n ? 'ok' : 'info'),
    );

  /** Tools → Translate the document: as suggestions here, or as a copy in the Library. */
  const translate = (lang: string, copy: boolean) => {
    if (!e) return;
    const base = e.doc;
    const all: Fix[] = [];
    void parts(
      tr('Translating'),
      (items, signal) => rewriteAll({ how: 'translate', lang, items }, signal),
      (items, fixes) => {
        if (copy) {
          all.push(...fixes);
          return fixes.length;
        }
        if (!fixes.length) return 0;
        const r = applyFixes(e.doc, items, fixes, true);
        if (r.changes) e.change(r.doc);
        return r.changes;
      },
      (n, by) => {
        if (!copy) return toast(n ? `${tr('The translation is suggested')} (${by}).` : `${tr('Nothing changed')} (${by}).`, n ? 'ok' : 'info');
        if (!n) return toast(tr('Nothing was translated.'));
        const { items } = itemsOf(base);
        const { comments: _c, suggestions: _s, ...rest } = withWords(base, items, all);
        void post<{ page: { id: string } }>('/api/pages', { title: `${o.title || tr('Document')} (${lang})`, kind: 'doc', model: rest }).then(
          (r) => {
            toast(`${tr('The translation is a new document in the Library')} (${by}).`, 'ok');
            go(`/pages/${encodeURIComponent(r.page.id)}`);
          },
          toastError,
        );
      },
    );
  };

  // ---- suggestions as you type -------------------------------------------------------------------------------------------
  const asked = useRef<AbortController | null>(null);
  const shown = useRef(ghost);
  shown.current = ghost;
  useEffect(() => {
    asked.current?.abort();
    if (!e || !st || !o.ghostOn || o.readOnly || run || box || !st.collapsed || st.picked) return setGhost(null);
    const [s] = e.range();
    const b = ops.blockOf(e.doc, s.b);
    const runs = ops.boxRuns(e.doc, s.b, s.c) ?? [];
    const text = runs.map((r) => (r.del ? '' : r.t)).join('');
    // At the end of words being written (not code, not a heading, not a table's cell), after a pause.
    if (s.c || !b || !ops.isText(b) || (b.type === 'p' && b.style && b.style !== 'quote') || s.o !== ops.lenOf(runs) || text.trim().length < 12 || /\n$/.test(text)) return setGhost(null);
    const key = `${s.b}:${s.o}:${text.length}`;
    if (shown.current?.key === key) return;
    setGhost(null);
    const ac = new AbortController();
    asked.current = ac;
    const t = setTimeout(() => {
      const i = ops.indexOf(e.doc, s.b);
      const before = [...e.doc.blocks.slice(Math.max(0, i - 6), i).flatMap((x) => (ops.isText(x) ? [x.runs.map((r) => (r.del ? '' : r.t)).join('')] : [])), text].join('\n\n');
      complete(before, '', ac.signal).then(
        (r) => {
          if (ac.signal.aborted || !r.text.trim()) return;
          const [now] = e.range();
          if (!ops.samePos(now, s) || ops.lenOf(ops.boxRuns(e.doc, s.b) ?? []) !== s.o) return;
          const el = e.elementOf(s.b);
          const caret = e.caretRect();
          const h = o.host.current?.getBoundingClientRect();
          if (!el || !caret || !h) return;
          const r0 = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const pl = parseFloat(cs.paddingLeft) || 0;
          const left = r0.left - h.left + pl;
          setGhost({ text: r.text, at: s, left, top: caret.top - h.top, width: r0.width - pl - (parseFloat(cs.paddingRight) || 0), indent: caret.left - h.left - left, font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`, key });
        },
        () => {},
      );
    }, 900);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, o.ghostOn, o.readOnly, !!run, !!box]);
  useLayoutEffect(() => {
    if (ghost) setGhost((g) => g && { ...g });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.tick]);

  /** The editor's keys, first: Tab takes a suggestion, Esc drops it; Ctrl+J and Space on an empty line write with AI. True when one was. */
  const onKey = (ev: KeyboardEvent): boolean => {
    if (!e || o.readOnly) return false;
    if (ghost) {
      if (ev.key === 'Tab' && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault();
        e.typeText(ghost.text);
        setGhost(null);
        return true;
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        setGhost(null);
        return true;
      }
      setGhost(null);
    }
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'j') {
      ev.preventDefault();
      write();
      return true;
    }
    if (ev.key === ' ' && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey && !e.picked) {
      const [s, z] = e.range();
      const b = ops.blockOf(e.doc, s.b);
      if (ops.samePos(s, z) && !s.c && b?.type === 'p' && !b.style && !b.runs.length) {
        ev.preventDefault();
        write();
        return true;
      }
    }
    return false;
  };

  // A passage an answer rests on, marked for a moment.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [flash]);

  const css = [
    ...tint.map((id) => `.nd-ed [data-b="${CSS.escape(id)}"]{background:rgba(124,58,237,.08);box-shadow:-10px 0 0 -6px rgba(124,58,237,.55)}`),
    flash ? `.nd-ed [data-b="${CSS.escape(flash)}"]{background:rgba(251,188,4,.28);transition:background .3s}` : '',
    // An empty line where the caret is says what Space and "/" do.
    st && !o.readOnly && st.collapsed && st.block?.type === 'p' && !st.block.style && !st.block.runs.length && !st.cell
      ? `.nd-ed [data-b="${CSS.escape(st.block.id)}"].nd-normal:has(> br[data-ph]:only-child)::before{content:${JSON.stringify(tr('Press Space to write with AI, or / for more'))};color:#a0a5ab;position:absolute;pointer-events:none}`
      : '',
  ].join('\n');

  const overlay: ReactNode = (
    <>
      {box && e && (
        <WriteBox
          engine={e}
          at={box}
          width={o.host.current?.clientWidth ?? o.width}
          title={o.title}
          words={box.words}
          onClose={() => setBox(null)}
          onTint={setTint}
        />
      )}
      {ghost && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 whitespace-pre-wrap"
          style={{ left: ghost.left, top: ghost.top, width: ghost.width, textIndent: ghost.indent, font: ghost.font, color: '#9aa0a6' }}
        >
          {ghost.text}
          <span className="ml-1.5 rounded border border-[#dadce0] px-1 align-middle text-[10px] leading-none text-[#80868b]" style={{ textIndent: 0 }}>
            Tab
          </span>
        </div>
      )}
    </>
  );

  const bar: ReactNode = run ? (
    <div role="status" data-keeps-editing className="flex items-center gap-2 rounded-xl border border-line bg-elevated py-1 pr-1 pl-3 shadow-lg">
      <Throbber size={14} />
      <span className="text-[12.5px] text-fg">
        {run.what}… {run.parts > 1 ? `${run.part} / ${run.parts}` : ''}
      </span>
      <button type="button" onClick={() => run.stop.abort()} className="flex h-7 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-fg-2 hover:bg-bg-2 hover:text-fg">
        <Square size={10} fill="currentColor" strokeWidth={0} />
        Stop
      </button>
    </div>
  ) : null;

  const panel: ReactNode =
    ask && o.doc ? (
      <AskPanel
        doc={o.doc}
        title={o.title}
        onClose={() => setAsk(false)}
        onGo={(id) => {
          e?.focusBlock(id);
          setFlash(id);
        }}
      />
    ) : null;

  const dialogs: ReactNode = (
    <>
      <ToneDialog open={dialog === 'tone'} onClose={() => setDialog(null)} onRun={(t, sug) => (setDialog(null), tone(t, sug))} />
      <TranslateDialog open={dialog === 'translate'} onClose={() => setDialog(null)} onRun={(l, copy) => (setDialog(null), translate(l, copy))} />
    </>
  );

  return {
    write,
    proofread: proof,
    tone: () => setDialog('tone'),
    translate: () => setDialog('translate'),
    ask,
    toggleAsk: () => setAsk((a) => !a),
    busy: !!run,
    onKey,
    css,
    overlay,
    bar,
    panel,
    dialogs,
  };
}

function ToneDialog({ open, onClose, onRun }: { open: boolean; onClose: () => void; onRun: (tone: string, suggest: boolean) => void }) {
  const [tone, setTone] = useState(TONES[0].id);
  const [how, setHow] = useState<'suggest' | 'edit'>('suggest');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change the tone"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Sparkles size={14} />} onClick={() => onRun(tone, how === 'suggest')}>
            Change the tone
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[12.5px] leading-relaxed text-fg-3">The helper model rewrites every paragraph in the tone you pick, part by part, keeping what it says.</p>
        <Select value={tone} title="The tone" onChange={setTone} options={TONES.map((t) => ({ value: t.id, label: t.label }))} />
        <Segmented
          size="sm"
          value={how}
          onChange={setHow}
          options={[
            { value: 'suggest', label: 'As suggestions' },
            { value: 'edit', label: 'Change it directly' },
          ]}
        />
      </div>
    </Dialog>
  );
}

function TranslateDialog({ open, onClose, onRun }: { open: boolean; onClose: () => void; onRun: (lang: string, copy: boolean) => void }) {
  const [lang, setLang] = useState(WRITE_LANGS[1]);
  const [other, setOther] = useState('');
  const [how, setHow] = useState<'copy' | 'suggest'>('copy');
  const picked = lang === '~' ? cleanLang(other) : lang;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Translate the document"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Languages size={14} />} disabled={!picked} onClick={() => picked && onRun(picked, how === 'copy')}>
            Translate
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[12.5px] leading-relaxed text-fg-3">The helper model translates every paragraph, part by part, keeping the document as it is laid out.</p>
        <Select value={lang} title="The language" onChange={setLang} options={[...WRITE_LANGS.map((l) => ({ value: l, label: l })), { value: '~', label: 'Another language' }]} />
        {lang === '~' && <input autoFocus value={other} onChange={(ev) => setOther(ev.target.value)} placeholder="Swahili, Hebrew, Thai…" aria-label="The language" className={inputCls} />}
        <Segmented
          size="sm"
          value={how}
          onChange={setHow}
          options={[
            { value: 'copy', label: 'A copy in the Library' },
            { value: 'suggest', label: 'Suggestions here' },
          ]}
        />
      </div>
    </Dialog>
  );
}

