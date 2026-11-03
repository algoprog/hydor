// A document to read and edit as in Word or Google Docs: its sheet of paper (its size and margins; on a phone the
// words fill the screen's width), edited in place (engine.ts), the toolbar over it (Toolbar.tsx), its headings
// beside it on a wide screen (folded away on a narrow one) to go to, and the words it has in a quiet corner. A page
// break shows as a gap between two sheets. A picture picked gets handles to size it and a bar for its alignment,
// caption and description (Picture.tsx). Words picked offer to ask the agent about them, and the page around is
// told what an agent asked now would be about (the whole document, the section the caret is in, the words
// picked). Changes stay unsaved until Save (Ctrl+S), as a page's do; the paper, margins, font and size are under
// Page setup.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileCog, Link2, ListTree, Sparkles, Unlink } from 'lucide-react';
import { docHeadings, docWords, FONTS, MARGINS, PAPERS, sectionOf, type Doc, type ImageBlock } from '@shared/docs';
import { post } from '../../../lib/api';
import { mu } from '../../../lib/machine';
import { toast, toastError } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { LOCALE } from '../../../i18n/locale';
import { Button, cx, IconButton, Popover, Segmented, useConfirm } from '../../../components/ui';
import type { AskScope, ModelEditorProps } from '../kinds';
import { choosePicture, pictureFromUrl, uploadPicture } from '../pictures';
import { NumInput } from '../slides/controls';
import { Select } from '../studio/fields';
import { editorCss, paperPx, useDocFonts } from './css';
import { DocEngine, type SelState } from './engine';
import { fixDoc, sameDoc } from './ops';
import { Picked } from './Picture';
import { Toolbar } from './Toolbar';

const OUTLINE_KEY = 'wa.docs.outline';

/** Where a picture of a document shows from in the app (whose own pages load no picture from the web). */
const pictureSrc = (s: string) =>
  s.startsWith('naget-asset:') ? mu(`/api/pages/assets/${s.slice('naget-asset:'.length)}`) : /^https?:/i.test(s) ? mu(`/api/pages/picture?url=${encodeURIComponent(s)}`) : s;

/** A picture from the web (or inside pasted words) kept by the app: its kept source. */
const takeIn = (src: string) => post<{ src: string }>('/api/pages/assets', src.startsWith('data:') ? { data: src } : { url: src }).then((r) => r.src);

const short = (s: string, n = 48) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** What an agent asked now would be about: the document, the section the caret is in, the words or the picture picked. */
function scopesOf(doc: Doc, st: SelState): AskScope[] {
  const out: AskScope[] = [{ id: 'doc', label: tr('The whole document'), lead: '' }];
  const sec = sectionOf(doc, st.index);
  const where = sec ? ` (in the section “${short(sec.text, 80)}”)` : '';
  if (sec) out.push({ id: 'section', label: `${tr('This section')}: ${short(sec.text, 40)}`, lead: `In the section “${short(sec.text, 80)}”: ` });
  if (st.picked?.type === 'image') {
    const p = st.picked as ImageBlock;
    const what = p.caption || p.alt;
    out.push({ id: 'picture', label: tr('The picture picked'), lead: `About the picture${what ? ` “${short(what, 80)}”` : ''}${where}: ` });
  } else if (st.text.trim()) out.push({ id: 'words', label: tr('The words picked'), lead: `About the words “${short(st.text, 160)}”${where}: ` });
  return out;
}

export function DocEditor({ doc, layout, readOnly, onSave, lead, tail, band, savedNote, onDirty, onAsk, onScopes, saveNowRef }: ModelEditorProps<Doc>) {
  const [model, setModel] = useState<Doc | null>(() => (doc?.model ? fixDoc(doc.model) : null));
  const [saved, setSaved] = useState<Doc | null>(model);
  const [st, setSt] = useState<SelState | null>(null);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState<{ url: string; text: string } | null>(null);
  const [menu, setMenu] = useState<'page' | 'outline' | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(() => localStorage.getItem(OUTLINE_KEY) !== '0');
  const [width, setWidth] = useState(1200);
  const [words, setWords] = useState(0);
  const [float, setFloat] = useState<{ ask?: { x: number; y: number }; link?: { x: number; y: number } } | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const root = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<DocEngine | null>(null);
  const linkRef = useRef<HTMLButtonElement>(null);
  const pageRef = useRef<HTMLButtonElement>(null);
  const outlineRef = useRef<HTMLButtonElement>(null);
  const fonts = useDocFonts(model);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const phone = layout === 'sheet' || width < 640;
  const narrow = !!model && width - (outlineOpen && width >= 1100 ? 220 : 0) < paperPx(model) + 56;
  const wideOutline = width >= 1100 && layout !== 'sheet';

  const dirty = !!model && !!saved && model !== saved;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty]);
  useEffect(() => {
    localStorage.setItem(OUTLINE_KEY, outlineOpen ? '1' : '0');
  }, [outlineOpen]);

  const save = async (): Promise<boolean> => {
    const e = engine.current;
    if (!e || !onSave || saving || readOnly) return false;
    const d = e.doc;
    setSaving(true);
    try {
      if (await onSave(d)) {
        setSaved(d);
        return true;
      }
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
    return false;
  };
  const saveNow = useRef(save);
  saveNow.current = save;
  if (saveNowRef) saveNowRef.current = () => (dirtyRef.current ? saveNow.current() : Promise.resolve(true));
  const stRef = useRef(st);
  stRef.current = st;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  // The page's engine, once there is a document to show.
  useLayoutEffect(() => {
    if (!paper.current || !model || engine.current) return;
    engine.current = new DocEngine(paper.current, model, {
      readOnly: !!readOnly,
      src: pictureSrc,
      breakLabel: tr('Page break'),
      onChange: (d) => setModel(d),
      onState: (s) => setSt(s),
      onKey: (e) => {
        const mod = e.ctrlKey || e.metaKey;
        const k = e.key.toLowerCase();
        if (mod && k === 's') {
          e.preventDefault();
          void saveNow.current();
          return true;
        }
        if (mod && k === 'k' && !e.shiftKey && !readOnlyRef.current) {
          e.preventDefault();
          setLinking({ url: stRef.current?.link ?? '', text: '' });
          return true;
        }
        return false;
      },
      upload: (f) => {
        toast(tr('Adding the picture…'));
        return uploadPicture(f);
      },
      takeIn: (s) => takeIn(s),
      onError: toastError,
    });
    setSt(engine.current.state());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!model]);
  useEffect(() => () => engine.current?.destroy(), []);
  useEffect(() => {
    engine.current?.setReadOnly(!!readOnly);
  }, [readOnly]);

  // Another document, or another version of it, while nothing was changed here: start from it.
  useEffect(() => {
    if (!doc) return;
    const m = fixDoc(doc.model);
    const e = engine.current;
    if (!e) {
      setModel(m);
      setSaved(m);
      return;
    }
    if (dirtyRef.current) return;
    // The version just saved from here: it stays as it is (the caret and the history with it).
    if (sameDoc(m, e.doc)) return setSaved(e.doc);
    e.load(m);
    setModel(e.doc);
    setSaved(e.doc);
    setSt(e.state());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.key]);

  // Ctrl+S from the toolbar's fields too.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      const a = document.activeElement;
      if (a && a !== document.body && !root.current?.contains(a)) return;
      e.preventDefault();
      void saveNow.current();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // The words it has, a moment after each change.
  useEffect(() => {
    if (!model) return;
    const t = setTimeout(() => setWords(docWords(model)), 400);
    return () => clearTimeout(t);
  }, [model]);

  // What an agent asked now would be about, told as the caret moves.
  const lastScopes = useRef('');
  useEffect(() => {
    if (!model || !st || !onScopes) return;
    const s = scopesOf(model, st);
    const key = JSON.stringify(s);
    if (key === lastScopes.current) return;
    lastScopes.current = key;
    onScopes(s);
  }, [st, model?.blocks]);

  // The chip to ask about the words picked, and the bar of the link the caret is in.
  useLayoutEffect(() => {
    const h = host.current;
    if (!st || !h) return setFloat(null);
    const hr = h.getBoundingClientRect();
    const out: { ask?: { x: number; y: number }; link?: { x: number; y: number } } = {};
    const s = window.getSelection();
    if (onAsk && !st.collapsed && st.text.trim() && s?.rangeCount && paper.current?.contains(s.anchorNode)) {
      const r = s.getRangeAt(0).getBoundingClientRect();
      if (r.width || r.height) out.ask = { x: Math.min(Math.max(r.left - hr.left + r.width / 2, 60), hr.width - 60), y: phone ? r.bottom - hr.top + 10 : r.top - hr.top - 8 };
    }
    if (st.collapsed && st.link && !readOnly) {
      const a = engine.current?.linkElement();
      if (a) {
        const r = a.getBoundingClientRect();
        out.link = { x: Math.max(8, r.left - hr.left), y: r.bottom - hr.top + 6 };
      }
    }
    setFloat(out.ask || out.link ? out : null);
  }, [st, width, fonts]);

  const heads = useMemo(() => (model ? docHeadings(model) : []), [model?.blocks]);
  const current = model && st ? sectionOf(model, st.index)?.id : undefined;
  const css = useMemo(() => (model ? editorCss(model, { narrow, hints: { title: tr('Title'), body: tr('Start writing') } }) : ''), [model?.page, model?.font, model?.size, narrow]);

  if (!model) return <div className="flex h-full items-center justify-center text-fg-3">…</div>;

  const e = engine.current;
  const discard = async () => {
    if (!(await confirm({ title: 'Discard your changes?', body: 'The document goes back to how it was saved.', confirm: 'Discard', danger: true }))) return;
    if (!e || !saved) return;
    e.load(saved);
    setModel(e.doc);
    setSaved(e.doc);
  };
  const pickPicture = async () => {
    const f = await choosePicture();
    if (f && e) await e.addPictures([f]);
  };
  const replacePicture = async (id: string) => {
    const f = await choosePicture();
    if (!f || !e) return;
    try {
      toast(tr('Adding the picture…'));
      const p = await uploadPicture(f);
      e.image(id, { src: p.src });
    } catch (err) {
      toastError(err);
    }
  };
  const pictureUrl = async (u: string) => {
    if (!e) return;
    try {
      const p = await pictureFromUrl(u);
      e.insert([e.picture(p.src, p.w)]);
    } catch (err) {
      toastError(err);
    }
  };
  const askPicture = () => {
    if (!onAsk || !st || !model) return;
    const s = scopesOf(model, st).find((x) => x.id === 'picture');
    if (s) onAsk(s.lead);
  };

  const outline = (
    <nav className="space-y-px p-2" translate="no">
      {heads.length ? (
        heads.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => {
              setMenu(null);
              e?.focusBlock(h.id);
            }}
            className={cx(
              'block w-full truncate rounded-md py-1 pr-2 text-left text-[12.5px] transition-colors hover:bg-bg-2 hover:text-fg',
              h.id === current ? 'bg-bg-2 font-medium text-fg' : 'text-fg-2',
              h.level <= 1 && 'font-medium',
            )}
            style={{ paddingLeft: 8 + Math.max(0, h.level - 1) * 12 }}
          >
            {h.text}
          </button>
        ))
      ) : (
        <p translate="yes" className="px-2 py-1 text-[12.5px] leading-relaxed text-fg-3">
          Headings you add show here, to go to them.
        </p>
      )}
    </nav>
  );

  const pageSetup = (
    <div className="space-y-3 p-3">
      <div className="space-y-1.5">
        <div className="text-[12px] text-fg-3">Paper size</div>
        <Segmented
          size="sm"
          value={model.page.size}
          onChange={(v) => e?.setDoc({ page: { ...model.page, size: v } })}
          options={(Object.keys(PAPERS) as (keyof typeof PAPERS)[]).map((k) => ({ value: k, label: PAPERS[k].label }))}
        />
      </div>
      <div className="space-y-1.5">
        <div className="text-[12px] text-fg-3">Margins</div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={String(MARGINS.find((m) => Math.abs(m.mm - model.page.margin) < 0.05)?.mm ?? '')}
            onChange={(v) => e?.setDoc({ page: { ...model.page, margin: Number(v) } })}
            options={MARGINS.map((m) => ({ value: String(m.mm), label: m.label }))}
          />
          <NumInput value={model.page.margin} onChange={(v) => e?.setDoc({ page: { ...model.page, margin: v } })} min={5} max={60} step={1} unit="mm" label="Margins" className="w-[84px] shrink-0" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-[12px] text-fg-3">Font</div>
          <Select value={model.font} title="The document’s font" onChange={(v) => e?.setDoc({ font: v })} options={FONTS.map((f) => ({ value: f.name, label: f.name, style: { fontFamily: f.css } }))} />
        </div>
        <div className="w-[96px] shrink-0 space-y-1.5">
          <div className="text-[12px] text-fg-3">Size</div>
          <NumInput value={model.size} onChange={(v) => e?.setDoc({ size: v })} min={6} max={72} step={0.5} unit="pt" label="The document’s size" className="w-full" />
        </div>
      </div>
      <p className="text-[11.5px] leading-relaxed text-fg-3">Headings and the title are sized from the document’s size. The PDF and Word files use this paper.</p>
    </div>
  );

  return (
    <div ref={root} className="flex h-full min-h-0 flex-col bg-bg">
      <style>{css}</style>
      <div className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">{lead}</div>
        <IconButton
          ref={outlineRef}
          label={wideOutline ? (outlineOpen ? 'Hide the outline' : 'Show the outline') : 'Outline'}
          active={wideOutline ? outlineOpen : menu === 'outline'}
          onClick={() => (wideOutline ? setOutlineOpen((o) => !o) : setMenu(menu === 'outline' ? null : 'outline'))}
        >
          <ListTree size={16} />
        </IconButton>
        {!readOnly && (
          <IconButton ref={pageRef} label="Page setup" active={menu === 'page'} onClick={() => setMenu(menu === 'page' ? null : 'page')}>
            <FileCog size={16} />
          </IconButton>
        )}
        {tail}
      </div>
      {band}
      {!readOnly && st && e && (
        <div className="flex h-11 shrink-0 items-center overflow-x-auto border-b border-line bg-panel px-2 [&::-webkit-scrollbar]:hidden">
          <Toolbar engine={e} st={st} doc={model} linking={linking} setLinking={setLinking} linkRef={linkRef} onPicture={() => void pickPicture()} onPictureUrl={(u) => void pictureUrl(u)} />
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        {wideOutline && outlineOpen && (
          <aside className="w-[220px] shrink-0 overflow-y-auto border-r border-line bg-panel">
            <div className="px-4 pt-3 pb-1 text-[11.5px] font-medium text-fg-3">Outline</div>
            {outline}
          </aside>
        )}
        <div className={cx('min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain', narrow ? 'bg-white' : 'bg-bg-2')}>
          <div className={narrow ? 'min-h-full' : 'px-6 pt-6 pb-[40vh]'}>
            <div ref={host} className={cx('relative mx-auto', narrow && 'min-h-full')} style={{ width: narrow ? '100%' : paperPx(model) }}>
              <div ref={paper} className="nd-ed nd-doc" />
              {st?.picked && e && <Picked engine={e} block={st.picked} host={host} tick={`${width}:${fonts}:${narrow}`} readOnly={readOnly} onReplace={(id) => void replacePicture(id)} onAsk={onAsk ? askPicture : undefined} />}
              {float?.ask && (
                <button
                  type="button"
                  data-keeps-editing
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    const s = st && scopesOf(model, st).find((x) => x.id === 'words');
                    if (s) onAsk?.(s.lead);
                  }}
                  className="absolute z-20 flex h-8 items-center gap-1.5 rounded-full border border-line bg-elevated px-3 text-[12.5px] font-medium text-fg shadow-lg hover:bg-bg-2"
                  style={{ left: float.ask.x, top: float.ask.y, transform: `translate(-50%, ${phone ? '0' : '-100%'})` }}
                >
                  <Sparkles size={13} className="text-accent" />
                  Ask the agent about it
                </button>
              )}
              {float?.link && st?.link && (
                <div
                  data-keeps-editing
                  onMouseDown={(ev) => ev.target instanceof HTMLAnchorElement || ev.preventDefault()}
                  className="absolute z-20 flex max-w-[min(420px,calc(100%-16px))] items-center gap-1 rounded-xl border border-line bg-elevated py-1 pr-1 pl-2.5 shadow-lg"
                  style={{ left: float.link.x, top: float.link.y }}
                >
                  <a href={st.link} target="_blank" rel="noopener noreferrer" translate="no" className="min-w-0 truncate text-[12.5px] text-accent hover:underline">
                    {st.link.replace(/^mailto:/i, '')}
                  </a>
                  <IconButton label="Open the link" size="sm" onClick={() => window.open(st.link!, '_blank', 'noopener,noreferrer')}>
                    <ExternalLink size={14} />
                  </IconButton>
                  <IconButton label="Change the link" size="sm" onClick={() => setLinking({ url: st.link ?? '', text: '' })}>
                    <Link2 size={14} />
                  </IconButton>
                  <IconButton label="Remove the link" size="sm" onClick={() => e?.link(null)}>
                    <Unlink size={14} />
                  </IconButton>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute right-3 bottom-1.5 rounded-md bg-bg/80 px-1.5 text-[11px] text-fg-3 tabular-nums">
          {`${words.toLocaleString(LOCALE)} word${words === 1 ? '' : 's'}`}
        </div>
      </div>
      {dirty && !readOnly && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2 pb-[max(8px,var(--safe-bottom))]">
          <span className="min-w-0 flex-1 text-[12.5px] text-fg-2">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warn align-middle" />
            Not saved yet{savedNote ? <span className="text-fg-3"> · {savedNote}</span> : null}
          </span>
          <Button size="sm" variant="ghost" onClick={discard} disabled={saving}>
            Discard
          </Button>
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={saving || !onSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
      <Popover anchor={pageRef} open={menu === 'page'} onClose={() => setMenu(null)} align="end" width={300} title="Page setup">
        {pageSetup}
      </Popover>
      <Popover anchor={outlineRef} open={menu === 'outline' && !wideOutline} onClose={() => setMenu(null)} align="end" width={280} title="Outline">
        <div className="max-h-[min(60vh,440px)] overflow-y-auto">{outline}</div>
      </Popover>
      {confirmNode}
    </div>
  );
}
