// The task form's watcher: what to look at (a feed, a page, a value in JSON, a folder, a command's
// output), how often, and a Test button that shows what it sees now. Checks make no model call; the
// agent wakes only when something changed.
import { useState } from 'react';
import { Eye } from 'lucide-react';
import { JSON_OP_TEXT, type JsonOp, type TaskSchedule, type WatchPreview, type WatchSpec } from '@shared/automations';
import { post } from '../../lib/api';
import { FolderChip } from '../../components/FolderPicker';
import { Button, cx, inputCls, Segmented } from '../../components/ui';
import { boxCls, Field } from './parts';

type Watch = Extract<TaskSchedule, { kind: 'watch' }>;

export const blankWatch = (kind: WatchSpec['kind'], home = '/'): WatchSpec =>
  kind === 'feed' ? { kind, url: '' } : kind === 'page' ? { kind, url: '' } : kind === 'json' ? { kind, url: '', path: '' } : kind === 'folder' ? { kind, path: home } : { kind, command: '', on: 'output' };

const small = cx(boxCls, 'h-8.5 text-[13px]');

export function WatchForm({ value, onChange, cwd }: { value: Watch; onChange: (s: Watch) => void; cwd: string }) {
  const w = value.watch;
  const set = (p: Record<string, unknown>) => onChange({ ...value, watch: { ...w, ...p } as WatchSpec });
  const [test, setTest] = useState<WatchPreview | null>(null);
  const [testing, setTesting] = useState(false);
  const [part, setPart] = useState<'all' | 'match' | 'selector'>(w.kind === 'page' ? (w.selector ? 'selector' : w.match ? 'match' : 'all') : 'all');
  const runTest = async () => {
    setTesting(true);
    try {
      setTest(await post<WatchPreview>('/api/automations/watch/test', { watch: w, cwd }));
    } catch (e) {
      setTest({ ok: false, note: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };
  const url = (placeholder: string) => (
    <Field label="Address">
      <input value={'url' in w ? w.url : ''} onChange={(e) => set({ url: e.target.value })} placeholder={placeholder} className={cx(small, 'w-full')} inputMode="url" />
    </Field>
  );
  return (
    <div className="space-y-3 rounded-xl border border-line-2 p-3">
      <div className="-mx-1 overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden">
        <Segmented<WatchSpec['kind']>
          size="sm"
          value={w.kind}
          onChange={(k) => {
            setTest(null);
            setPart('all');
            onChange({ ...value, watch: blankWatch(k, cwd) });
          }}
          options={[
            { value: 'feed', label: 'Feed' },
            { value: 'page', label: 'Page' },
            { value: 'json', label: 'JSON' },
            { value: 'folder', label: 'Folder' },
            { value: 'command', label: 'Command' },
          ]}
        />
      </div>
      {w.kind === 'feed' && (
        <>
          {url('https://example.com/feed.xml')}
          <p className="text-[12px] text-fg-3">An RSS or Atom feed: each new item wakes the agent, quoted for it.</p>
        </>
      )}
      {w.kind === 'page' && (
        <>
          {url('https://example.com/product')}
          <Field label="Which part" hint={part === 'selector' ? 'A simple selector: a tag, #id, .class or [attribute=value], combined or nested (main .price).' : part === 'match' ? 'Only the lines with this text (and the line before and after) count.' : 'Any change to its readable text counts.'}>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<'all' | 'match' | 'selector'>
                size="sm"
                value={part}
                onChange={(p) => {
                  setPart(p);
                  set({ match: undefined, selector: undefined });
                }}
                options={[
                  { value: 'all', label: 'Whole page' },
                  { value: 'match', label: 'Near a text' },
                  { value: 'selector', label: 'Selector' },
                ]}
              />
              {part === 'match' && <input value={w.match ?? ''} onChange={(e) => set({ match: e.target.value || undefined })} placeholder="Price" className={cx(small, 'min-w-0 flex-1')} />}
              {part === 'selector' && <input value={w.selector ?? ''} onChange={(e) => set({ selector: e.target.value || undefined })} placeholder=".price" className={cx(small, 'min-w-0 flex-1 font-mono')} />}
            </div>
          </Field>
        </>
      )}
      {w.kind === 'json' && (
        <>
          {url('https://api.example.com/status')}
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Value at" className="min-w-[9rem] flex-1">
              <input value={w.path} onChange={(e) => set({ path: e.target.value })} placeholder="data.price" className={cx(small, 'w-full font-mono')} />
            </Field>
            <Field label="Wake when it">
              <select value={w.op ?? 'changed'} onChange={(e) => set({ op: e.target.value === 'changed' ? undefined : e.target.value, value: e.target.value === 'changed' ? undefined : w.value })} className={cx(small, 'w-auto')}>
                {(Object.keys(JSON_OP_TEXT) as JsonOp[]).map((k) => (
                  <option key={k} value={k}>
                    {JSON_OP_TEXT[k]}
                  </option>
                ))}
              </select>
            </Field>
            {w.op && w.op !== 'changed' && (
              <Field label="Value" className="w-28">
                <input value={w.value ?? ''} onChange={(e) => set({ value: e.target.value })} placeholder="100" className={cx(small, 'w-full')} />
              </Field>
            )}
          </div>
        </>
      )}
      {w.kind === 'folder' && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Folder" className="min-w-0">
            <FolderChip value={w.path} onChange={(p) => set({ path: p })} />
          </Field>
          <Field label="Only files like" className="w-36">
            <input value={w.pattern ?? ''} onChange={(e) => set({ pattern: e.target.value || undefined })} placeholder="*.pdf" className={cx(small, 'w-full font-mono')} />
          </Field>
        </div>
      )}
      {w.kind === 'command' && (
        <>
          <Field label="Command" hint="Runs with your shell in the task’s folder at each check (a minute at most). Its output reaches the agent as outside data.">
            <textarea value={w.command} onChange={(e) => set({ command: e.target.value })} rows={2} placeholder="curl -fsS https://example.com/health" className={cx(inputCls, 'h-auto py-1.5 font-mono text-[12.5px]')} />
          </Field>
          <Segmented<'output' | 'exit'>
            size="sm"
            value={w.on ?? 'output'}
            onChange={(on) => set({ on })}
            options={[
              { value: 'output', label: 'When its output changes' },
              { value: 'exit', label: 'When its exit code changes' },
            ]}
          />
        </>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-2 text-[13px] text-fg-2">
          Check every
          <input
            type="number"
            min={1}
            value={value.minutes}
            onChange={(e) => onChange({ ...value, minutes: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
            className={cx(small, 'w-20')}
          />
          minutes
        </span>
        {'url' in w && (
          <label className="flex items-center gap-2 text-[12.5px] text-fg-2">
            <input type="checkbox" checked={!!w.local} onChange={(e) => set({ local: e.target.checked || undefined })} className="accent-[var(--accent)]" />
            Allow addresses on this computer or its network
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<Eye size={14} />} onClick={runTest} disabled={testing}>
          {testing ? 'Looking…' : 'Test'}
        </Button>
        <span className="text-[12px] text-fg-3">Shows what it sees now. The first look after saving only takes note; changes after it wake the agent.</span>
      </div>
      {test && (
        <div className={cx('rounded-lg border px-3 py-2', test.ok ? 'border-line bg-bg-1' : 'border-err/30 bg-err/5')}>
          <div className={cx('text-[12.5px] font-medium', test.ok ? 'text-fg' : 'text-err')}>{test.note}</div>
          {test.sample && <pre className="mt-1.5 max-h-56 overflow-auto font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-fg-2">{test.sample}</pre>}
        </div>
      )}
    </div>
  );
}
