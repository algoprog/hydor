// What a person with Technical details on has besides, on an app's Overview and Checks: its folder opened in Files, the
// editor and a terminal, its code as an archive, hydor.json to read and change with the reader's sentences as they type,
// the names each place is started with (never a key's value), the servers with their keys, and the checker's command.
import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, FileCode2, FolderOpen, SquareTerminal } from 'lucide-react';
import { HYDOR_FILE, readHydorText } from '@shared/hydor-file';
import type { LaunchHost, WebApp, WebAppStartValues } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { api, enc, put } from '../../lib/api';
import { go } from '../../lib/nav';
import { showInFiles } from '../../lib/nav';
import { toast, toastError, useUI } from '../../lib/store';
import { Button, cx, IconButton, inputCls, Section } from '../../components/ui';
import { openTerminalAt } from '../terminal/TerminalPanel';
import { useLoaded } from './api';

const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => toast(tr('Copied'), 'ok'), () => {});

function Line({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-bg-2 px-2.5 py-2">
      <code translate="no" className="min-w-0 flex-1 text-[12px] leading-relaxed break-all">
        {text}
      </code>
      <IconButton label="Copy" size="sm" onClick={() => copy(text)}>
        <Copy size={13} />
      </IconButton>
    </div>
  );
}

const WHAT: Record<WebAppStartValues['values'][number]['what'], string> = {
  port: 'where it listens: the number Hydor or the server gives',
  host: 'the address it listens on',
  data: 'its data folder',
  secret: 'its secret, made for each place',
  url: 'the address people reach it at',
  key: 'a key: its value is in your vault',
};

/** hydor.json, read and written here: what the reader says of it as you type, and Save once it reads. */
function Contract({ app }: { app: WebApp }) {
  const base = `/api/webapps/${enc(app.id)}/contract`;
  const [kept, setKept] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api<{ text: string }>(base).then((r) => (setKept(r.text), setText(r.text)), () => setKept(''));
  }, [base, app.updatedAt]);
  const read = useMemo(() => (text.trim() ? readHydorText(text) : null), [text]);
  const changed = kept !== null && text !== kept;
  const save = async () => {
    setSaving(true);
    try {
      await put(base, { text });
      setKept(text);
      toast(tr('Saved'), 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div data-contract-editor>
      <textarea
        className={cx(inputCls, 'h-64 w-full resize-y py-2 font-mono text-[12px] leading-relaxed')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        translate="no"
        aria-label={HYDOR_FILE}
        placeholder={kept === null ? '' : '{ "start": "node server.js" }'}
      />
      {read && !read.ok && (
        <ul className="mt-2 space-y-1 text-[12.5px] leading-snug text-warn" role="status" translate="no">
          {read.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        {read?.ok && <span className="mr-auto text-[12.5px] text-ok">It reads.</span>}
        <Button size="sm" variant="ghost" disabled={!changed} onClick={() => setText(kept ?? '')}>
          Undo changes
        </Button>
        <Button size="sm" variant="primary" disabled={!changed || !read?.ok || saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}

export function TechnicalSections({ app }: { app: WebApp }) {
  const base = `/api/webapps/${enc(app.id)}`;
  const values = useLoaded<WebAppStartValues>(`${base}/values`);
  const hosts = useLoaded<{ hosts: LaunchHost[] }>('/api/webapps/hosts');
  const inFiles = () => (useUI.getState().set({ explorerRoot: app.folder }), go('/files'));
  return (
    <>
      <Section title="Its code">
        <div className="flex flex-wrap gap-2" data-technical="code">
          <Button size="sm" variant="secondary" icon={<FolderOpen size={14} />} onClick={inFiles}>
            Open in Files
          </Button>
          <Button size="sm" variant="secondary" icon={<FileCode2 size={14} />} onClick={() => showInFiles(`${app.folder}/${HYDOR_FILE}`)}>
            Open in the editor
          </Button>
          <Button size="sm" variant="secondary" icon={<SquareTerminal size={14} />} onClick={() => void openTerminalAt(app.folder)}>
            Terminal in its folder
          </Button>
          <a href={`${base}/code`} download className="inline-flex">
            <Button size="sm" variant="secondary" icon={<Download size={14} />} tabIndex={-1}>
              Download the code
            </Button>
          </a>
        </div>
        <p className="mt-2 text-[12.5px] leading-snug text-fg-3">The archive leaves out its data, its keys, installed packages, builds and its history.</p>
      </Section>
      <Section title="hydor.json" sub="What Hydor runs it by. What the reader says of it shows as you type.">
        <Contract app={app} />
      </Section>
      {!!values.data?.values.length && (
        <Section title="What each place starts it with" sub="Names only. Inside Hydor and on a server alike; a key's value is never shown.">
          <dl className="divide-y divide-line" data-technical="values">
            {values.data.values.map((v) => (
              <div key={v.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 first:pt-0 last:pb-0">
                <dt>
                  <code translate="no" className="text-[12.5px]">
                    {v.name}
                  </code>
                </dt>
                <dd className="text-[12.5px] text-fg-3">{tr(WHAT[v.what])}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {!!hosts.data?.hosts.length && (
        <Section title="Servers and their keys" sub="Hydor made a key for each: the line below is what the server holds. The private half stays in Hydor's own folder.">
          <ul className="space-y-3" data-technical="hosts">
            {hosts.data.hosts.map((h) => (
              <li key={h.name}>
                <p translate="no" className="mb-1 text-[13px] break-all">
                  <span className="font-medium">{h.name}</span> <span className="text-fg-3">{h.ssh}</span>
                  {h.fingerprint && <span className="text-fg-3">{` · ${h.fingerprint}`}</span>}
                </p>
                {h.authorizedLine && <Line text={h.authorizedLine} />}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

/** Under the checks: the command that runs the same contract checker in a shell. */
export function CheckerCommand({ app }: { app: WebApp }) {
  const values = useLoaded<WebAppStartValues>(`/api/webapps/${enc(app.id)}/values`);
  if (!values.data?.check) return null;
  return (
    <section className="rounded-2xl border border-line bg-panel px-4 py-3 sm:px-5" data-technical="checker">
      <p className="mb-2 text-[13px] text-fg-2">Run the contract's checker in a shell of your own:</p>
      <Line text={values.data.check} />
    </section>
  );
}
