// The plugin editor, for the plugins you make (and those you use from a folder): what it is, its skills
// (written here, or copied from yours), its tool servers (a program to start, or an address), what it needs
// (Python and Node packages, programs, keys, other plugins, downloads), files of its own, and instructions
// for every agent. Saved as an Agent Plugins 1.0 folder; Pack into a .zip makes the file to share.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, FilePlus2, Plus, Trash2, Upload } from 'lucide-react';
import { composeSkill, parseSkill, SKILL_CATEGORIES, type SkillLibrary } from '@shared/skillpack';
import { PLUGIN_FILE_LIMITS, type PluginDraft, type PluginJob } from '@shared/plugins';
import { api, del, enc, post, put } from '../../lib/api';
import { bytes } from '../../lib/format';
import { mu } from '../../lib/machine';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, IconButton, inputCls, MenuItem, Popover, Segmented, Tabs, Throbber, useConfirm } from '../../components/ui';
import { PLUGIN_ICONS, PluginTile } from './parts';

type Tab = 'about' | 'skills' | 'tools' | 'needs' | 'files' | 'instructions';
type Server = PluginDraft['servers'][number];

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] leading-snug text-fg-3">{hint}</span>}
    </label>
  );
}

const lines = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
const pairs = (s: string, sep: '=' | ':') =>
  Object.fromEntries(
    lines(s)
      .map((l) => {
        const i = l.indexOf(sep);
        return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null;
      })
      .filter((x): x is [string, string] => !!x),
  );
const readBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error ?? new Error('The file could not be read'));
    r.readAsDataURL(f);
  });

/** One skill of the plugin, in plain fields. */
function SkillForm({ initial, onDone, onCancel }: { initial?: { name: string; text: string }; onDone: (s: { name: string; text: string }) => void; onCancel: () => void }) {
  const fm = initial ? parseSkill(initial.text) : null;
  const [name, setName] = useState(initial?.name ?? '');
  const [desc, setDesc] = useState(fm?.description ?? '');
  const [category, setCategory] = useState(fm?.category ?? '');
  const [body, setBody] = useState(fm?.body.replace(/^\s*\n/, '') ?? '');
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return (
    <div className="space-y-3 rounded-xl border border-line bg-bg-1 p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" hint={slug && slug !== name ? `Saved as ${slug}` : undefined}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={!!initial} placeholder="packing-list" autoFocus={!initial} />
        </Field>
        <Field label="Group">
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Other skills</option>
            {Object.entries(SKILL_CATEGORIES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="When to use it">
        <textarea className={cx(inputCls, 'h-14 resize-y py-2')} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Use when packing for a trip…" />
      </Field>
      <Field label="Instructions" hint="Markdown. ${PLUGIN_ROOT} is the plugin’s folder and ${PLUGIN_DATA} its data folder: agents see the real paths.">
        <textarea className={cx(inputCls, 'h-56 resize-y py-2 font-mono text-[12.5px] leading-relaxed')} value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={!slug || desc.trim().length < 10 || body.trim().length < 20} onClick={() => onDone({ name: slug, text: composeSkill({ name: slug, description: desc, category: category || undefined, body }) })}>
          {initial ? 'Keep' : 'Add skill'}
        </Button>
      </div>
    </div>
  );
}

/** One tool server: a program this computer starts, or an address. */
function ServerForm({ initial, onDone, onCancel }: { initial?: Server; onDone: (s: Server) => void; onCancel: () => void }) {
  const [type, setType] = useState<Server['type']>(initial?.type ?? 'stdio');
  const [name, setName] = useState(initial?.name ?? '');
  const [command, setCommand] = useState(initial?.type === 'stdio' ? initial.command : '');
  const [args, setArgs] = useState(initial?.type === 'stdio' ? initial.args.join('\n') : '');
  const [env, setEnv] = useState(initial?.type === 'stdio' ? Object.entries(initial.env).map(([k, v]) => `${k}=${v}`).join('\n') : '');
  const [url, setUrl] = useState(initial?.type === 'streamable-http' ? initial.url : '');
  const [headers, setHeaders] = useState(initial?.type === 'streamable-http' ? Object.entries(initial.headers).map(([k, v]) => `${k}: ${v}`).join('\n') : '');
  const ok = /^[A-Za-z0-9][\w.-]{0,63}$/.test(name.trim()) && (type === 'stdio' ? !!command.trim() : /^https?:\/\//.test(url.trim()));
  return (
    <div className="space-y-3 rounded-xl border border-line bg-bg-1 p-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          size="sm"
          value={type}
          onChange={setType}
          options={[
            { value: 'stdio', label: 'A program here' },
            { value: 'streamable-http', label: 'An address' },
          ]}
        />
        <input className={cx(inputCls, 'h-8.5 max-w-[220px]')} value={name} onChange={(e) => setName(e.target.value)} placeholder="Its name: weather" disabled={!!initial} />
      </div>
      {type === 'stdio' ? (
        <>
          <Field label="Command" hint="One program: a name on this computer (python3, node, npx) or ./a/file inside the plugin. Never a whole shell line.">
            <input className={cx(inputCls, 'font-mono text-[13px]')} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="python3" spellCheck={false} />
          </Field>
          <Field label="Arguments, one per line" hint="${PLUGIN_ROOT}/server.py reaches a file in the plugin.">
            <textarea className={cx(inputCls, 'h-20 resize-y py-2 font-mono text-[12.5px]')} value={args} onChange={(e) => setArgs(e.target.value)} placeholder={'${PLUGIN_ROOT}/files/server.py'} spellCheck={false} />
          </Field>
          <Field label="Environment, NAME=value per line" hint="Not for secrets: name the keys it needs under Needs, and they are given to it from your vault.">
            <textarea className={cx(inputCls, 'h-16 resize-y py-2 font-mono text-[12.5px]')} value={env} onChange={(e) => setEnv(e.target.value)} placeholder="LOG_LEVEL=info" spellCheck={false} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Address" hint="An MCP server’s Streamable HTTP address: https, or http on this computer.">
            <input className={cx(inputCls, 'font-mono text-[13px]')} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" spellCheck={false} />
          </Field>
          <Field label="Headers, Name: value per line" hint="Not for secrets: anyone with the plugin sees them.">
            <textarea className={cx(inputCls, 'h-16 resize-y py-2 font-mono text-[12.5px]')} value={headers} onChange={(e) => setHeaders(e.target.value)} spellCheck={false} />
          </Field>
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!ok}
          onClick={() =>
            onDone(
              type === 'stdio'
                ? { name: name.trim(), type, command: command.trim(), args: lines(args), env: pairs(env, '=') }
                : { name: name.trim(), type, url: url.trim(), headers: pairs(headers, ':') },
            )
          }
        >
          {initial ? 'Keep' : 'Add'}
        </Button>
      </div>
    </div>
  );
}

function ListRow({ title, sub, onEdit, onRemove }: { title: ReactNode; sub?: ReactNode; onEdit?: () => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left" disabled={!onEdit}>
        <div translate="no" className="truncate text-[13.5px] font-medium">
          {title}
        </div>
        {sub && <div className="truncate text-[12px] text-fg-3">{sub}</div>}
      </button>
      <IconButton label="Remove" size="sm" onClick={onRemove}>
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
}

export function PluginEditor({ name, onClose, onSaved }: { name: string; onClose: () => void; onSaved: (job?: PluginJob) => void }) {
  const [d, setD] = useState<PluginDraft | null>(null);
  const [tab, setTab] = useState<Tab>('about');
  const [form, setForm] = useState<{ kind: 'skill' | 'server'; index: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [mine, setMine] = useState<{ name: string; description: string }[] | null>(null);
  const [copyMenu, setCopyMenu] = useState(false);
  const copyAt = useRef<HTMLButtonElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [ask, askNode] = useConfirm();
  const leave = async () => {
    if (!dirty || (await ask({ title: 'Leave without saving?', body: 'Your changes to this plugin are lost.', confirm: 'Leave', danger: true }))) onClose();
  };
  // Needs, as text people write.
  const [pip, setPip] = useState('');
  const [npm, setNpm] = useState('');
  const [commands, setCommands] = useState('');
  const [keys, setKeys] = useState('');
  const [plugins, setPlugins] = useState('');
  const [downloads, setDownloads] = useState('');
  useEffect(() => {
    api<PluginDraft>(`/api/plugins/${enc(name)}/draft`).then((x) => {
      setD(x);
      setPip(x.requires.pip.join('\n'));
      setNpm(
        Object.entries(x.requires.npm)
          .map(([n, v]) => `${n}@${v}`)
          .join('\n'),
      );
      setCommands(x.requires.commands.map((c) => c.name).join('\n'));
      setKeys(x.requires.keys.map((k) => k.name).join('\n'));
      setPlugins(x.requires.plugins.map((p) => (p.range === '*' ? p.name : `${p.name}@${p.range}`)).join('\n'));
      setDownloads(x.requires.files.map((f) => `${f.url} ${f.path}`).join('\n'));
    }, toastError);
  }, [name]);
  const change = (p: Partial<PluginDraft>) => {
    setD((x) => (x ? { ...x, ...p } : x));
    setDirty(true);
  };
  const need = (set: (v: string) => void) => (v: string) => {
    set(v);
    setDirty(true);
  };

  const save = async () => {
    if (!d) return;
    setBusy(true);
    try {
      const npmMap = Object.fromEntries(
        lines(npm).map((l) => {
          const at = l.lastIndexOf('@');
          return at > 0 ? [l.slice(0, at), l.slice(at + 1) || '*'] : [l, '*'];
        }),
      );
      const requires = {
        plugins: Object.fromEntries(
          lines(plugins).map((l) => {
            const [n, r] = l.split('@');
            return [n.trim(), (r ?? '*').trim() || '*'];
          }),
        ),
        pip: lines(pip),
        npm: npmMap,
        commands: lines(commands),
        keys: lines(keys).map((k) => k.toUpperCase()),
        files: lines(downloads).map((l) => {
          const [url, path] = l.split(/\s+/);
          return { url, path: path || url.split('/').pop() || 'file' };
        }),
      };
      const r = await put<{ draft: PluginDraft; job?: PluginJob }>(`/api/plugins/${enc(name)}/draft`, { ...d, requires });
      setD(r.draft);
      setDirty(false);
      toast(r.job ? `Saved ${d.title}: setting it up…` : `Saved ${d.title}`, 'ok');
      onSaved(r.job);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    for (const f of Array.from(list)) {
      if (f.size > PLUGIN_FILE_LIMITS.file) {
        toast(`${f.name} is over ${PLUGIN_FILE_LIMITS.file >> 20} MB`, 'error');
        continue;
      }
      try {
        const r = await post<{ files: PluginDraft['files'] }>(`/api/plugins/${enc(name)}/files`, { name: f.name, data: await readBase64(f) });
        setD((x) => (x ? { ...x, files: r.files } : x));
      } catch (e) {
        toastError(e);
      }
    }
  };
  const removeFile = async (file: string) => {
    try {
      const r = await del<{ files: PluginDraft['files'] }>(`/api/plugins/${enc(name)}/files?name=${enc(file)}`);
      setD((x) => (x ? { ...x, files: r.files } : x));
    } catch (e) {
      toastError(e);
    }
  };
  const copySkill = async (n: string) => {
    setCopyMenu(false);
    try {
      const doc = await api<{ text: string }>(`/api/skillpack/skills/${enc(n)}`);
      if (d?.skills.some((s) => s.name === n)) return toast(`${n} is in it already`, 'error');
      change({ skills: [...(d?.skills ?? []), { name: n, text: doc.text }] });
    } catch (e) {
      toastError(e);
    }
  };
  const openCopy = () => {
    setCopyMenu((o) => !o);
    if (!mine)
      api<SkillLibrary>('/api/skillpack').then(
        (l) => setMine(l.skills.filter((s) => s.source === 'learned').map((s) => ({ name: s.name, description: s.description }))),
        () => setMine([]),
      );
  };

  return (
    <Dialog
      open
      onClose={leave}
      width={840}
      title={
        d ? (
          <span className="flex min-w-0 items-center gap-2.5">
            <PluginTile p={d} size={28} />
            <span translate="no" className="truncate">
              {d.title}
            </span>
          </span>
        ) : (
          name
        )
      }
      footer={
        <>
          <Button variant="ghost" icon={<Download size={14} />} onClick={() => (location.href = mu(`/api/plugins/${enc(name)}/export`))} disabled={dirty} title={dirty ? 'Save first' : 'A .zip anyone can add to Hydor, or use with other tools that read Agent Plugins'}>
            Pack into a .zip
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={leave}>
            Close
          </Button>
          <Button variant="primary" onClick={save} disabled={!d || busy || !dirty}>
            {busy ? <Throbber /> : 'Save'}
          </Button>
        </>
      }
    >
      {!d ? (
        <div className="flex justify-center py-10">
          <Throbber size={26} />
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <Tabs
            value={tab}
            onChange={(t) => (setTab(t), setForm(null))}
            className="border-b border-line"
            options={[
              { value: 'about', label: 'About' },
              { value: 'skills', label: 'Skills', count: d.skills.length },
              { value: 'tools', label: 'Tools', count: d.servers.length },
              { value: 'needs', label: 'Needs' },
              { value: 'files', label: 'Files', count: d.files.length },
              { value: 'instructions', label: 'Instructions' },
            ]}
          />
          {tab === 'about' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <Field label="Name people see">
                  <input className={inputCls} value={d.title} onChange={(e) => change({ title: e.target.value })} />
                </Field>
                <Field label="Version" hint="Raise it when you share a new one">
                  <input className={cx(inputCls, 'font-mono')} value={d.version} onChange={(e) => change({ version: e.target.value })} />
                </Field>
              </div>
              <Field label="What it is for">
                <textarea className={cx(inputCls, 'h-20 resize-y py-2')} value={d.description} onChange={(e) => change({ description: e.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Group">
                  <select className={inputCls} value={d.category ?? ''} onChange={(e) => change({ category: e.target.value || undefined })}>
                    <option value="">None</option>
                    {Object.entries(SKILL_CATEGORIES).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Picture">
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(PLUGIN_ICONS).map(([k, Icon]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => change({ icon: k })}
                        title={k}
                        className={cx('flex h-8 w-8 items-center justify-center rounded-lg transition-colors', (d.icon ?? 'puzzle') === k ? 'bg-accent/15 text-accent ring-1 ring-accent/40' : 'text-fg-3 hover:bg-bg-2 hover:text-fg')}
                      >
                        <Icon size={15} />
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              <p className="text-[12px] leading-relaxed text-fg-3">
                Its id is <span className="font-mono">{d.name}</span>. It is saved in the open Agent Plugins format, so its skills and tools also work in other tools that read it (VS Code, Cursor, Codex,
                OpenHands…).
              </p>
            </div>
          )}
          {tab === 'skills' && (
            <div className="space-y-2">
              <p className="text-[12.5px] text-fg-3">Written methods agents load when a task calls for one. Every agent gets them while the plugin is on.</p>
              <div className="divide-y divide-line">
                {d.skills.map((s, n) =>
                  form?.kind === 'skill' && form.index === n ? (
                    <SkillForm
                      key={s.name}
                      initial={s}
                      onCancel={() => setForm(null)}
                      onDone={(x) => (change({ skills: d.skills.map((y, m) => (m === n ? x : y)) }), setForm(null))}
                    />
                  ) : (
                    <ListRow key={s.name} title={s.name} sub={parseSkill(s.text).description} onEdit={() => setForm({ kind: 'skill', index: n })} onRemove={() => change({ skills: d.skills.filter((_, m) => m !== n) })} />
                  ),
                )}
              </div>
              {form?.kind === 'skill' && form.index === null ? (
                <SkillForm onCancel={() => setForm(null)} onDone={(x) => (d.skills.some((y) => y.name === x.name) ? toast(`A skill named ${x.name} is in it already`, 'error') : (change({ skills: [...d.skills, x] }), setForm(null)))} />
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" icon={<Plus size={14} />} onClick={() => setForm({ kind: 'skill', index: null })}>
                    Write a skill
                  </Button>
                  <Button ref={copyAt} size="sm" variant="ghost" icon={<FilePlus2 size={14} />} onClick={openCopy}>
                    Copy one of yours
                  </Button>
                  <Popover anchor={copyAt} open={copyMenu} onClose={() => setCopyMenu(false)} width={300}>
                    {!mine ? (
                      <div className="flex justify-center py-3">
                        <Throbber />
                      </div>
                    ) : mine.length ? (
                      mine.map((s) => (
                        <MenuItem key={s.name} onClick={() => copySkill(s.name)}>
                          <span translate="no">{s.name}</span>
                        </MenuItem>
                      ))
                    ) : (
                      <p className="px-3 py-2 text-[12.5px] text-fg-3">You have no skills of your own yet.</p>
                    )}
                  </Popover>
                </div>
              )}
            </div>
          )}
          {tab === 'tools' && (
            <div className="space-y-2">
              <p className="text-[12.5px] text-fg-3">MCP servers that give agents tools: a program this computer starts (from the plugin’s files, or a package it needs), or a server at an address.</p>
              <div className="divide-y divide-line">
                {d.servers.map((s, n) =>
                  form?.kind === 'server' && form.index === n ? (
                    <ServerForm key={s.name} initial={s} onCancel={() => setForm(null)} onDone={(x) => (change({ servers: d.servers.map((y, m) => (m === n ? x : y)) }), setForm(null))} />
                  ) : (
                    <ListRow
                      key={s.name}
                      title={s.name}
                      sub={s.type === 'stdio' ? [s.command, ...s.args].join(' ') : s.url}
                      onEdit={() => setForm({ kind: 'server', index: n })}
                      onRemove={() => change({ servers: d.servers.filter((_, m) => m !== n) })}
                    />
                  ),
                )}
              </div>
              {form?.kind === 'server' && form.index === null ? (
                <ServerForm onCancel={() => setForm(null)} onDone={(x) => (d.servers.some((y) => y.name === x.name) ? toast(`A server named ${x.name} is in it already`, 'error') : (change({ servers: [...d.servers, x] }), setForm(null)))} />
              ) : (
                <Button size="sm" icon={<Plus size={14} />} onClick={() => setForm({ kind: 'server', index: null })}>
                  Add a tool server
                </Button>
              )}
            </div>
          )}
          {tab === 'needs' && (
            <div className="space-y-4">
              <p className="text-[12.5px] text-fg-3">What it needs to work. Packages and downloads go in the plugin’s own data folder when it is set up; programs and keys are checked, and missing ones shown.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Python packages, one per line" hint="In an environment of its own: pandas>=2.2">
                  <textarea className={cx(inputCls, 'h-24 resize-y py-2 font-mono text-[12.5px]')} value={pip} onChange={(e) => need(setPip)(e.target.value)} spellCheck={false} />
                </Field>
                <Field label="Node packages, one per line" hint="In a folder of its own: name@version">
                  <textarea className={cx(inputCls, 'h-24 resize-y py-2 font-mono text-[12.5px]')} value={npm} onChange={(e) => need(setNpm)(e.target.value)} spellCheck={false} />
                </Field>
                <Field label="Programs on this computer" hint="One per line: ffmpeg, git…">
                  <textarea className={cx(inputCls, 'h-20 resize-y py-2 font-mono text-[12.5px]')} value={commands} onChange={(e) => need(setCommands)(e.target.value)} spellCheck={false} />
                </Field>
                <Field label="Keys from your vault" hint="One per line, like WEATHER_API_KEY: its tool servers get them">
                  <textarea className={cx(inputCls, 'h-20 resize-y py-2 font-mono text-[12.5px]')} value={keys} onChange={(e) => need(setKeys)(e.target.value)} spellCheck={false} />
                </Field>
                <Field label="Other plugins" hint="One per line: media-tools, or media-tools@^1.0">
                  <textarea className={cx(inputCls, 'h-20 resize-y py-2 font-mono text-[12.5px]')} value={plugins} onChange={(e) => need(setPlugins)(e.target.value)} spellCheck={false} />
                </Field>
                <Field label="Files to download" hint="One per line: an https address, a space, and where it goes in the data folder">
                  <textarea className={cx(inputCls, 'h-20 resize-y py-2 font-mono text-[12.5px]')} value={downloads} onChange={(e) => need(setDownloads)(e.target.value)} spellCheck={false} />
                </Field>
              </div>
            </div>
          )}
          {tab === 'files' && (
            <div className="space-y-2">
              <p className="text-[12.5px] text-fg-3">
                Files it carries with it (data, templates, scripts, pictures), kept in its files folder and packed with it. Its skills and tools reach them at ${'{'}PLUGIN_ROOT{'}'}/files. Added and removed at once.
              </p>
              <div className="divide-y divide-line">
                {d.files.map((f) => (
                  <ListRow key={f.name} title={f.name} sub={bytes(f.bytes)} onRemove={() => removeFile(f.name)} />
                ))}
              </div>
              <Button size="sm" icon={<Upload size={14} />} onClick={() => upload.current?.click()}>
                Add files
              </Button>
              <input ref={upload} type="file" multiple className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
            </div>
          )}
          {tab === 'instructions' && (
            <Field label="Instructions for every agent" hint="Added to each agent’s own instructions while the plugin is on. Keep them short: what the plugin is for, and when to use its tools.">
              <textarea className={cx(inputCls, 'h-64 resize-y py-2 text-[13.5px] leading-relaxed')} value={d.instructions} onChange={(e) => change({ instructions: e.target.value })} />
            </Field>
          )}
        </div>
      )}
      {askNode}
    </Dialog>
  );
}
