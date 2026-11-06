// A plot from data: what to plot (a few examples to start from), the data (what the editor gives, such as a table's
// cells or a chart's series; pasted; or a CSV, TSV or JSON file), its shape, and in a deck for the web the version
// that moves and answers the pointer too. Its code is written by Claude (or the helper model) and run on this
// computer. Then the plot, "Change it" in words (the code is changed to match), and the code itself, folded, to read,
// change and Run again; Use it.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileUp, Play } from 'lucide-react';
import type { PlotAnswer, PlotAsk, TiersInfo } from '@shared/images';
import type { CellEditorHandle } from '../../../lib/codemirror';
import { Button, cx, Dialog, inputCls, Switch } from '../../../components/ui';
import { getTiers, makePlotNow } from './api';
import { describeData, MAX_DATA, plotSize, SHAPES } from './logic';
import { Choice, Label, PriceLine, Problem, ShapeMark, Shown, Words, Working } from './parts';
import { shownSrc } from './pictures';
import type { MadePlot, PlotOpts } from './store';

const PLOT_SHAPES = SHAPES.filter((s) => ['16:9', '3:2', '1:1'].includes(s.value));
const EXAMPLES = ['Monthly sales as bars, 2025 against 2026', 'How ages are spread, as a histogram', 'sin(x) and cos(x) from 0 to 2π'];
const GIVEN_EXAMPLES = ['Each column as a line', 'Bars for each row', 'The first two columns as a scatter'];

function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

/** The plot's Python, in the app's code editor (Ctrl+Enter runs it again). */
function CodeBox({ code, onChange, onRun }: { code: string; onChange: (c: string) => void; onRun: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<CellEditorHandle | null>(null);
  const dark = useDark();
  const latest = useRef({ onChange, onRun });
  latest.current = { onChange, onRun };
  useEffect(() => {
    let alive = true;
    import('../../../lib/codemirror').then(async ({ createCellEditor }) => {
      if (!alive || !host.current) return;
      const h = await createCellEditor(host.current, {
        doc: code,
        lang: 'python',
        dark,
        onChange: (c) => latest.current.onChange(c),
        onRun: () => latest.current.onRun(),
        onEscape: () => {},
        onSave: () => {},
        onEdge: () => false,
      });
      if (!alive) return h.destroy();
      handle.current = h;
    });
    return () => {
      alive = false;
      handle.current?.destroy();
      handle.current = null;
    };
    // The editor owns the code while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => handle.current?.setDark(dark), [dark]);
  return <div ref={host} translate="no" className="max-h-[38dvh] min-h-24 overflow-auto rounded-xl border border-line bg-bg" />;
}

export function MakePlot({ o, onDone }: { o: PlotOpts; onDone: (p: MadePlot | null) => void }) {
  const given = o.data?.trim() ? o.data : '';
  const [request, setRequest] = useState('');
  const [data, setData] = useState(given);
  const [file, setFile] = useState<string | null>(null);
  const [showData, setShowData] = useState(!given);
  const [aspect, setAspect] = useState('16:9');
  const [interactive, setInteractive] = useState(!!o.interactive);
  const [tiers, setTiers] = useState<TiersInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<PlotAnswer | null>(null);
  const [code, setCode] = useState(o.code ?? '');
  const [codeOpen, setCodeOpen] = useState(!!o.code);
  const [codeEdited, setCodeEdited] = useState(false);
  // A new answer's code goes into a fresh editor.
  const [codeRev, setCodeRev] = useState(0);
  const [change, setChange] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const stop = useRef(new AbortController());

  useEffect(() => {
    getTiers().then(setTiers, () => {});
    const c = stop.current;
    return () => c.abort();
  }, []);

  const size = o.w && o.h ? { w: Math.round(o.w), h: Math.round(o.h) } : plotSize(aspect, o.w);
  const about = describeData(data);
  const writer = tiers?.writer ?? 'Claude';

  /** Asks for the plot: made new, changed as the words say, or its code run as it is now. */
  const ask = async (how: 'new' | 'change' | 'run') => {
    if (busy) return;
    const base: PlotAsk = { request: request.trim() || change.trim() || 'A plot of this data', data: data.trim() ? data.slice(0, MAX_DATA) : undefined, theme: o.theme, w: size.w, h: size.h, format: 'svg', interactive: interactive || undefined };
    const body: PlotAsk = how === 'new' ? (o.code ? { ...base, code: o.code, change: request.trim() || undefined } : base) : how === 'change' ? { ...base, code: made?.code ?? code, change: change.trim() } : { ...base, code };
    setError(null);
    setBusy(how === 'run' ? 'Running the code' : how === 'change' ? 'Changing the code and drawing it again' : `${writer} is writing the code, then it runs here: up to a minute`);
    try {
      const r = await makePlotNow(body, stop.current.signal);
      setMade(r);
      setCode(r.code);
      setCodeEdited(false);
      setCodeRev((n) => n + 1);
      if (how === 'change') setChange('');
    } catch (e) {
      if (!stop.current.signal.aborted) setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const readFile = (f: File) => {
    if (f.size > MAX_DATA) return setError(`That file is over ${MAX_DATA / 1000} KB: a plot takes a smaller piece of it`);
    f.text().then(
      (t) => {
        setData(t);
        setFile(f.name);
        setError(null);
      },
      () => setError('That file could not be read'),
    );
  };

  const footer = made ? (
    <>
      <Button variant="ghost" onClick={() => onDone(null)}>
        Cancel
      </Button>
      <Button variant="primary" disabled={!!busy} onClick={() => onDone({ ...made, prompt: request.trim() || undefined })}>
        Use it
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={() => onDone(null)}>
        Cancel
      </Button>
      <Button variant="primary" disabled={!!busy || (!request.trim() && !o.code)} onClick={() => void ask('new')}>
        {busy ? 'Making it' : o.code ? 'Make it again' : 'Make the plot'}
      </Button>
    </>
  );

  return (
    <Dialog open onClose={() => onDone(null)} title="A plot" width={600} footer={footer}>
      <div className="space-y-3">
        {made ? (
          <>
            <Shown src={shownSrc(made.src)} alt={request} className="max-h-[40dvh]" bg={o.theme?.bg ?? '#ffffff'} />
            {made.html && <PriceLine>With a version that moves and answers the pointer, for the slideshow.</PriceLine>}
            {made.notes && (
              <p translate="no" className="text-[12.5px] leading-snug text-fg-2">
                {made.notes}
              </p>
            )}
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (change.trim()) void ask('change');
              }}
            >
              <input value={change} onChange={(e) => setChange(e.target.value)} disabled={!!busy} placeholder="Change it: “bigger labels”, “a line instead of bars”" aria-label="What to change" className={cx(inputCls, 'h-9 text-[13.5px]')} />
              <Button type="submit" size="sm" variant="secondary" disabled={!!busy || !change.trim()}>
                Change it
              </Button>
            </form>
          </>
        ) : (
          <>
            <Words
              value={request}
              onChange={setRequest}
              label="What to plot"
              placeholder={o.code ? 'What to change in it, or nothing to draw it again as it is' : 'What to plot: “monthly sales as bars, 2025 against 2026”'}
              examples={o.code ? [] : given ? GIVEN_EXAMPLES : EXAMPLES}
              rows={2}
              disabled={!!busy}
            />
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Label>The data</Label>
                {given && data === given && !file && <span className="text-[12px] text-fg-2">{o.dataFrom ?? 'From where it goes'}</span>}
                {file && (
                  <span translate="no" className="max-w-[12rem] truncate text-[12px] text-fg-2">
                    {file}
                  </span>
                )}
                {about && <span className="text-[12px] text-fg-3">{about}</span>}
                <span className="flex-1" />
                {given && (
                  <button type="button" className="text-[12.5px] text-accent hover:underline" onClick={() => setShowData((s) => !s)}>
                    {showData ? 'Hide the data' : 'Show the data'}
                  </button>
                )}
                <Button size="sm" variant="ghost" icon={<FileUp size={14} />} disabled={!!busy} onClick={() => fileRef.current?.click()}>
                  A file
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  accept=".csv,.tsv,.json,.txt,text/csv,text/tab-separated-values,application/json,text/plain"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) readFile(f);
                  }}
                />
              </div>
              {showData && (
                <textarea
                  value={data}
                  onChange={(e) => (setData(e.target.value), setFile(null))}
                  rows={4}
                  disabled={!!busy}
                  spellCheck={false}
                  aria-label="The data"
                  placeholder={'Paste the data, if it needs any: CSV, TSV or JSON\nmonth,2025,2026\nJan,12,15'}
                  className="block w-full resize-y rounded-xl border border-line-2 bg-bg-1 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent/60"
                />
              )}
            </div>
            <div className="-mx-2 flex flex-wrap items-center gap-x-1 gap-y-1">
              {!(o.w && o.h) && <Choice label="Shape" value={aspect} options={PLOT_SHAPES.map((s) => ({ ...s, icon: <ShapeMark aspect={s.value} /> }))} onChange={setAspect} width={220} disabled={!!busy} />}
              {o.interactive !== undefined && (
                <label className="flex items-center gap-2.5 px-2 text-[13px] text-fg-2">
                  <Switch on={interactive} onChange={setInteractive} label="Also a version that moves, for the slideshow" disabled={!!busy} />
                  Also a version that moves, for the slideshow
                </label>
              )}
            </div>
          </>
        )}
        {(made || o.code) && (
          <div className="space-y-2">
            <button type="button" onClick={() => setCodeOpen((x) => !x)} className="flex items-center gap-1 text-[12.5px] font-medium text-fg-2 hover:text-fg">
              {codeOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              The code (Python)
            </button>
            {codeOpen && (
              <>
                <CodeBox
                  key={codeRev}
                  code={code}
                  onChange={(c) => {
                    setCode(c);
                    setCodeEdited(true);
                  }}
                  onRun={() => void ask('run')}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" icon={<Play size={13} />} disabled={!!busy || !code.trim() || (!!made && !codeEdited)} onClick={() => void ask('run')}>
                    Run again
                  </Button>
                  <span className="text-[12px] text-fg-3">Runs on this computer · Ctrl+Enter</span>
                </div>
              </>
            )}
          </div>
        )}
        {error && <Problem error={error} onLeave={() => onDone(null)} />}
        {busy ? <Working>{busy}</Working> : !made && <PriceLine>{`Its code is written by ${writer}, then it runs on this computer.`}</PriceLine>}
      </div>
    </Dialog>
  );
}
