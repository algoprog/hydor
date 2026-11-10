// Settings → Memory → Bring in: what other assistants know about you, as notes here (server/memory/bringin). Pick
// what was found on this computer (Claude Code, Codex, Hermes, OpenClaw, pi, Atomic Agent) and exports from ChatGPT or
// Claude; the helper model reads them and proposes notes and lines for your profile; you pick what to keep. The reading
// goes on with the dialog closed, and opening it again shows where it is. Beside it: the skills you made in Hermes,
// OpenClaw, pi and Atomic Agent, listed first and copied into your own skills when you pick them.
// Also opened by the setup tour's "Coming from another agent?" step (features/tour).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FileArchive, Import, Laptop, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { Button, cx, Dialog, IconButton, Throbber } from '../../components/ui';
import { api, del, post } from '../../lib/api';
import { tildify } from '../../lib/format';
import { mu } from '../../lib/machine';
import { toast, toastError } from '../../lib/store';
import { folderName } from './state';
import { LOCALE } from '../../i18n/locale';

interface Source {
  id: string;
  name: string;
  memory: number;
  projects: number;
  own?: string;
}
interface ExportFile {
  id: string;
  name: string;
  size: number;
  kind?: 'chatgpt' | 'claude';
  chats?: number;
  memory?: boolean;
  from?: number;
  to?: number;
}
interface Proposal {
  id: number;
  text: string;
  title?: string;
  scope: 'global' | 'repo';
  scopeKey: string;
  source: string;
}
interface Job {
  state: 'reading' | 'ready' | 'failed' | 'stopped';
  done: number;
  total: number;
  missed: number;
  error?: string;
  sources: string[];
  notes: Proposal[];
  profile?: { added: string[] };
}
interface FoundSkill {
  id: string;
  source: string;
  where?: string;
  name: string;
  description: string;
  files: number;
  left: string[];
  skip?: string;
}
interface SkillResult {
  name: string;
  status: 'copied' | 'skipped';
  reason?: string;
}
interface BringInState {
  sources: Source[];
  files: ExportFile[];
  job: Job | null;
}

/** Parts an export goes up in: well under what a proxy in front of the app takes in one request. */
const CHUNK = 32 * 1024 * 1024;

function sendPart(url: string, blob: Blob, onProgress: (n: number) => void): Promise<{ file?: ExportFile }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      let body: { error?: string; file?: ExportFile } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error ?? `HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(blob);
  });
}

async function sendExport(file: File, onProgress: (sent: number) => void): Promise<ExportFile> {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let offset = 0;
  let out: ExportFile | undefined;
  do {
    const end = Math.min(file.size, offset + CHUNK);
    const q = new URLSearchParams({ id, name: file.name, offset: String(offset), final: end >= file.size ? '1' : '0' });
    const base = offset;
    out = (await sendPart(mu(`/api/memory/bring-in/file?${q}`), file.slice(offset, end), (n) => onProgress(base + n))).file;
    offset = end;
  } while (offset < file.size);
  if (!out) throw new Error('The export did not arrive whole');
  return out;
}

const month = (t?: number) => (t ? new Date(t).toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' }) : '');

/** What an export holds, in a sentence of its own for each case (so each is translated whole). */
function fileDetail(f: ExportFile): string {
  const n = f.chats ?? 0;
  const count = n.toLocaleString(LOCALE);
  const span = f.from && f.to ? `${month(f.from)} – ${month(f.to)}` : '';
  if (f.kind === 'chatgpt') {
    if (f.memory && n) return span ? `ChatGPT: your custom instructions and ${count} chat${n === 1 ? '' : 's'} (${span})` : `ChatGPT: your custom instructions and ${count} chat${n === 1 ? '' : 's'}`;
    if (f.memory) return 'ChatGPT: your custom instructions';
    return span ? `ChatGPT: ${count} chat${n === 1 ? '' : 's'} (${span})` : `ChatGPT: ${count} chat${n === 1 ? '' : 's'}`;
  }
  if (f.memory && n) return span ? `Claude: its memory and ${count} chat${n === 1 ? '' : 's'} (${span})` : `Claude: its memory and ${count} chat${n === 1 ? '' : 's'}`;
  if (f.memory) return 'Claude: its memory';
  return span ? `Claude: ${count} chat${n === 1 ? '' : 's'} (${span})` : `Claude: ${count} chat${n === 1 ? '' : 's'}`;
}

/** What was found of an assistant, in a sentence of its own for each case. */
function sourceDetail(s: Source): string {
  if (s.id === 'atomic') return 'Its memory store: what it knows about you, its notes, lessons and procedures';
  const files = `${s.memory} memory file${s.memory === 1 ? '' : 's'}`;
  if (!s.memory) return `Your ${s.own}`;
  if (s.projects > 1)
    return s.own ? `${s.memory} memory file${s.memory === 1 ? '' : 's'} in ${s.projects} projects, and your ${s.own}` : `${s.memory} memory file${s.memory === 1 ? '' : 's'} in ${s.projects} projects`;
  return s.own ? `${s.memory} memory file${s.memory === 1 ? '' : 's'}, and your ${s.own}` : files;
}

function Check({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return <input type="checkbox" aria-label={label} checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 shrink-0 accent-[var(--accent)]" />;
}

/** The skills found in Hermes, OpenClaw, pi and Atomic Agent: what would be copied into your own skills, then the button. */
function SkillsFound({ skills, off, setOff, busy, onCopy }: { skills: FoundSkill[]; off: Set<string>; setOff: (f: (o: Set<string>) => Set<string>) => void; busy: boolean; onCopy: (ids: string[]) => void }) {
  const offered = skills.filter((k) => !k.skip);
  const chosen = offered.filter((k) => !off.has(k.id));
  const left = skills.filter((k) => k.skip);
  const toggle = (id: string, on: boolean) =>
    setOff((o) => {
      const n = new Set(o);
      if (on) n.delete(id);
      else n.add(id);
      return n;
    });
  const place = (k: FoundSkill) => [k.source, k.where].filter(Boolean).join(' · ');
  return (
    <div>
      <div className="pb-1.5 text-[12px] font-medium text-fg-3">Skills you made there</div>
      {offered.length > 0 && (
        <div className="divide-y divide-line rounded-xl border border-line">
          {offered.map((k) => (
            <label key={k.id} className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5">
              <Check on={!off.has(k.id)} onChange={(v) => toggle(k.id, v)} label={k.name} />
              <Sparkles size={15} className="mt-0.5 shrink-0 text-fg-3" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-fg" translate="no">
                  {k.name}
                </span>
                <span className="line-clamp-2 text-[12.5px] leading-snug text-fg-3" translate="no">
                  {k.description}
                </span>
                <span className="mt-0.5 block text-[12px] text-fg-3">
                  <span translate="no">{place(k)}</span>
                  {k.left.length ? ` · ${k.left.length} file${k.left.length === 1 ? '' : 's'} left out: keys, sign-ins or too big` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
      {left.length > 0 && (
        <details className="mt-2 text-[12.5px] text-fg-3">
          <summary className="cursor-pointer select-none">{`${left.length} not offered`}</summary>
          <ul className="mt-1.5 space-y-1">
            {left.map((k) => (
              <li key={k.id} className="leading-snug">
                <span className="text-fg-2" translate="no">
                  {k.name}
                </span>
                <span translate="no">{` (${place(k)})`}</span>
                {': '}
                {k.skip}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" variant="secondary" disabled={busy || !chosen.length} onClick={() => onCopy(chosen.map((k) => k.id))}>
          {chosen.length ? `Copy ${chosen.length} skill${chosen.length === 1 ? '' : 's'}` : 'Copy skills'}
        </Button>
        <span className="min-w-0 flex-1 text-[12px] leading-snug text-fg-3">Copied into your own skills, with their files. Nothing is changed in the other app.</span>
      </div>
    </div>
  );
}

export function BringIn({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [st, setSt] = useState<BringInState | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<{ name: string; sent: number; size: number } | null>(null);
  const [left, setLeft] = useState<Set<number>>(new Set());
  const [profile, setProfile] = useState(true);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [skills, setSkills] = useState<FoundSkill[] | null>(null);
  const [skillsOff, setSkillsOff] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);
  const loadSkills = () =>
    api<{ skills: FoundSkill[] }>('/api/memory/bring-in/skills')
      .then((r) => setSkills(r.skills))
      .catch(toastError);
  useEffect(() => {
    if (open) loadSkills();
  }, [open]);
  const copySkills = (ids: string[]) => {
    setCopying(true);
    post<{ results: SkillResult[]; skills: FoundSkill[] }>('/api/memory/bring-in/skills', { ids })
      .then((r) => {
        setSkills(r.skills);
        const n = r.results.filter((x) => x.status === 'copied').length;
        const rest = r.results.length - n;
        toast(n ? (rest ? `Copied ${n} skill${n === 1 ? '' : 's'}; ${rest} left out` : `Copied ${n} skill${n === 1 ? '' : 's'} to your skills`) : 'No skill was copied', n ? 'ok' : undefined);
      })
      .catch(toastError)
      .finally(() => setCopying(false));
  };
  const load = () => api<BringInState>('/api/memory/bring-in').then(setSt).catch(toastError);
  useEffect(() => {
    if (open) load();
  }, [open]);
  const reading = st?.job?.state === 'reading';
  useEffect(() => {
    if (!open || !reading) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [open, reading]);
  // A new list of proposals: every note picked again.
  const ready = st?.job?.state === 'ready' ? st.job : null;
  useEffect(() => {
    setLeft(new Set());
    setProfile(true);
  }, [ready?.notes.length, ready?.done]);

  const picked = st ? [...st.sources.map((s) => s.id), ...st.files.map((f) => f.id)].filter((id) => !off.has(id)) : [];
  const toggle = (id: string, on: boolean) =>
    setOff((o) => {
      const n = new Set(o);
      if (on) n.delete(id);
      else n.add(id);
      return n;
    });
  const addFile = async (file: File) => {
    setSending({ name: file.name, sent: 0, size: file.size });
    try {
      const f = await sendExport(file, (sent) => setSending({ name: file.name, sent, size: file.size }));
      setSt((s) => (s ? { ...s, files: [...s.files.filter((x) => x.id !== f.id), f] } : s));
    } catch (e) {
      toastError(e);
    } finally {
      setSending(null);
    }
  };
  const removeFile = (id: string) =>
    del<BringInState>(`/api/memory/bring-in/file/${encodeURIComponent(id)}`)
      .then(setSt)
      .catch(toastError);
  const read = () => {
    if (!st) return;
    setBusy(true);
    post<BringInState>('/api/memory/bring-in/read', { sources: st.sources.map((s) => s.id).filter((id) => !off.has(id)), files: st.files.map((f) => f.id).filter((id) => !off.has(id)) })
      .then(setSt)
      .catch(toastError)
      .finally(() => setBusy(false));
  };
  const stop = () => del<BringInState>('/api/memory/bring-in').then(setSt).catch(toastError);
  const keep = ready ? ready.notes.filter((n) => !left.has(n.id)) : [];
  const withProfile = !!ready?.profile && profile;
  const add = () => {
    setBusy(true);
    post<{ added: number; profile: boolean }>('/api/memory/bring-in/apply', { notes: keep.map((n) => n.id), profile: withProfile })
      .then((r) => {
        const n = r.added;
        toast(
          n && r.profile ? `Added ${n} note${n === 1 ? '' : 's'} and updated your profile` : n ? `Added ${n} note${n === 1 ? '' : 's'}` : r.profile ? 'Updated your profile' : 'Nothing was added',
          'ok',
        );
        onClose();
      })
      .catch(toastError)
      .finally(() => setBusy(false));
  };

  // The proposals by where they go: about you first, then each project.
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; scope: 'global' | 'repo'; notes: Proposal[] }>();
    for (const n of ready?.notes ?? []) {
      const k = n.scope === 'global' ? '' : n.scopeKey;
      if (!m.has(k)) m.set(k, { key: k, scope: n.scope, notes: [] });
      m.get(k)!.notes.push(n);
    }
    return [...m.values()].sort((a, b) => (a.scope === b.scope ? a.key.localeCompare(b.key) : a.scope === 'global' ? -1 : 1));
  }, [ready]);
  const manySources = new Set(ready?.notes.map((n) => n.source)).size > 1;
  const setGroup = (notes: Proposal[], on: boolean) =>
    setLeft((l) => {
      const n = new Set(l);
      for (const p of notes) on ? n.delete(p.id) : n.add(p.id);
      return n;
    });

  const job = st?.job;
  const failed = job?.state === 'failed' ? job : null;
  let body: ReactNode;
  let footer: ReactNode;
  if (!st) {
    body = (
      <div className="flex justify-center py-10">
        <Throbber className="text-fg-3" />
      </div>
    );
  } else if (reading && job) {
    const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
    body = (
      <div className="space-y-3 py-2">
        <div className="flex items-center gap-2.5 text-[13.5px] text-fg">
          <Throbber className="text-fg-3" size={15} />
          <span>{job.total ? `Reading what ${job.sources.join(', ')} kept: ${job.done} of ${job.total}` : 'Getting it ready to read'}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-bg-3">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[12.5px] leading-snug text-fg-3">The helper model reads a part at a time. You can close this: the reading goes on, and the notes wait here for you.</p>
      </div>
    );
    footer = (
      <Button variant="ghost" onClick={stop}>
        Stop
      </Button>
    );
  } else if (ready) {
    const none = !ready.notes.length && !ready.profile;
    body = none ? (
      <div className="py-6 text-center">
        <div className="text-[14px] font-medium text-fg">Nothing new to bring in</div>
        <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-fg-3">Memory knows it already, or it would not last.</p>
      </div>
    ) : (
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-fg-2">
          {ready.missed ? `Untick what you don’t want kept. ${ready.missed} of ${ready.total} parts could not be read.` : 'Untick what you don’t want kept.'}
        </p>
        {groups.map((g) => {
          const on = g.notes.filter((n) => !left.has(n.id)).length;
          return (
            <div key={g.key}>
              <label className="flex cursor-pointer items-center gap-2 pb-1.5">
                <Check on={on === g.notes.length} onChange={(v) => setGroup(g.notes, v)} label={g.scope === 'global' ? 'About you' : folderName(g.key)} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
                  {g.scope === 'global' ? (
                    'About you'
                  ) : (
                    <>
                      <span translate="no">{folderName(g.key)}</span>{' '}
                      <span className="font-normal text-fg-3" translate="no">
                        {tildify(g.key)}
                      </span>
                    </>
                  )}
                </span>
                <span className="tnum shrink-0 text-[12px] text-fg-3">
                  {on} of {g.notes.length}
                </span>
              </label>
              <div className="divide-y divide-line rounded-xl border border-line">
                {g.notes.map((n) => (
                  <label key={n.id} className="flex cursor-pointer items-start gap-2.5 px-3 py-2">
                    <Check on={!left.has(n.id)} onChange={(v) => setGroup([n], v)} label={n.title ?? n.text} />
                    <span className={cx('min-w-0 flex-1 text-[13px] leading-snug', left.has(n.id) ? 'text-fg-3' : 'text-fg')}>
                      <span translate="no">{n.text}</span>
                      {manySources && <span className="ml-1.5 text-[11.5px] text-fg-3">{n.source}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        {ready.profile && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line px-3 py-2.5">
            <Check on={profile} onChange={setProfile} label="Add to your profile" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-fg">Add to your profile</span>
              <span className="mt-1 block space-y-0.5 text-[12.5px] leading-snug text-fg-2" translate="no">
                {ready.profile.added.map((l, i) => (
                  <span key={i} className="block">
                    {l.replace(/^[-•*]\s+/, '')}
                  </span>
                ))}
              </span>
            </span>
          </label>
        )}
      </div>
    );
    footer = none ? (
      <Button variant="primary" onClick={stop}>
        Done
      </Button>
    ) : (
      <>
        <Button variant="ghost" onClick={stop} disabled={busy}>
          Discard
        </Button>
        <Button variant="primary" onClick={add} disabled={busy || (!keep.length && !withProfile)}>
          {keep.length ? `Add ${keep.length} note${keep.length === 1 ? '' : 's'}` : 'Update your profile'}
        </Button>
      </>
    );
  } else {
    body = (
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-fg-2">What other assistants know about you and your projects, as notes here, and the skills you made in them. Nothing is added until you pick.</p>
        {failed && (
          <div className="flex items-start gap-2 rounded-xl bg-err/10 px-3 py-2 text-[12.5px] leading-snug text-err">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>{failed.error ? `It could not be read: ${failed.error}` : 'It could not be read.'}</span>
          </div>
        )}
        <div>
          <div className="pb-1.5 text-[12px] font-medium text-fg-3">On this computer</div>
          {st.sources.length ? (
            <div className="divide-y divide-line rounded-xl border border-line">
              {st.sources.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5">
                  <Check on={!off.has(s.id)} onChange={(v) => toggle(s.id, v)} label={s.name} />
                  <Laptop size={15} className="mt-0.5 shrink-0 text-fg-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] text-fg">{s.name}</span>
                    <span className="block text-[12.5px] text-fg-3">{sourceDetail(s)}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] leading-snug text-fg-3">Nothing from Claude Code, Codex, Hermes, OpenClaw, pi or Atomic Agent here.</p>
          )}
        </div>
        {skills && skills.length > 0 && <SkillsFound skills={skills} off={skillsOff} setOff={setSkillsOff} busy={copying} onCopy={copySkills} />}
        <div>
          <div className="pb-1.5 text-[12px] font-medium text-fg-3">From an export</div>
          {(st.files.length > 0 || sending) && (
            <div className="mb-2 divide-y divide-line rounded-xl border border-line">
              {st.files.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5">
                  <Check on={!off.has(f.id)} onChange={(v) => toggle(f.id, v)} label={f.name} />
                  <FileArchive size={15} className="mt-0.5 shrink-0 text-fg-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-fg" translate="no">
                      {f.name}
                    </span>
                    <span className="block text-[12.5px] text-fg-3">{fileDetail(f)}</span>
                  </span>
                  <IconButton label="Remove" size="sm" onClick={(e) => (e.preventDefault(), removeFile(f.id))}>
                    <Trash2 size={14} />
                  </IconButton>
                </label>
              ))}
              {sending && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <Throbber className="text-fg-3" size={14} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2" translate="no">
                    {sending.name}
                  </span>
                  <span className="tnum shrink-0 text-[12px] text-fg-3">{sending.sent >= sending.size ? 'Reading it' : `${Math.round((sending.sent / Math.max(1, sending.size)) * 100)}%`}</span>
                </div>
              )}
            </div>
          )}
          <Button size="sm" variant="secondary" icon={<Import size={14} />} disabled={!!sending} onClick={() => input.current?.click()}>
            Add an export
          </Button>
          <p className="mt-1.5 text-[12px] leading-snug text-fg-3">
            The .zip ChatGPT or Claude emails you: in ChatGPT, Settings → Data controls → Export data; in Claude, Settings → Privacy → Export data.
          </p>
          <input
            ref={input}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void addFile(f);
            }}
          />
        </div>
      </div>
    );
    footer = (
      <Button variant="primary" onClick={read} disabled={busy || !!sending || !picked.length}>
        Start reading
      </Button>
    );
  }
  return (
    <Dialog open={open} onClose={onClose} title="Bring in from other assistants" width={560} footer={footer}>
      {body}
    </Dialog>
  );
}
