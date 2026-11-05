// Export → arXiv package (.zip), for a LaTeX document of the Library: what it will do, ticked (comments out, only the
// files the paper uses, the .bbl in and the .bib out; \iffalse blocks, one file and \pdfoutput when asked), then Make
// the package: it is made from the saved version and typeset as it is, to see it builds, and downloads. What it holds,
// what was left out or renamed, whether it typeset, and what to know before uploading (its size against arXiv's 50 MB,
// the processor to pick) stay in the dialog, with Download again. The choices are remembered on this device.
import { useState } from 'react';
import { CircleAlert, Download, FileArchive, TriangleAlert } from 'lucide-react';
import { ARXIV_DEFAULTS, ARXIV_OPTIONS, type ArxivOptions, type ArxivPackage } from '@shared/latex-submit';
import { Button, cx, Dialog, Throbber } from '../../../components/ui';
import { saveBlob } from '../exportFile';
import { closeArxiv } from './arxivAsk';
import { arxivUrl, makeArxiv } from './paper';

const KEY = 'wa.tex.arxiv';

function loadOptions(): ArxivOptions {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ArxivOptions> | null;
    return { ...ARXIV_DEFAULTS, ...(kept ?? {}) };
  } catch {
    return { ...ARXIV_DEFAULTS };
  }
}

const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function ArxivDialog({ page, version }: { page: string; version?: number }) {
  const [opts, setOpts] = useState<ArxivOptions>(loadOptions);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<ArxivPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const download = async (p: ArxivPackage) => {
    const res = await fetch(arxivUrl(p.token), { credentials: 'same-origin' });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `${res.status} ${res.statusText}`);
    saveBlob(await res.blob(), p.name);
    setDownloaded(true);
  };
  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(KEY, JSON.stringify(opts));
      const p = await makeArxiv({ page, version, options: opts });
      setMade(p);
      // One that does not typeset is not downloaded on its own: its errors come first.
      if (p.compiled.missing || p.compiled.pages > 0) await download(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={closeArxiv}
      title="arXiv package"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={closeArxiv}>
            Close
          </Button>
          {made ? (
            <Button variant="primary" icon={<Download size={14} />} onClick={() => void download(made).catch((e) => setError((e as Error).message))}>
              {downloaded ? 'Download again' : 'Download'}
            </Button>
          ) : (
            <Button variant="primary" icon={busy ? <Throbber className="h-4 w-4" /> : <FileArchive size={14} />} disabled={busy} onClick={() => void make()}>
              {busy ? 'Making it' : 'Make the package'}
            </Button>
          )}
        </>
      }
    >
      {!made ? (
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-fg-2">
            A .zip of the {version ? `version ${version}` : 'saved version'} to upload to arXiv, which publishes the source as it is sent. It is typeset first, as arXiv would, to see it builds.
          </p>
          <ul className="space-y-1">
            {ARXIV_OPTIONS.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-bg-2">
                  <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={opts[o.id]} disabled={busy} onChange={(e) => setOpts((x) => ({ ...x, [o.id]: e.target.checked }))} />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] text-fg">{o.label}</span>
                    <span className="block text-[12px] leading-snug text-fg-3">{o.hint}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-fg-3">Names with spaces get dashes, and the source follows.</p>
          {error && <p className="rounded-lg bg-err/10 px-3 py-2 text-[13px] text-err">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3 text-[13px]">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span translate="no" className="font-medium text-fg">
              {made.name}
            </span>
            <span className="text-fg-3">
              {size(made.bytes)} · {made.files.length} file{made.files.length === 1 ? '' : 's'} ·{' '}
              {made.compiled.missing ? 'not typeset here' : made.compiled.pages ? `typesets to ${made.compiled.pages} page${made.compiled.pages === 1 ? '' : 's'}` : 'does not typeset'}
            </span>
          </div>
          {made.compiled.errors.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-err/10 px-3 py-2 text-[12.5px] text-err">
              {made.compiled.errors.map((e, i) => (
                <li key={i} className="flex gap-1.5">
                  <CircleAlert size={13} className="mt-0.5 shrink-0" />
                  <span>
                    {e.file && (
                      <span translate="no" className="font-mono">
                        {e.file}
                        {e.line ? `:${e.line}` : ''}:{' '}
                      </span>
                    )}
                    {e.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {made.warnings.length > 0 && (
            <ul className="space-y-1.5">
              {made.warnings.map((w) => (
                <li key={w} className="flex gap-1.5 text-fg-2">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warn" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
          {(made.removed.length > 0 || made.renamed.length > 0) && (
            <div>
              <div className="mb-1 text-[12px] font-medium text-fg-3">Left out or changed</div>
              <ul className="list-disc space-y-0.5 pl-5 text-[12.5px] text-fg-2">
                {made.removed.map((r) => (
                  <li key={r}>{r}</li>
                ))}
                {made.renamed.map(([a, b]) => (
                  <li key={a}>
                    <span translate="no" className="font-mono text-[12px]">
                      {a}
                    </span>{' '}
                    is now{' '}
                    <span translate="no" className="font-mono text-[12px]">
                      {b}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" className="text-[12.5px] text-accent hover:underline" onClick={() => setList((x) => !x)}>
            {list ? 'Hide what is in it' : 'What is in it'}
          </button>
          {list && (
            <ul className={cx('max-h-56 overflow-y-auto rounded-xl border border-line px-3 py-2 font-mono text-[12px] text-fg-2')} translate="no">
              {made.files.map((f) => (
                <li key={f.name} className="flex justify-between gap-3">
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-fg-3">{size(f.bytes)}</span>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="rounded-lg bg-err/10 px-3 py-2 text-[13px] text-err">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}
