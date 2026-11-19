// What an agent hands back (the fields of each result; none: its reply) and where each result goes: a page in the
// kept page (the same one updated each run, or a new one each run), a row in a spreadsheet, an email to people
// from a connected mail account, a notification, a file in the folder it works in and a webhook (signed with a key from
// the vault). In All settings, and from its sentence on its page. Words typed in a place's boxes count once you leave
// the box (or press Enter), so a half-typed address is never saved.
import { useEffect, useState } from 'react';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { ANSWER_TYPES, type AnswerField, type AnswerType } from '@shared/apps';
import { DEFAULT_EMAIL_SUBJECT, type AgentOutput, type AgentResults, type OutputKind, type OutputTarget, type ResultPlaces } from '@shared/assistants';
import type { PageInfo } from '@shared/pages';
import { api, enc } from '../../lib/api';
import { go } from '../../lib/nav';
import { cx, IconButton, inputCls, Segmented, Switch } from '../../components/ui';

const TYPES = ANSWER_TYPES.filter((t) => t.value !== 'media');

const PLACE: Record<OutputKind, string> = {
  file: 'a file',
  library: 'a kept page',
  sheet: 'a spreadsheet',
  email: 'an email',
  webhook: 'a webhook',
  notify: 'a notification',
};

const and = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** "its reply", "Summary and Papers to a spreadsheet and an email": what an agent hands back, in a few words. */
export function outputText(o?: AgentOutput): string {
  const f = o?.fields ?? [];
  const what = !f.length ? 'its reply' : f.length <= 3 ? and(f.map((x) => x.label)) : `${f.length} fields`;
  const where = [...new Set((o?.to ?? []).map((t) => PLACE[t.kind]))];
  return where.length ? `${what} to ${and(where)}` : what;
}

/** Its output with empty parts left out: none when it names neither fields nor places. */
function tidy(fields: AnswerField[], to: OutputTarget[]): AgentOutput | undefined {
  const fs = fields.filter((f) => f.label.trim());
  return fs.length || to.length ? { ...(fs.length ? { fields: fs } : {}), ...(to.length ? { to } : {}) } : undefined;
}

/** A box whose words count once you leave it or press Enter. */
function Committed({ value, onCommit, className, ...rest }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; 'aria-label': string; disabled?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && onCommit(v);
  return <input {...rest} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} className={cx(inputCls, 'h-8', className)} />;
}

const addresses = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** A connected mail account, as the Email connection lists them (when this version has it). */
interface MailAccount {
  id: string;
  address: string;
  name?: string;
}

/** The pages an agent's first run made for its results, while it has an id. */
function useMade(id?: string): ResultPlaces {
  const [made, setMade] = useState<ResultPlaces>({});
  useEffect(() => {
    if (!id) return;
    api<AgentResults>(`/api/assistants/${enc(id)}/results?limit=1`).then((r) => setMade(r.made ?? {}), () => {});
  }, [id]);
  return made;
}

function OpenPage({ page }: { page: { id: string; title: string } }) {
  return (
    <button type="button" onClick={() => go(`/pages/${enc(page.id)}`)} className="inline-flex max-w-full items-center gap-1 text-accent hover:underline">
      <span translate="no" className="truncate">
        {page.title}
      </span>
      <ExternalLink size={11} className="shrink-0" />
    </button>
  );
}

export function OutputEditor({ value, onChange, agent }: { value?: AgentOutput; onChange: (o?: AgentOutput) => void; agent?: { id?: string; name?: string } }) {
  const fields = value?.fields ?? [];
  const to = value?.to ?? [];
  const find = <K extends OutputKind>(k: K) => to.find((t): t is Extract<OutputTarget, { kind: K }> => t.kind === k);
  const file = find('file');
  const hook = find('webhook');
  const lib = find('library');
  const sheet = find('sheet');
  const mail = find('email');
  const has = (k: OutputKind) => to.some((t) => t.kind === k);
  const setFields = (next: AnswerField[]) => onChange(tidy(next, to));
  // A place keeps its spot in the list when it changes.
  const setTo = (kind: OutputKind, t: OutputTarget | null) => {
    const at = to.findIndex((x) => x.kind === kind);
    const rest = to.filter((x) => x.kind !== kind);
    if (t) rest.splice(at < 0 ? rest.length : at, 0, t);
    onChange(tidy(fields, rest));
  };
  const field = (i: number, p: Partial<AnswerField>) => setFields(fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const made = useMade(agent?.id);
  // An email switched on before it has anyone to go to: its boxes show, and it counts once it has an address.
  const [mailOpen, setMailOpen] = useState(false);
  const [sheets, setSheets] = useState<PageInfo[] | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  // The connected mail accounts; false: this version of the app has no Email connection to ask.
  const [accounts, setAccounts] = useState<MailAccount[] | null | false>(null);
  useEffect(() => {
    if (!sheet || sheets) return;
    api<{ pages: PageInfo[] }>('/api/pages').then((r) => setSheets(r.pages.filter((p) => p.kind === 'sheet')), () => setSheets([]));
  }, [!!sheet]);
  useEffect(() => {
    if (!sheet?.page) return setTabs([]);
    api<{ model?: { sheets?: { name: string }[] } }>(`/api/pages/${enc(sheet.page)}`).then((r) => setTabs((r.model?.sheets ?? []).map((s) => s.name)), () => setTabs([]));
  }, [sheet?.page]);
  useEffect(() => {
    if ((!mail && !mailOpen) || accounts) return;
    api<{ accounts: MailAccount[] }>('/api/mail/accounts').then((r) => setAccounts(r.accounts ?? []), () => setAccounts(false));
  }, [!!mail, mailOpen]);
  const name = agent?.name?.trim() || 'the agent';
  return (
    <div className="space-y-3 text-[13px]">
      <div>
        <div className="mb-1.5 text-[12.5px] text-fg-2">Fields of each result</div>
        {fields.length === 0 && <div className="mb-1.5 text-[12px] text-fg-3">None: it hands back its reply.</div>}
        <div className="space-y-1.5">
          {fields.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line p-1.5">
              <input
                value={f.label}
                onChange={(e) => field(i, { label: e.target.value, id: '' })}
                maxLength={80}
                placeholder="Summary"
                aria-label="Field"
                className={cx(inputCls, 'h-8 min-w-0 flex-1')}
              />
              <select
                value={f.type}
                onChange={(e) => field(i, { type: e.target.value as AnswerType, columns: e.target.value === 'table' ? (f.columns ?? [{ id: 'item', label: 'Item', type: 'text' }]) : undefined })}
                className={cx(inputCls, 'h-8 w-32')}
                aria-label="Kind"
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-[12px] text-fg-3">
                <Switch on={!!f.required} onChange={(on) => field(i, { required: on || undefined })} label="Required" />
                Required
              </label>
              <IconButton label={`Remove ${f.label || 'the field'}`} size="sm" onClick={() => setFields(fields.filter((_, j) => j !== i))}>
                <Trash2 size={13} />
              </IconButton>
              {f.type === 'table' && (
                <input
                  value={(f.columns ?? []).map((c) => c.label).join(', ')}
                  onChange={(e) =>
                    field(i, {
                      columns: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean)
                        .map((label) => ({ id: '', label, type: 'text' as const })),
                    })
                  }
                  placeholder="Its columns: Name, Price, Link"
                  aria-label="Its columns"
                  className={cx(inputCls, 'h-8 w-full')}
                />
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setFields([...fields, { id: '', label: '', type: 'text' }])} className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-accent hover:underline">
          <Plus size={13} />
          Add a field
        </button>
      </div>
      <div>
        <div className="mb-1.5 text-[12.5px] text-fg-2">Where each result goes, besides the conversation</div>
        <div className="divide-y divide-line rounded-xl border border-line">
          <div className="px-3 py-2">
            <label className="flex cursor-pointer items-center gap-3">
              <span className="min-w-0 flex-1">A kept page</span>
              <Switch on={!!lib} onChange={(on) => setTo('library', on ? { kind: 'library' } : null)} label="A kept page" />
            </label>
            {lib && (
              <div className="mt-1.5 space-y-1.5">
                <Segmented
                  size="sm"
                  value={lib.each === 'new' ? 'new' : 'same'}
                  options={[
                    { value: 'same', label: 'The same page, updated' },
                    { value: 'new', label: 'A new page each run' },
                  ]}
                  onChange={(v) => setTo('library', v === 'new' ? { kind: 'library', each: 'new' } : { kind: 'library' })}
                />
                <div className="text-[12px] leading-snug text-fg-3">
                  {lib.each === 'new' ? (
                    'Each run makes a page of its own, named after the agent and the day.'
                  ) : made.library && !lib.page ? (
                    <>
                      <div>Each run puts a new version of its page; the earlier ones stay in its versions.</div>
                      <div className="flex items-center gap-1">
                        <span>Its page:</span>
                        <OpenPage page={made.library} />
                      </div>
                    </>
                  ) : (
                    `Its first run makes a page named ${name}, and each run after puts a new version of it; the earlier ones stay in its versions.`
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="px-3 py-2">
            <label className="flex cursor-pointer items-center gap-3">
              <span className="min-w-0 flex-1">A row in a spreadsheet</span>
              <Switch on={!!sheet} onChange={(on) => setTo('sheet', on ? { kind: 'sheet' } : null)} label="A row in a spreadsheet" />
            </label>
            {sheet && (
              <div className="mt-1.5 space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  <select
                    value={sheet.page ?? ''}
                    onChange={(e) => setTo('sheet', { kind: 'sheet', ...(e.target.value ? { page: e.target.value } : {}) })}
                    aria-label="Spreadsheet"
                    className={cx(inputCls, 'h-8 min-w-0 flex-[2]')}
                  >
                    <option value="">{made.sheet ? `${made.sheet.title} (made by its first run)` : `A new one, named ${name}`}</option>
                    {(sheets ?? [])
                      .filter((p) => p.id !== made.sheet?.id || sheet.page === p.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    {sheet.page && !(sheets ?? []).some((p) => p.id === sheet.page) && <option value={sheet.page}>{sheets ? 'A spreadsheet no longer there' : '…'}</option>}
                  </select>
                  <Committed
                    value={sheet.tab ?? ''}
                    onCommit={(tab) => setTo('sheet', { ...sheet, ...(tab.trim() ? { tab: tab.trim() } : { tab: undefined }) })}
                    placeholder={sheet.page ? 'Its first tab' : 'Results'}
                    aria-label="Its tab"
                    className="min-w-0 flex-1"
                  />
                </div>
                {tabs.length > 0 && <div className="text-[12px] text-fg-3">{`Its tabs: ${tabs.join(', ')}. A tab not there is added.`}</div>}
                <div className="text-[12px] leading-snug text-fg-3">
                  Each run adds a row: when it ran, then a column for each field. Fields you add later get new columns at the end. Columns are found by their headings, so you can move
                  them and add your own.
                </div>
                {made.sheet && !sheet.page && (
                  <div className="flex items-center gap-1 text-[12px] text-fg-3">
                    <span>Its spreadsheet:</span>
                    <OpenPage page={made.sheet} />
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="px-3 py-2">
            <label className="flex cursor-pointer items-center gap-3">
              <span className="min-w-0 flex-1">An email</span>
              <Switch
                on={!!mail || mailOpen}
                onChange={(on) => {
                  setMailOpen(on);
                  if (!on) setTo('email', null);
                }}
                label="An email"
              />
            </label>
            {(mail || mailOpen) && (
              <div className="mt-1.5 space-y-1.5">
                <Committed
                  value={(mail?.to ?? []).join(', ')}
                  onCommit={(v) => {
                    const list = addresses(v);
                    // Emptied, the boxes stay until it is switched off.
                    if (!list.length) setMailOpen(true);
                    setTo('email', list.length ? { kind: 'email', to: list, ...(mail?.subject ? { subject: mail.subject } : {}), ...(mail?.account ? { account: mail.account } : {}) } : null);
                  }}
                  placeholder="To: anna@example.org, sam@example.com"
                  aria-label="To"
                />
                <div className="flex flex-wrap gap-1.5">
                  <Committed
                    value={mail?.subject ?? ''}
                    disabled={!mail}
                    onCommit={(v) => mail && setTo('email', { ...mail, subject: v.trim() || undefined })}
                    placeholder={`Subject: ${DEFAULT_EMAIL_SUBJECT}`}
                    aria-label="Subject"
                    className="min-w-0 flex-[2]"
                  />
                  {accounts && accounts.length > 0 ? (
                    <select
                      value={mail?.account ?? ''}
                      disabled={!mail}
                      onChange={(e) => mail && setTo('email', { ...mail, account: e.target.value || undefined })}
                      aria-label="From"
                      className={cx(inputCls, 'h-8 min-w-0 flex-1')}
                    >
                      <option value="">{`From ${accounts[0].address}`}</option>
                      {accounts.slice(1).map((x) => (
                        <option key={x.id} value={x.address}>
                          {`From ${x.address}`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Committed
                      value={mail?.account ?? ''}
                      disabled={!mail}
                      onCommit={(v) => mail && setTo('email', { ...mail, account: v.trim() || undefined })}
                      placeholder="From: your mail account"
                      aria-label="From"
                      className="min-w-0 flex-1"
                    />
                  )}
                </div>
                {Array.isArray(accounts) && !accounts.length && <div className="text-[12px] leading-snug text-warn">Connect your mail account first, in Apps → Connected apps → Email.</div>}
                <div className="text-[12px] leading-snug text-fg-3">
                  {'Sent from your connected mail account as soon as each result is ready, without waiting in the Outbox: you chose the people here. {date}, {time} and {agent} fill in in the subject.'}
                </div>
              </div>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">A notification</span>
            <Switch on={has('notify')} onChange={(on) => setTo('notify', on ? { kind: 'notify' } : null)} label="A notification" />
          </label>
          <div className="px-3 py-2">
            <div className="mb-1">A file in the folder it works in</div>
            <Committed
              value={file?.path ?? ''}
              onCommit={(v) => setTo('file', v.trim() ? { kind: 'file', path: v.trim() } : null)}
              placeholder="reports/{date}.md (.json for the fields as JSON)"
              aria-label="A file in the folder it works in"
            />
          </div>
          <div className="px-3 py-2">
            <div className="mb-1">A webhook</div>
            <div className="flex flex-wrap gap-1.5">
              <Committed
                value={hook?.url ?? ''}
                onCommit={(v) => setTo('webhook', v.trim() ? { kind: 'webhook', url: v.trim(), ...(hook?.secret ? { secret: hook.secret } : {}) } : null)}
                placeholder="https://hooks.example.com/…"
                aria-label="A webhook"
                className="min-w-0 flex-[2]"
              />
              <Committed
                value={hook?.secret ?? ''}
                disabled={!hook}
                onCommit={(v) => hook && setTo('webhook', { kind: 'webhook', url: hook.url, ...(v.trim() ? { secret: v.trim().toUpperCase() } : {}) })}
                placeholder="Key in the vault, if any"
                aria-label="Key in the vault"
                className="min-w-0 flex-1"
              />
            </div>
          </div>
        </div>
        <div className="mt-1 text-[12px] leading-snug text-fg-3">
          {'In a file name, {date}, {time} and {agent} fill in. A webhook gets the result as JSON, signed with the key when one is named (only to the hosts the key is allowed for).'}
        </div>
      </div>
    </div>
  );
}
