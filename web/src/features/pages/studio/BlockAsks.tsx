// What the page editor's newer blocks ask the app for (server/pages/writing-blocks.ts asks, the frame passes it on), chosen
// beside where it was asked (a sheet from the bottom on a phone): an Embed's address (a map, a Google Doc, Figma,
// Spotify, CodePen, Loom… shown as its own player or viewer; YouTube and Vimeo as a video), a Bookmark's link (the
// server reads its title, description and picture), a File, a Sound or a PDF (kept for pages by the app, up to 50 MB),
// a Diagram written in Mermaid (drawn light and dark as it is typed), and a Chart (from a database of the page, or a
// small table of its own). Their answers go back to their place; a block's menu (⋮⋮) asks again to change it.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AppWindow, BarChart3, Bookmark, FileText, GitFork, Music, Paperclip, PanelTop, Route, Upload } from 'lucide-react';
import { embedOf } from '@shared/page-blocks';
import { videoEmbed } from '@shared/app-media';
import { post } from '../../../lib/api';
import { Button, cx, Popover, Segmented, SheetsOnPhone, Throbber } from '../../../components/ui';
import type { EdAsk } from '../frame';
import { keepPageFile } from './pageAi';
import { videoStill } from './Inserts';

export const BLOCK_ASKS = ['embed', 'bookmark', 'file', 'audio', 'pdf', 'mermaid', 'chart'] as const;

/** Add's Media: the newer blocks, each asked for in the page (it opens beside the part picked) or made there. */
export const MEDIA_BLOCKS: { id: string; label: string; icon: ReactNode }[] = [
  { id: 'embed', label: 'Embed', icon: <AppWindow size={17} /> },
  { id: 'bookmark', label: 'Bookmark', icon: <Bookmark size={17} /> },
  { id: 'file', label: 'File', icon: <Paperclip size={17} /> },
  { id: 'audio', label: 'Sound', icon: <Music size={17} /> },
  { id: 'pdf', label: 'PDF', icon: <FileText size={17} /> },
  { id: 'mermaid', label: 'Diagram', icon: <GitFork size={17} /> },
  { id: 'chart', label: 'Chart', icon: <BarChart3 size={17} /> },
  { id: 'tabs', label: 'Tabs', icon: <PanelTop size={17} /> },
  { id: 'crumbs', label: 'Breadcrumbs', icon: <Route size={17} /> },
];
export type BlockAsk = (typeof BLOCK_ASKS)[number];
const isBlockAsk = (w: string): w is BlockAsk => (BLOCK_ASKS as readonly string[]).includes(w);

const TITLES: Record<BlockAsk, string> = {
  embed: 'Embed a page, a map or a file',
  bookmark: 'A bookmark',
  file: 'A file',
  audio: 'A sound',
  pdf: 'A PDF',
  mermaid: 'A diagram in Mermaid',
  chart: 'A chart',
};
const WIDTHS: Record<BlockAsk, number> = { embed: 380, bookmark: 380, file: 320, audio: 320, pdf: 320, mermaid: 520, chart: 420 };
const fieldCls = 'h-8 w-full min-w-0 rounded-lg border border-line bg-bg-1 px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-3 focus:border-accent/60';
const selCls = 'h-8 min-w-0 rounded-lg border border-line bg-bg-1 px-2 text-[13px] text-fg outline-none focus:border-accent/60';

/** An address typed, sent with Enter or the button. */
function Address({ start = '', placeholder, button, onSend, busy }: { start?: string; placeholder: string; button: string; onSend: (url: string) => void; busy?: boolean }) {
  const [v, setV] = useState(start);
  const [err, setErr] = useState('');
  const send = () => {
    const url = v.trim();
    if (!url) return;
    if (!/^https?:\/\/\S+$/i.test(url)) return setErr('That is not a web address (https://…)');
    onSend(url);
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <input autoFocus value={v} onChange={(e) => (setV(e.target.value), setErr(''))} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), send())} placeholder={placeholder} aria-label="Address" spellCheck={false} className={fieldCls} />
        <Button size="sm" variant="primary" onClick={send} disabled={!v.trim() || busy}>
          {busy ? <Throbber size={13} /> : button}
        </Button>
      </div>
      {err && <p className="text-[12px] text-err">{err}</p>}
    </div>
  );
}

/** A file picked on this device, kept for pages. */
function FilePick({ accept, label, onKept, onError }: { accept: string; label: string; onKept: (f: { src: string; name: string; type: string; size: number }) => void; onError: (e: unknown) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" icon={busy ? <Throbber size={13} /> : <Upload size={14} />} disabled={!!busy} onClick={() => ref.current?.click()}>
        {busy ? `Adding ${busy}…` : label}
      </Button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(f.name);
          keepPageFile(f).then(
            (r) => onKept(r),
            (err) => (setBusy(''), onError(err)),
          );
        }}
      />
      <p className="text-[11.5px] leading-snug text-fg-3">Up to 50 MB. The page keeps its address; the file is kept by the app, and shows wherever the page opens.</p>
    </div>
  );
}

// ---- a diagram in Mermaid, drawn by the app's own Mermaid, light and dark -------------------------------------------------
type Mermaid = (typeof import('mermaid'))['default'];
let mermaidLib: Promise<Mermaid> | null = null;
let drawing: Promise<unknown> = Promise.resolve();
/** The diagram as two pictures (SVG), for a light page and a dark one; its words are words (no HTML labels). */
export function drawMermaid(code: string): Promise<{ light: string; dark: string }> {
  const run = async () => {
    const m = await (mermaidLib ??= import('mermaid').then((x) => x.default));
    const one = async (theme: 'default' | 'dark') => {
      m.initialize({ startOnLoad: false, securityLevel: 'strict', theme, flowchart: { htmlLabels: false }, fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif' });
      const { svg } = await m.render(`nmm${Math.random().toString(36).slice(2, 9)}`, code);
      return svg;
    };
    return { light: await one('default'), dark: await one('dark') };
  };
  // (one at a time: Mermaid's settings are its own, for every diagram)
  const p = drawing.then(run, run);
  drawing = p.catch(() => {});
  return p;
}

const SAMPLE = 'flowchart LR\n  A[Idea] --> B{Worth it?}\n  B -- Yes --> C[Plan it]\n  B -- No --> D[Drop it]';

function MermaidForm({ start, onDone }: { start: string; onDone: (a: { code: string; light: string; dark: string }) => void }) {
  const [code, setCode] = useState(start || SAMPLE);
  const [pic, setPic] = useState<{ code: string; light: string; dark: string } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      drawMermaid(code).then(
        (r) => live && (setPic({ code, ...r }), setErr('')),
        (e) => live && setErr(String((e as Error)?.message ?? e).split('\n')[0].slice(0, 200)),
      );
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [code]);
  const dark = document.documentElement.classList.contains('dark');
  return (
    <div className="space-y-2">
      <textarea
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && pic ? (e.preventDefault(), onDone(pic)) : undefined)}
        rows={6}
        spellCheck={false}
        aria-label="Mermaid"
        className="block w-full resize-y rounded-lg border border-line bg-bg-1 px-2.5 py-2 font-mono text-[12.5px] text-fg outline-none focus:border-accent/60"
      />
      <div translate="no" className="flex max-h-64 min-h-24 items-center justify-center overflow-auto rounded-lg bg-bg-2 p-2 [&_svg]:h-auto [&_svg]:max-w-full">
        {pic ? <span dangerouslySetInnerHTML={{ __html: dark ? pic.dark : pic.light }} /> : <Throbber size={18} />}
      </div>
      {err && <p className="text-[12px] text-err">{err}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-fg-3">Flowcharts, sequences, timelines, mind maps… · Ctrl+Enter</span>
        <Button size="sm" variant="primary" disabled={!pic || pic.code !== code || !!err} onClick={() => pic && onDone(pic)}>
          {start ? 'Change it' : 'Insert'}
        </Button>
      </div>
    </div>
  );
}

// ---- a chart: from a database of the page, or a small table --------------------------------------------------------------
interface DbInfo {
  name: string;
  title: string;
  cols: { name: string; kind: string }[];
}
function ChartForm({ start, dbs, onDone }: { start: string; dbs: DbInfo[]; onDone: (chart: Record<string, unknown>) => void }) {
  const was = (() => {
    try {
      return JSON.parse(start || '{}') as Record<string, any>;
    } catch {
      return {};
    }
  })();
  const [type, setType] = useState<string>(was.type ?? 'bar');
  const [source, setSource] = useState<string>(was.db ?? (was.rows ? '' : (dbs[0]?.name ?? '')));
  const db = dbs.find((d) => d.name === source);
  const [x, setX] = useState<string>(was.x ?? db?.cols.find((c) => c.kind === 'select')?.name ?? db?.cols[0]?.name ?? '');
  const [ys, setYs] = useState<string[]>(Array.isArray(was.y) ? was.y : []);
  const [how, setHow] = useState<string>(was.how ?? 'sum');
  const [title, setTitle] = useState<string>(was.title ?? '');
  const [table, setTable] = useState<string>(Array.isArray(was.rows) ? (was.rows as unknown[][]).map((r) => r.join(', ')).join('\n') : 'Month, Sales\nJan, 12\nFeb, 18\nMar, 15');
  const numbers = db?.cols.filter((c) => c.kind === 'number' || c.kind === 'formula') ?? [];
  const done = () => {
    if (db) return onDone({ type, db: db.name, x, ...(ys.length && how !== 'count' ? { y: ys } : {}), how: ys.length ? how : 'count', ...(title.trim() ? { title: title.trim() } : {}) });
    const rows = table
      .split('\n')
      .map((l) => l.split(/\t|,|;/).map((c) => c.trim()))
      .filter((r) => r.some(Boolean))
      .map((r, i) => (i ? r.map((c, k) => (k && c !== '' && Number.isFinite(Number(c.replace(',', '.'))) ? Number(c.replace(',', '.')) : c)) : r));
    onDone({ type, rows, ...(title.trim() ? { title: title.trim() } : {}) });
  };
  return (
    <div className="space-y-2.5 text-[12.5px]">
      <Segmented
        size="sm"
        value={type}
        onChange={setType}
        options={[
          { value: 'bar', label: 'Bars' },
          { value: 'line', label: 'Line' },
          { value: 'area', label: 'Area' },
          { value: 'pie', label: 'Pie' },
        ]}
      />
      <label className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-fg-3">Its numbers</span>
        <select value={source} onChange={(e) => setSource(e.target.value)} className={cx(selCls, 'flex-1')}>
          {dbs.map((d) => (
            <option key={d.name} value={d.name}>
              {d.title || d.name}
            </option>
          ))}
          <option value="">A small table of its own</option>
        </select>
      </label>
      {db ? (
        <>
          <label className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-fg-3">Grouped by</span>
            <select value={x} onChange={(e) => setX(e.target.value)} className={cx(selCls, 'flex-1')}>
              {db.cols.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-start gap-2">
            <span className="w-20 shrink-0 pt-1 text-fg-3">Numbers</span>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {numbers.length ? (
                numbers.map((c) => (
                  <label key={c.name} className="flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5">
                    <input type="checkbox" checked={ys.includes(c.name)} onChange={(e) => setYs((v) => (e.target.checked ? [...v, c.name] : v.filter((n) => n !== c.name)))} />
                    {c.name}
                  </label>
                ))
              ) : (
                <span className="pt-1 text-fg-3">No number columns: it counts the rows.</span>
              )}
            </div>
          </div>
          {ys.length > 0 && (
            <label className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-fg-3">Each group’s</span>
              <select value={how} onChange={(e) => setHow(e.target.value)} className={cx(selCls, 'flex-1')}>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="min">Smallest</option>
                <option value="max">Largest</option>
              </select>
            </label>
          )}
        </>
      ) : (
        <textarea value={table} onChange={(e) => setTable(e.target.value)} rows={5} spellCheck={false} aria-label="The table" className="block w-full resize-y rounded-lg border border-line bg-bg-1 px-2.5 py-2 font-mono text-[12.5px] text-fg outline-none focus:border-accent/60" />
      )}
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Its title (if any)" aria-label="Its title" className={fieldCls} />
      <div className="flex justify-end">
        <Button size="sm" variant="primary" onClick={done}>
          {start ? 'Change it' : 'Insert'}
        </Button>
      </div>
    </div>
  );
}

/** What a newer block asked for, beside where it was asked; its answer goes to the editor (`answer`). */
export function BlockAskPopover({ ask, frame, answer, onClose, onError }: { ask: EdAsk | null; frame: () => HTMLIFrameElement | null; answer: (payload: Record<string, unknown>) => void; onClose: () => void; onError: (e: unknown) => void }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    const f = frame();
    if (!ask || !isBlockAsk(ask.what) || !f) return setBox(null);
    const fr = f.getBoundingClientRect();
    const k = f.offsetWidth ? fr.width / f.offsetWidth : 1;
    const r = ask.rect ?? { x: 0, y: 0, w: f.offsetWidth, h: 0 };
    setBox({ left: fr.left + r.x * k, top: fr.top + r.y * k, width: Math.max(1, r.w * k), height: Math.max(1, r.h * k) });
    setBusy(false);
  }, [ask, frame]);
  if (!ask || !isBlockAsk(ask.what)) return null;
  const what = ask.what;
  const done = (payload: Record<string, unknown>) => {
    answer({ id: ask.id, ...payload });
    onClose();
  };
  let body: ReactNode = null;
  if (what === 'embed')
    body = (
      <div className="space-y-2 p-2">
        <Address
          start={ask.value}
          placeholder="https://… a map, a Google Doc, Figma, Spotify, a page"
          button={ask.value ? 'Change' : 'Embed'}
          onSend={(url) => {
            const play = videoEmbed(url);
            if (play) {
              const yt = /\/embed\/([\w-]{6,20})/.exec(play)?.[1];
              if (yt) return done({ src: play, url, kind: 'video', thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` });
              void videoStill(url).then((thumb) => done({ src: play, url, kind: 'video', thumb }));
              return;
            }
            const e = embedOf(url);
            if (e) done({ src: e.src, url, kind: e.kind, provider: e.provider });
          }}
        />
        <p className="text-[11.5px] leading-snug text-fg-3">Google Maps, Docs, Sheets and Slides, Figma, Spotify, CodePen, Loom, Miro, Airtable… or any page that lets itself be shown in others. YouTube and Vimeo come in as a video.</p>
      </div>
    );
  else if (what === 'bookmark')
    body = (
      <div className="space-y-2 p-2">
        <Address
          start={ask.value}
          busy={busy}
          placeholder="https://… a link to show as a card"
          button={ask.value ? 'Change' : 'Add'}
          onSend={(url) => {
            setBusy(true);
            post<Record<string, unknown>>('/api/pages/bookmark', { url }).then(
              (r) => done(r),
              (e) => (setBusy(false), onError(e)),
            );
          }}
        />
        <p className="text-[11.5px] leading-snug text-fg-3">The app reads the page’s title, description and picture for the card.</p>
      </div>
    );
  else if (what === 'file' || what === 'audio' || what === 'pdf')
    body = (
      <div className="p-2">
        <FilePick accept={what === 'audio' ? 'audio/*' : what === 'pdf' ? 'application/pdf,.pdf' : ''} label={what === 'audio' ? 'A sound from this device' : what === 'pdf' ? 'A PDF from this device' : 'A file from this device'} onKept={(f) => done(f)} onError={onError} />
      </div>
    );
  else if (what === 'mermaid')
    body = (
      <div className="p-2">
        <MermaidForm start={ask.value ?? ''} onDone={(m) => done({ code: m.code, light: m.light, dark: m.dark })} />
      </div>
    );
  else if (what === 'chart')
    body = (
      <div className="p-2">
        <ChartForm start={ask.value ?? ''} dbs={(ask.dbs ?? []) as DbInfo[]} onDone={(chart) => done({ chart })} />
      </div>
    );
  return (
    <SheetsOnPhone.Provider value>
      {box && createPortal(<div ref={anchor} aria-hidden className="pointer-events-none fixed" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />, document.body)}
      <Popover anchor={anchor} open={!!box} onClose={onClose} width={WIDTHS[what]} title={TITLES[what]}>
        {body}
      </Popover>
    </SheetsOnPhone.Provider>
  );
}
