// Settings → Connections → Keys: the vault. Each key has a name agents use, a value never shown back
// (a masked hint only), the hosts http_request may send it to, a note, and how it is sent.
import { useEffect, useState } from 'react';
import { ChevronDown, KeyRound, LockKeyhole, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { cleanDomains, secretName, type SecretView } from '@shared/connections';
import { del, enc, patch, post } from '../../lib/api';
import { ago } from '../../lib/format';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, Empty, IconButton, inputCls, Section, Throbber, useConfirm } from '../../components/ui';
import { SecretInput } from './ConnectDialog';
import { useConn } from './store';

type Mode = { kind: 'add' } | { kind: 'rotate'; s: SecretView } | { kind: 'edit'; s: SecretView };

function sentAs(s: Pick<SecretView, 'header' | 'prefix' | 'query'>): string {
  if (s.query) return `?${s.query}=…`;
  const h = s.header || 'Authorization';
  const p = s.prefix ?? (h.toLowerCase() === 'authorization' ? 'Bearer ' : '');
  return `${h}: ${p}…`;
}

function KeyDialog({ mode, onClose }: { mode: Mode | null; onClose: () => void }) {
  const s = mode && mode.kind !== 'add' ? mode.s : null;
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [hosts, setHosts] = useState('');
  const [note, setNote] = useState('');
  const [how, setHow] = useState(false);
  const [header, setHeader] = useState('');
  const [prefix, setPrefix] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!mode) return;
    setName(s?.name ?? '');
    setValue('');
    setHosts(s?.domains.join(', ') ?? '');
    setNote(s?.note ?? '');
    setHeader(s?.header ?? '');
    setPrefix(s?.prefix ?? '');
    setQuery(s?.query ?? '');
    setHow(!!(s?.header || s?.query || s?.prefix));
  }, [mode]);
  if (!mode) return null;
  const rotate = mode.kind === 'rotate';
  const edit = mode.kind === 'edit';
  const save = async () => {
    setBusy(true);
    try {
      const how = { header: header.trim() || null, prefix: header.trim() || prefix ? prefix || null : null, query: query.trim() || null };
      if (mode.kind === 'add') await post('/api/connections/secrets', { name: secretName(name), value, domains: hosts, note, ...how });
      else if (rotate) await patch(`/api/connections/secrets/${enc(mode.s.name)}`, { value });
      else await patch(`/api/connections/secrets/${enc(mode.s.name)}`, { domains: hosts, note, ...how });
      toast(mode.kind === 'add' ? `${secretName(name)} is in the vault` : rotate ? `${mode.s.name} has its new value` : 'Saved', 'ok');
      await useConn.getState().load();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const ok = !busy && (edit || value.trim()) && (mode.kind !== 'add' || secretName(name).length >= 2);
  const parsed = cleanDomains(hosts);
  return (
    <Dialog
      open
      onClose={onClose}
      width={520}
      title={mode.kind === 'add' ? 'Add a key' : rotate ? `New value for ${mode.s.name}` : mode.s.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ok} onClick={save}>
            {busy ? 'Saving…' : rotate ? 'Replace it' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5 text-[13px]">
        {mode.kind === 'add' && (
          <label className="block">
            <span className="mb-1 block text-fg-2">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="WEATHER_API_KEY" autoCapitalize="characters" autoCorrect="off" spellCheck={false} className={cx(inputCls, 'font-mono text-[16px] sm:text-[13.5px]')} autoFocus />
            <span className="mt-1 block text-[12px] text-fg-3">What agents call it. {name && secretName(name) !== name ? `It will be ${secretName(name) || '…'}.` : ''}</span>
          </label>
        )}
        {!edit && (
          <label className="block">
            <span className="mb-1 block text-fg-2">{rotate ? 'New value' : 'Value'}</span>
            <SecretInput value={value} onChange={setValue} placeholder={rotate ? `Now ${mode.s.hint}` : 'Paste it here'} autoFocus={rotate} onEnter={() => ok && save()} />
          </label>
        )}
        {!rotate && (
          <>
            <label className="block">
              <span className="mb-1 block text-fg-2">Hosts it may be sent to</span>
              <input value={hosts} onChange={(e) => setHosts(e.target.value)} placeholder="api.example.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={cx(inputCls, 'font-mono text-[16px] sm:text-[13px]')} />
              <span className="mt-1 block text-[12px] leading-snug text-fg-3">
                {parsed.length ? `Sent only to ${parsed.join(', ')} and their subdomains, over https.` : 'Separated by commas. Until you add one, agents cannot use it.'}
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-fg-2">Note</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What it is for (agents see this)" className={cx(inputCls, 'text-[16px] sm:text-[14px]')} />
            </label>
            <div className="rounded-xl border border-line">
              <button type="button" onClick={() => setHow((h) => !h)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-fg-2">
                <span className="flex-1">
                  How it is sent <span className="font-mono text-[12px] text-fg-3">{sentAs({ header: header.trim() || undefined, prefix: prefix || undefined, query: query.trim() || undefined })}</span>
                </span>
                <ChevronDown size={15} className={cx('text-fg-3 transition-transform', how && 'rotate-180')} />
              </button>
              {how && (
                <div className="grid gap-3 border-t border-line px-3 pt-2.5 pb-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[12px] text-fg-3">Header</span>
                    <input value={header} onChange={(e) => setHeader(e.target.value)} placeholder="Authorization" disabled={!!query.trim()} className={cx(inputCls, 'font-mono text-[16px] sm:text-[13px]')} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[12px] text-fg-3">Before the key</span>
                    <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder={!header.trim() || header.trim().toLowerCase() === 'authorization' ? 'Bearer ' : 'nothing'} disabled={!!query.trim()} className={cx(inputCls, 'font-mono text-[16px] sm:text-[13px]')} />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-[12px] text-fg-3">Or as a query parameter</span>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="api_key" className={cx(inputCls, 'font-mono text-[16px] sm:text-[13px]')} />
                  </label>
                </div>
              )}
            </div>
          </>
        )}
        <p className="flex gap-2 text-[12px] leading-snug text-fg-3">
          <LockKeyhole size={13} className="mt-0.5 shrink-0" />
          Encrypted on this computer. It is never shown again, here or to an agent: only its last characters.
        </p>
      </div>
    </Dialog>
  );
}

export function Keys() {
  const secrets = useConn((s) => s.secrets);
  const [mode, setMode] = useState<Mode | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const remove = async (s: SecretView) => {
    if (!(await confirm({ title: `Delete ${s.name}?`, body: 'Agents can no longer use it, and its value is gone for good.', confirm: 'Delete', danger: true }))) return;
    await del(`/api/connections/secrets/${enc(s.name)}`).catch(toastError);
    await useConn.getState().load();
  };
  return (
    <div className="space-y-4">
      <Section
        title="Keys"
        sub="Agents call APIs with these through http_request, and only to the hosts you allow. They never see a value."
        actions={
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setMode({ kind: 'add' })}>
            Add a key
          </Button>
        }
      >
        {!secrets ? (
          <Throbber className="text-fg-3" />
        ) : !secrets.length ? (
          <Empty icon={<KeyRound size={20} />} title="No keys yet">
            Add one here, or let an agent ask: when a task needs a key, it shows a card in the conversation where you paste it.
          </Empty>
        ) : (
          <div className="-my-1 divide-y divide-line">
            {secrets.map((s) => (
              <div key={s.name} className="flex items-start gap-3 py-3">
                <KeyRound size={15} className="mt-1 shrink-0 text-fg-3" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-mono text-[13px] font-medium break-all">{s.name}</span>
                    <span className="font-mono text-[12px] text-fg-3">{s.hint}</span>
                  </div>
                  {s.note && <div className="mt-0.5 text-[12.5px] leading-snug text-fg-2">{s.note}</div>}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {s.domains.length ? (
                      s.domains.map((d) => (
                        <span key={d} className="rounded-md bg-bg-2 px-1.5 py-px font-mono text-[11.5px] text-fg-2">
                          {d}
                        </span>
                      ))
                    ) : (
                      <span className="text-[12px] text-warn">No hosts allowed yet</span>
                    )}
                    <span className="ml-1 text-[11.5px] text-fg-3">
                      {s.usedAt ? `used ${ago(s.usedAt)}` : 'not used yet'} · {s.updatedAt !== s.createdAt ? `changed ${ago(s.updatedAt)}` : `added ${ago(s.createdAt)}`}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
                  <IconButton label="New value" size="sm" onClick={() => setMode({ kind: 'rotate', s })}>
                    <RotateCcw size={14} />
                  </IconButton>
                  <IconButton label="Hosts, note and how it is sent" size="sm" onClick={() => setMode({ kind: 'edit', s })}>
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton label="Delete" size="sm" onClick={() => remove(s)}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
      <KeyDialog mode={mode} onClose={() => setMode(null)} />
      {confirmNode}
    </div>
  );
}
