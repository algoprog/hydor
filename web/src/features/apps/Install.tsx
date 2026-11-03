// A template from a file and to a file: the link on the New template page that installs one (after a card
// saying what it is, in plain terms, and what it will do here), the dialog that downloads one, and the line on
// a template's page that says how the packages it needs stand.
import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Download, FileUp } from 'lucide-react';
import type { AppDef } from '@shared/apps';
import type { EnvView, InstallPreview } from '@shared/app-manifest';
import { enc, post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, Switch } from '../../components/ui';
import { AppAbout } from './About';
import { appPath, fileToBase64, money } from './api';
import { AppKeys, emptyKeys, keysBody, type KeyInput } from './AppKeys';

/** "2.4 MB". */
const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-[13.5px]">
      <span className="w-[136px] shrink-0 text-fg-3">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

/** The model each one it asks for becomes here: its own name, another model of yours, or "" for the default. */
type Picks = Record<string, string>;

/**
 * What a template from a file is and will do here, before it is installed: in plain terms first (what it asks,
 * what you get, how it works, whether agents may run it), then what it uses here, folded unless something needs a look.
 */
function PreviewCard({ p, picks, onPick, agents, onAgents, keys, onKeys }: { p: InstallPreview; picks: Picks; onPick: (key: string, value: string) => void; agents: boolean; onAgents: (on: boolean) => void; keys: KeyInput; onKeys: (k: KeyInput) => void }) {
  const needs = [...p.needs.node.map((n) => `${n} (Node)`), ...p.needs.python.map((n) => `${n} (Python)`)];
  // Models to pick, commands missing or warnings open the details by themselves.
  const [open, setOpen] = useState(() => p.models.some((m) => m.status === 'missing' || m.status === 'matched') || p.needs.missing.length > 0 || p.warnings.length > 0);
  return (
    <div className="space-y-3">
      {p.problems.length > 0 && (
        <div className="rounded-xl border border-err/40 bg-err/10 px-3 py-2 text-[13px]">
          <div className="font-medium">It cannot be installed:</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {p.problems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      <AppAbout name={p.name} description={p.description} icon={p.icon} color={p.color} category={p.category} origin={p.builtin ? 'Ready-made' : 'From a file'} summary={p.summary} agents={agents} onAgents={onAgents} />
      {(p.secrets ?? []).length > 0 && <AppKeys keys={p.secrets} input={keys} onChange={onKeys} later own className="rounded-2xl border border-line px-4 py-3" />}
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-xl px-1 py-1 text-left text-[13px] font-medium text-fg-2 hover:text-fg" aria-expanded={open}>
        <ChevronRight size={15} className={cx('shrink-0 text-fg-3 transition-transform', open && 'rotate-90')} />
        What it uses here
      </button>
      {open && (
        <div className="divide-y divide-line rounded-xl border border-line px-3">
          <Line label="Who does the work">{p.agents.join(', ') || '—'}</Line>
          <Line label="What it does">{p.steps ? `${p.steps} steps` : 'One agent does the task'}</Line>
          {(p.files ?? []).length > 0 && (
            <Line label="Its own files">
              <span translate="no">{p.files.map((f) => f.name).join(', ')}</span>
              <div className="text-fg-3">{`${p.files.length} ${p.files.length === 1 ? 'file' : 'files'}, ${size(p.files.reduce((n, f) => n + f.bytes, 0))}: kept with it, for its view and answers`}</div>
            </Line>
          )}
          {(p.view?.widgets ?? []).length > 0 && (
            <Line label="Its view’s scripts">
              <span translate="no">{p.view.widgets.join(', ')}</span>
              {p.view.libs.length > 0 && (
                <div className="text-fg-3">
                  {'Loads '}
                  <span translate="no">{p.view.libs.join(', ')}</span>
                  {' from jsDelivr'}
                </div>
              )}
            </Line>
          )}
          {p.screens.length > 0 && (
            <Line label="Its screens">
              <span translate="no">{p.screens.join(', ')}</span>
            </Line>
          )}
          <Line label="Tools it may use">{p.tools === null ? 'All of the app’s tools' : p.tools.length ? p.tools.join(', ') : 'None of the app’s tools'}</Line>
          {p.models.length > 0 && (
            <Line label="Models it uses">
              {p.models.map((m) => {
                const key = `${m.agent}:${m.as}`;
                return (
                  <div key={key} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5">
                    <span translate="no">{m.label}</span>
                    {m.status === 'here' ? (
                      <span className="text-fg-3">· set up here</span>
                    ) : m.status === 'provider' ? (
                      <span className="text-fg-3">· through OpenRouter, added to your models when it first runs</span>
                    ) : (
                      <>
                        <span className={m.status === 'missing' ? 'text-warn' : 'text-fg-3'}>{m.status === 'missing' ? '· not set up here; use' : '· here as'}</span>
                        <select className="rounded-md border border-line bg-bg-1 px-1.5 py-0.5 text-[12.5px]" value={picks[key] ?? m.use ?? ''} onChange={(e) => onPick(key, e.target.value)}>
                          <option value="">{m.agent === 'custom' ? 'The default model' : 'Its default model'}</option>
                          {m.options.map((o) => (
                            <option key={o.value} value={o.value} translate="no">
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                );
              })}
            </Line>
          )}
          {p.bundled.length > 0 && (
            <Line label="Comes with">
              {p.bundled.map((b) => (
                <div key={b.from || b.name}>
                  <span translate="no">{b.name}</span> <span className="text-fg-3">· {b.installs === 'reuse' ? 'you have it: used again' : 'installed too'}</span>
                </div>
              ))}
            </Line>
          )}
          {needs.length > 0 && (
            <Line label="It installs">
              <span translate="no">{needs.join(', ')}</span>
              <div className="text-fg-3">In a folder of its own, not for the whole computer</div>
            </Line>
          )}
          {p.needs.commands.length > 0 && (
            <Line label="Commands it uses">
              {p.needs.commands.map((c) => (
                <div key={c}>
                  <span className={cx('font-mono text-[12.5px]', p.needs.missing.includes(c) && 'text-warn')} translate="no">
                    {c}
                  </span>
                  {p.needs.missing.includes(c) && <span className="text-warn"> (not on this computer)</span>}
                </div>
              ))}
            </Line>
          )}
          {p.data.length > 0 && (
            <Line label="What it keeps">
              {p.data.map((d) => (
                <div key={d.name}>
                  <span translate="no">{d.name}</span>
                  {d.records > 0 && <span className="text-fg-3"> {`(${d.records} records)`}</span>}
                </div>
              ))}
            </Line>
          )}
          {p.memory && <Line label="Memory">Remembers across its runs, in a memory of its own</Line>}
          {(p.limits.capUsd || p.limits.runsPerDay) && (
            <Line label="Limits">
              {p.limits.capUsd && <div>{`${money(p.limits.capUsd)} a run at most`}</div>}
              {p.limits.runsPerDay && <div>{`${p.limits.runsPerDay} runs a day`}</div>}
            </Line>
          )}
        </div>
      )}
      {p.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-fg-2">
          {p.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {p.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-warn">
          {p.warnings.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The largest app file, as the server takes it. */
const MAX_FILE = 160 << 20;

/** Opens the install card for a file from elsewhere (one dropped on the Apps page). */
export interface InstallHandle {
  open: (f: File) => void;
}

/** "Install a template from a file": picks a .hydor-app or .json, shows what it will do, installs it. */
/** `trigger`: what opens the file picker, in place of the usual link (a menu item, say); none: only `open`. */
export const InstallFromFile = forwardRef<InstallHandle, { trigger?: (open: () => void) => ReactNode }>(function InstallFromFile({ trigger }, handle) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);
  const [preview, setPreview] = useState<InstallPreview | null>(null);
  const [picks, setPicks] = useState<Picks>({});
  const [agents, setAgents] = useState(true);
  const [keys, setKeys] = useState<KeyInput>(emptyKeys);
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE) return toast(`An app file is at most ${MAX_FILE >> 20} MB`, 'error');
    if (!/\.(hydor-app|naget-app|zip|json)$/i.test(f.name)) return toast('That is not an app file (.hydor-app or .json)', 'error');
    try {
      const sent = { name: f.name, data: await fileToBase64(f) };
      const r = await post<{ preview: InstallPreview }>('/api/apps/install/check', { file: sent });
      setFile(sent);
      setPicks({});
      setAgents(true);
      setKeys(emptyKeys());
      setPreview(r.preview);
    } catch (e) {
      toastError(e);
    }
  };
  useImperativeHandle(handle, () => ({ open: (f: File) => void pick(f) }));
  const install = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await post<{ app?: AppDef; builtin?: string }>('/api/apps/install', { file, models: picks, ...(preview?.summary.sessions ? { agents } : {}), ...keysBody(keys) });
      const needs = preview && preview.needs.node.length + preview.needs.python.length > 0;
      toast(r.builtin ? 'Installed again' : needs ? 'Installed. What it needs is installing; its first run waits for it.' : 'Installed', 'ok');
      go(appPath(r.app ? r.app.id : `tpl:${r.builtin}`));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const close = () => (setPreview(null), setFile(null));
  return (
    <>
      {trigger !== undefined ? (
        trigger(() => input.current?.click())
      ) : (
        <button type="button" onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg">
          <FileUp size={14} />
          Install an app from a file
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept=".hydor-app,.zip,.json,application/json,application/zip"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <Dialog
        open={!!preview}
        onClose={close}
        title="Install this app?"
        width={600}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={install} disabled={busy || !!preview?.problems.length}>
              Install
            </Button>
          </>
        }
      >
        {preview && <PreviewCard p={preview} picks={picks} onPick={(k, v) => setPicks((x) => ({ ...x, [k]: v }))} agents={agents} onAgents={setAgents} keys={keys} onKeys={setKeys} />}
      </Dialog>
    </>
  );
});

/** Downloads a template as a .hydor-app; one that keeps data asks whether its records go too. */
export function DownloadDialog({ app, open, onClose }: { app: AppDef; open: boolean; onClose: () => void }) {
  const [records, setRecords] = useState(false);
  const download = () => {
    const a = document.createElement('a');
    a.href = `/api/apps/${enc(app.id)}/export${records ? '?data=1' : ''}`;
    a.download = `${app.slug}.hydor-app`;
    document.body.append(a);
    a.click();
    a.remove();
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Download as a file"
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Download size={14} />} onClick={download}>
            Download
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13.5px]">
        <p className="text-fg-2">One file with everything it does and needs, and the apps its steps call, to keep or to install on another Hydor. Its folder, keys and public page stay here.</p>
        {app.data && (
          <label className="flex items-center justify-between gap-3">
            <span>Include the records it keeps</span>
            <Switch on={records} onChange={setRecords} label="Include the records it keeps" />
          </label>
        )}
      </div>
    </Dialog>
  );
}

/** How the packages a template needs stand, when there is something to say: installing, failed, a command missing. */
export function EnvLine({ appId, env, onChange }: { appId: string; env: EnvView; onChange: () => void }) {
  const [log, setLog] = useState(false);
  if (env.state === 'none' || env.state === 'ready') {
    if (!env.missing.length) return null;
    const list = env.missing.join(', ');
    return <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-2.5 text-[13px]">{env.missing.length > 1 ? `It uses ${list}, which are not on this computer: install them, or the steps that use them fail.` : `It uses ${list}, which is not on this computer: install it, or the steps that use it fail.`}</div>;
  }
  const again = () => post<{ env: EnvView }>(`/api/apps/${enc(appId)}/env`).then(onChange, toastError);
  return (
    <div className={cx('rounded-xl border px-4 py-2.5 text-[13px]', env.state === 'failed' ? 'border-err/40 bg-err/10' : 'border-line bg-bg-1')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex-1">
          {env.state === 'installing' ? 'Installing what it needs (its Node and Python packages); its runs wait for it.' : env.state === 'failed' ? `What it needs could not be installed: ${env.error ?? ''}` : 'What it needs has changed: it installs before the next run.'}
        </span>
        {env.log && (
          <button type="button" className="text-fg-3 hover:text-fg" onClick={() => setLog((o) => !o)}>
            {log ? 'Hide the output' : 'Show the output'}
          </button>
        )}
        {env.state !== 'installing' && (
          <Button size="sm" variant="ghost" onClick={again}>
            Install again
          </Button>
        )}
      </div>
      {log && env.log && <pre className="mt-2 max-h-[260px] overflow-auto rounded-lg bg-bg-2 p-2 font-mono text-[11.5px] whitespace-pre-wrap">{env.log}</pre>}
    </div>
  );
}
