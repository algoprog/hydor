// A plugin opened: what it gives agents (skills, tools, instructions), what it needs and whether each need is
// met (other plugins, packages, programs, downloads, keys), its own files, its README, and what you can do
// with it. The same summary shows before a plugin from a link, a file or a folder is added.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ChevronRight, Download, ExternalLink, FileText, FolderOpen, MoreHorizontal, PenLine, RefreshCw, Server, Sparkles, Trash2, Wrench, X } from 'lucide-react';
import type { PluginJob, PluginView } from '@shared/plugins';
import { api, enc, post } from '../../lib/api';
import { bytes, tildify } from '../../lib/format';
import { mu } from '../../lib/machine';
import { go, showInFiles } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Markdown } from '../../components/Markdown';
import { Button, cx, Dialog, IconButton, MenuItem, MenuSep, Popover, Switch, Throbber, useConfirm } from '../../components/ui';
import { JobView, PluginTile, sourceLabel } from './parts';

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg-2">
        <span className="text-fg-3">{icon}</span>
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Line({ ok, children, hint }: { ok?: boolean | null; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[13px] leading-snug">
      <span className="mt-0.5 flex w-4 shrink-0 justify-center">
        {ok === true ? <Check size={13} className="text-ok" /> : ok === false ? <X size={13} className="text-err" /> : <span className="mt-1.5 h-1 w-1 rounded-full bg-fg-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-fg">{children}</span>
        {hint && <span className="block text-[12px] text-fg-3">{hint}</span>}
      </span>
    </div>
  );
}

const AGENT_NAMES = { claude: 'Claude Code', codex: 'Codex', custom: 'Custom', acp: 'the others' } as const;

/** ">=3.10" as people say it: "Python 3.10 or newer". */
const pythonNeed = (r: string) => {
  const m = /^>=\s*([\d.]+)$/.exec(r.trim());
  return m ? `Python ${m[1]} or newer` : `Python ${r}`;
};

/** What a plugin gives and needs: shown in its details, and before adding one. */
export function PluginSummary({ p, titles = {} }: { p: PluginView; titles?: Record<string, string> }) {
  const r = p.requires;
  const servers = p.servers;
  const hasNeeds = r.plugins.length || r.pip.length || Object.keys(r.npm).length || r.commands.length || r.files.length || r.keys.length;
  return (
    <div className="space-y-4">
      <Block icon={<Sparkles size={13} />} title="What it gives agents">
        {p.skills.map((s) => (
          <Line key={s.name} hint={s.shadowedBy ? `Left out: agents get ${s.shadowedBy} instead` : s.description}>
            Skill <span translate="no" className="font-medium">{s.name}</span>
          </Line>
        ))}
        {servers.map((s) => (
          <Line key={s.name} ok={s.problem ? false : null} hint={s.problem ?? (s.url ? `Its address: ${s.url}` : `Runs ${[s.command, ...(s.args ?? [])].join(' ').replace(/\$\{PLUGIN_ROOT\}\//g, '')} on this computer`)}>
            Tools from <span translate="no" className="font-medium">{s.name}</span>
          </Line>
        ))}
        {p.instructions && <Line hint="Added to every agent’s own instructions while it is on">Instructions</Line>}
        {!p.skills.length && !servers.length && !p.instructions && <Line>Nothing yet</Line>}
        {p.claudeOnly.length > 0 && (
          <Line ok={false} hint="Install it from Claude Code’s own plugins to use those">
            Its {p.claudeOnly.join(', ')} are for Claude Code alone, and are left out here
          </Line>
        )}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[12px] text-fg-3">
          {p.agents.length === 4 ? 'For every agent:' : 'Only for'}
          {p.agents.map((a) => (
            <span key={a} className="inline-flex items-center gap-1">
              {(a === 'claude' || a === 'codex') && <AgentIcon agent={a} size={12} />}
              {AGENT_NAMES[a]}
            </span>
          ))}
        </p>
      </Block>
      {!!hasNeeds && (
        <Block icon={<Wrench size={13} />} title="What it needs">
          {r.plugins.map((d) => (
            <Line key={d.name} ok={p.installed ? !p.missing.plugins.includes(d.name) : null} hint={d.range !== '*' ? `Version ${d.range}` : undefined}>
              The plugin <span translate="no">{titles[d.name] ?? d.name}</span>
            </Line>
          ))}
          {r.pip.length > 0 && <Line hint={r.pip.join(', ')}>Python packages, in an environment of its own{r.python ? ` (${pythonNeed(r.python)})` : ''}</Line>}
          {Object.keys(r.npm).length > 0 && (
            <Line hint={Object.entries(r.npm)
              .map(([n, v]) => `${n} ${v}`)
              .join(', ')}>
              Node packages, in a folder of its own
            </Line>
          )}
          {r.files.map((f) => (
            <Line key={f.path} hint={`${f.url}${f.size ? ` · ${bytes(f.size)}` : ''}`}>
              Downloads {f.path}
            </Line>
          ))}
          {r.commands.map((c) => {
            const missing = p.missing.commands.includes(c.name);
            return (
              <Line key={c.name} ok={c.optional ? null : !missing} hint={missing || !p.installed ? c.hint : undefined}>
                <span className="font-mono text-[12.5px]">{c.name}</span> on this computer{c.optional ? ' (optional)' : missing ? ': not found' : ''}
              </Line>
            );
          })}
          {r.keys.map((k) => {
            const missing = p.missing.keys.includes(k.name);
            return (
              <Line
                key={k.name}
                ok={k.optional ? null : !missing}
                hint={
                  <>
                    {k.description}
                    {missing && (
                      <button type="button" onClick={() => go(`/apps/connected?tab=keys`)} className="ml-1 font-medium text-accent hover:underline">
                        Add it
                      </button>
                    )}
                  </>
                }
              >
                The key <span className="font-mono text-[12.5px]">{k.name}</span>
                {k.optional ? ' (optional)' : missing ? ': not saved yet' : ''}
              </Line>
            );
          })}
        </Block>
      )}
      {p.files.length > 0 && (
        <Block icon={<FileText size={13} />} title="Its own files">
          <div className="grid gap-x-4 gap-y-0.5 text-[12.5px] sm:grid-cols-2">
            {p.files.slice(0, 40).map((f) => (
              <div key={f.name} className="flex min-w-0 items-center justify-between gap-2">
                <span translate="no" className="truncate font-mono text-fg-2">
                  {f.name}
                </span>
                <span className="tnum shrink-0 text-fg-3">{bytes(f.bytes)}</span>
              </div>
            ))}
          </div>
        </Block>
      )}
      {p.problems.length > 0 && (
        <Block icon={<AlertTriangle size={13} />} title="Problems in its folder">
          {p.problems.map((x, n) => (
            <Line key={n} ok={false}>
              {x}
            </Line>
          ))}
        </Block>
      )}
    </div>
  );
}

/** A plugin's details, with what you can do: add it, turn it on or off, set it up again, update, change, pack, remove. */
export function PluginDetail({
  name,
  titles,
  installedNames,
  job,
  onClose,
  onEdit,
  onChanged,
}: {
  name: string;
  titles: Record<string, string>;
  /** The plugins installed here, to say which of those it needs come along. */
  installedNames: string[];
  job?: PluginJob;
  onClose: () => void;
  onEdit: (name: string) => void;
  onChanged: () => void;
}) {
  const home = useApp((s) => s.boot?.home);
  const [p, setP] = useState<PluginView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readme, setReadme] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuAt = useRef<HTMLButtonElement>(null);
  const [confirm, confirmNode] = useConfirm();
  const load = () =>
    api<PluginView>(`/api/plugins/${enc(name)}`).then(
      (v) => setP(v),
      (e: Error) => setError(e.message),
    );
  useEffect(() => {
    load();
  }, [name, job?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (what: 'add' | 'setup' | 'update') => {
    setBusy(true);
    try {
      if (what === 'add') await post<{ job: PluginJob }>('/api/plugins/install', { name });
      else await post<{ job: PluginJob }>(`/api/plugins/${enc(name)}/${what}`);
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const turn = async (on: boolean) => {
    if (!p) return;
    if (!on && p.dependents.length) {
      const names = p.dependents.map((d) => titles[d] ?? d).join(', ');
      const ok = await confirm({
        title: `Turn off ${p.title}?`,
        body: p.dependents.length === 1 ? `${names} needs it, and turns off too.` : `${names} need it, and turn off too.`,
        confirm: 'Turn off',
      });
      if (!ok) return;
    }
    try {
      const r = await post<{ on?: string[]; off?: string[] }>(`/api/plugins/${enc(name)}/${on ? 'enable' : 'disable'}`);
      const also = (r.on ?? r.off ?? []).filter((n) => n !== name).map((n) => titles[n] ?? n).join(', ');
      if (also) toast(on ? `Also turned on: ${also}` : `Also turned off: ${also}`, 'ok');
      load();
      onChanged();
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async () => {
    if (!p) return;
    const mine = p.source.kind === 'folder' && p.source.mine;
    const ok = await confirm({
      title: `Remove ${p.title}?`,
      body: (
        <>
          {p.dependents.length > 0 && (
            <p className="mb-2">
              {p.dependents.length === 1
                ? `${titles[p.dependents[0]] ?? p.dependents[0]} needs it, and is removed too.`
                : `${p.dependents.map((d) => titles[d] ?? d).join(', ')} need it, and are removed too.`}
            </p>
          )}
          <p>{mine ? 'You made it here: its folder is deleted. Pack it into a .zip first to keep a copy.' : p.source.kind === 'folder' ? 'Its folder stays where it is.' : 'Its packages and downloads are deleted too.'}</p>
        </>
      ),
      confirm: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await post(`/api/plugins/${enc(name)}/remove`, {});
      toast(`Removed ${p.title}`, 'ok');
      onChanged();
      onClose();
    } catch (e) {
      toastError(e);
    }
  };

  const running = job?.state === 'running';
  return (
    <Dialog
      open
      onClose={onClose}
      width={720}
      title={
        p ? (
          <span className="flex min-w-0 items-center gap-2.5">
            <PluginTile p={p} size={30} />
            <span translate="no" className="truncate">
              {p.title}
            </span>
            {p.version && <span className="shrink-0 text-[12.5px] font-normal text-fg-3">{p.version}</span>}
          </span>
        ) : (
          name
        )
      }
      footer={
        p && (
          <>
            {p.installed && (
              <>
                <IconButton ref={menuAt} label="More" onClick={() => setMenu((o) => !o)}>
                  <MoreHorizontal size={17} />
                </IconButton>
                <Popover anchor={menuAt} open={menu} onClose={() => setMenu(false)} prefer="above" width={250}>
                  {p.editable && (
                    <MenuItem icon={<PenLine size={14} />} onClick={() => (setMenu(false), onEdit(name))}>
                      Change it
                    </MenuItem>
                  )}
                  {p.source.kind === 'git' && (
                    <MenuItem icon={<RefreshCw size={14} />} onClick={() => (setMenu(false), act('update'))}>
                      Get the latest version
                    </MenuItem>
                  )}
                  {p.setup.state !== 'none' && (
                    <MenuItem icon={<Wrench size={14} />} onClick={() => (setMenu(false), act('setup'))}>
                      Set it up again
                    </MenuItem>
                  )}
                  <MenuItem icon={<Download size={14} />} onClick={() => (setMenu(false), (location.href = mu(`/api/plugins/${enc(name)}/export`)))}>
                    Pack into a .zip
                  </MenuItem>
                  <MenuItem icon={<FolderOpen size={14} />} onClick={() => (setMenu(false), onClose(), showInFiles(p.root))}>
                    Show its folder
                  </MenuItem>
                  <MenuSep />
                  <MenuItem icon={<Trash2 size={14} />} danger onClick={() => (setMenu(false), remove())}>
                    Remove
                  </MenuItem>
                </Popover>
                <span className="flex-1" />
              </>
            )}
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {!p.installed && (
              <Button variant="primary" onClick={() => act('add')} disabled={busy || running}>
                {busy ? <Throbber /> : 'Add'}
              </Button>
            )}
          </>
        )
      }
    >
      {error ? (
        <p className="py-3 text-[13.5px] text-fg-2">{error}</p>
      ) : !p ? (
        <div className="flex justify-center py-10">
          <Throbber size={26} />
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-fg-3">
            <span translate="no">{sourceLabel(p)}</span>
            {p.author && <span translate="no">by {p.author}</span>}
            {p.license && <span>{p.license}</span>}
            {p.homepage && (
              <a href={p.homepage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg hover:underline">
                Website <ExternalLink size={11} />
              </a>
            )}
            <span className="flex-1" />
            {p.installed && (
              <span className="flex items-center gap-2 text-fg-2">
                {p.enabled ? 'On for every agent' : 'Off'}
                <Switch on={p.enabled} onChange={turn} label={p.enabled ? `Turn ${p.title} off` : `Turn ${p.title} on`} />
              </span>
            )}
          </div>
          {p.description && (
            <p translate={p.source.kind === 'builtin' ? undefined : 'no'} className="text-[14px] leading-relaxed text-fg-2">
              {p.description}
            </p>
          )}
          {job && <JobView job={job} title={p.title} />}
          {!job && p.setup.state === 'failed' && (
            <div className="flex items-start gap-2 rounded-xl border border-err/35 bg-err/5 px-3.5 py-2.5 text-[13px]">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-err" />
              <span className="min-w-0 flex-1 break-words">Setting it up failed{p.setup.error ? `: ${p.setup.error}` : ''}</span>
              <Button size="sm" onClick={() => act('setup')} disabled={busy}>
                Try again
              </Button>
            </div>
          )}
          {!job && p.installed && p.setup.state === 'outdated' && (
            <div className="flex items-center gap-2 rounded-xl border border-warn/35 bg-warn/8 px-3.5 py-2.5 text-[13px]">
              <AlertTriangle size={15} className="shrink-0 text-warn" />
              <span className="flex-1">What it needs changed: set it up again to use it.</span>
              <Button size="sm" onClick={() => act('setup')} disabled={busy}>
                Set up
              </Button>
            </div>
          )}
          <PluginSummary p={p} titles={titles} />
          {p.readme && (
            <section>
              <button type="button" onClick={() => setReadme((o) => !o)} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg-2 hover:text-fg">
                <ChevronRight size={13} className={cx('transition-transform', readme && 'rotate-90')} />
                About it
              </button>
              {readme && (
                <div className="mt-2 rounded-xl border border-line bg-bg-1 px-4 py-3" translate="no">
                  <Markdown text={p.readme.replace(/^# .*\n+/, '')} className="text-[13.5px]" />
                </div>
              )}
            </section>
          )}
          {p.installed && (
            <p className="flex flex-wrap gap-x-3 font-mono text-[11.5px] text-fg-3">
              <span className="inline-flex items-center gap-1" title="Its folder (PLUGIN_ROOT)">
                <Server size={11} /> {tildify(p.root, home)}
              </span>
              {p.setup.state !== 'none' && (
                <span className="inline-flex items-center gap-1" title="Its data folder (PLUGIN_DATA)">
                  <FolderOpen size={11} /> {tildify(p.data, home)}
                </span>
              )}
            </p>
          )}
          {!p.installed && p.requires.plugins.some((d) => !installedNames.includes(d.name)) && (
            <p className="text-[12.5px] text-fg-3">
              Adding it adds{' '}
              {p.requires.plugins
                .filter((d) => !installedNames.includes(d.name))
                .map((d) => titles[d.name] ?? d.name)
                .join(', ')}{' '}
              first.
            </p>
          )}
        </div>
      )}
      {confirmNode}
    </Dialog>
  );
}
