// The answer UIs for code (code in tabs, commands, API endpoints, errors, test results, JSON, regular expressions, shortcuts, repositories): their views, by name (shared/answer-ui/code.ts has what each takes).
import { Fragment, useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BookMarked, Check, ChevronRight, ChevronsDownUp, ChevronsUpDown, CircleCheck, CircleMinus, CircleX, Copy as CopyIcon, GitFork, Lock, OctagonX, Route, Scale, Search, ShieldCheck, Star, TriangleAlert, Wrench } from 'lucide-react';
import { tr } from '../../../i18n/runtime';
import { CodeBlock } from '../../Markdown';
import { cx } from '../../ui';
import { arr, Ask, Card, Chip, compact, Copy, fmtDate, fmtNum, Head, hostOf, isObj, LinkOut, Md, num, Section, Seg, str, textOf, TONE, TONE_FILL, useKept, words, yes, type AnswerUiView, type Data, type Tone } from '../kit';

// ---- shared pieces ---------------------------------------------------------------------------------------------------

async function copyText(t: string) {
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/** A small copy button with an icon of its own (a value, a path). */
function MiniCopy({ text, title, icon: Icon = CopyIcon }: { text: string | (() => string); title: string; icon?: LucideIcon }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        void copyText(typeof text === 'function' ? text() : text);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}
      className="inline-grid h-5 w-5 place-items-center rounded text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg"
    >
      {ok ? <Check size={12} className="text-ok" /> : <Icon size={12} />}
    </button>
  );
}

/** A command in a box: its prompt, the command, and a copy button. */
function CommandLine({ cmd, prompt = '$', done, onCopy }: { cmd: string; prompt?: string; done: boolean; onCopy?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-line bg-code-bg py-1.5 pr-1.5 pl-3 font-mono text-[12.5px] leading-[1.6]">
      <span className="shrink-0 text-fg-3 select-none">{prompt}</span>
      <span className="min-w-0 flex-1 break-words whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">{cmd}</span>
      {done && (
        <span className="shrink-0" onClickCapture={onCopy}>
          <Copy text={cmd} />
        </span>
      )}
    </div>
  );
}

const TONE_TEXT: Record<Tone, string> = {
  good: 'text-ok',
  warn: 'text-warn',
  bad: 'text-err',
  info: 'text-info',
  accent: 'text-accent',
  neutral: 'text-fg-3',
};

// ---- code in tabs ------------------------------------------------------------------------------------------------------

const LANG_WORDS: [RegExp, string][] = [
  [/^(python|py)\b/i, 'python'],
  [/^(typescript|ts|tsx)\b/i, 'typescript'],
  [/^(javascript|js|node(\.?js)?|jsx)\b/i, 'javascript'],
  [/^(go|golang)\b/i, 'go'],
  [/^(bash|shell|sh|zsh|curl|terminal|wget)\b/i, 'bash'],
  [/^(powershell|pwsh)\b/i, 'powershell'],
  [/^c#|^csharp\b/i, 'csharp'],
  [/^c\+\+|^cpp\b/i, 'cpp'],
];

/** The language of a tab named "Python" or "app.py". */
function langOf(label: string): string {
  const l = label.trim();
  for (const [re, lang] of LANG_WORDS) if (re.test(l)) return lang;
  const ext = /\.([\w+-]+)$/.exec(l)?.[1];
  return ext ?? l.toLowerCase();
}

function CodeTabs({ data, done }: { data: Data; done: boolean }) {
  const tabs = arr(data.tabs ?? data.files ?? data.snippets ?? data.items)
    .filter(isObj)
    .map((t, i) => {
      const label = str(t.label ?? t.name ?? t.file ?? t.title);
      const lang = str(t.lang ?? t.language);
      return {
        label: label || lang || String(i + 1),
        lang: lang || langOf(label),
        code: str(t.code ?? t.content ?? t.text),
      };
    });
  if (!tabs.length && str(data.code))
    tabs.push({
      label: str(data.lang) || 'code',
      lang: str(data.lang),
      code: str(data.code),
    });
  const [pick, setPick] = useKept<number>('tab', 0);
  const at = Math.min(Math.max(0, num(pick) ?? 0), Math.max(0, tabs.length - 1));
  const cur = tabs[at];
  return (
    <Card>
      <Head title={data.title} />
      {cur && (
        <div className="code-block">
          <div className="flex items-center gap-1 border-b border-line pr-1.5 pl-1">
            <div role="tablist" className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto py-1">
              {tabs.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === at}
                  onClick={() => setPick(i)}
                  className={cx('shrink-0 rounded-md px-2.5 py-1 font-mono text-[12px] whitespace-nowrap transition-colors', i === at ? 'bg-bg-2 font-medium text-fg' : 'text-fg-3 hover:text-fg')}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {done && <Copy text={cur.code.replace(/\n$/, '')} />}
          </div>
          <CodeBlock bare code={cur.code} lang={cur.lang || null} />
        </div>
      )}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- commands -----------------------------------------------------------------------------------------------------------

interface Step {
  cmd: string;
  note: unknown;
  output: string;
}

const stepsOf = (v: unknown): Step[] =>
  arr(v)
    .map((s) => (isObj(s) ? s : { cmd: str(s) }))
    .map((s) => ({
      cmd: str(s.cmd ?? s.command ?? s.code ?? s.run),
      note: s.note ?? s.text ?? s.description,
      output: str(s.output ?? s.out),
    }))
    .filter((s) => s.cmd || str(s.note));

/** The tab for this computer's system, when one is named for it. */
function myOs(labels: string[]): number {
  if (typeof navigator === 'undefined') return 0;
  const ua = `${navigator.platform} ${navigator.userAgent}`;
  const mine = /Mac|iPhone|iPad/i.test(ua) ? /mac|os x|apple|darwin/i : /Win/i.test(ua) ? /win|powershell/i : /Linux|X11|CrOS/i.test(ua) ? /linux|ubuntu|debian|fedora|arch|unix/i : null;
  return Math.max(0, mine ? labels.findIndex((l) => mine.test(l)) : 0);
}

function Commands({ data, done }: { data: Data; done: boolean }) {
  const tabs = arr(data.os ?? data.platforms ?? data.tabs)
    .filter(isObj)
    .map((o, i) => ({
      label: str(o.label ?? o.name ?? o.os) || String(i + 1),
      steps: stepsOf(o.steps ?? o.commands),
    }));
  const [pick, setPick] = useKept<number | null>('os', null);
  const at = tabs.length ? Math.min(Math.max(0, num(pick) ?? myOs(tabs.map((t) => t.label))), tabs.length - 1) : 0;
  const steps = tabs.length ? tabs[at].steps : stepsOf(data.steps ?? data.commands);
  const prompt = tabs.length && /win|powershell/i.test(tabs[at].label) ? '>' : '$';
  const [ticked, setTicked] = useKept<Record<string, boolean>>('done', {});
  const key = (i: number) => `${tabs.length ? at : '-'}:${i}`;
  const cmds = steps.map((s) => s.cmd).filter(Boolean);
  return (
    <Card>
      <Head title={data.title} aside={done && cmds.length > 1 ? <Copy text={cmds.join('\n')} label={tr('Copy all')} /> : undefined} />
      {tabs.length > 1 && <Seg className="mb-3" options={tabs.map((t, i) => ({ value: i, label: t.label }))} value={at} onChange={(i) => setPick(i)} />}
      <ol className="m-0 list-none space-y-3 p-0">
        {steps.map((s, i) => {
          const ok = !!ticked[key(i)];
          return (
            <li key={`${at}:${i}`} className="flex gap-3">
              <button
                type="button"
                disabled={!done}
                onClick={() => setTicked((t) => ({ ...t, [key(i)]: !ok }))}
                aria-label={ok ? tr('Not done yet') : tr('Done')}
                className={cx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold transition-colors', ok ? 'bg-ok text-panel' : 'bg-bg-2 text-fg-2 hover:bg-bg-3')}
              >
                {ok ? <Check size={13} strokeWidth={3} /> : i + 1}
              </button>
              <div className="min-w-0 flex-1">
                {str(s.note) && <Md text={s.note} className="mb-1.5 pt-0.5 text-[13.5px] text-fg-2" />}
                {s.cmd && <CommandLine cmd={s.cmd} prompt={prompt} done={done} onCopy={() => setTicked((t) => ({ ...t, [key(i)]: true }))} />}
                {s.output && <pre className="m-0 mt-1 max-h-48 overflow-auto rounded-lg bg-bg-1 px-3 py-1.5 font-mono text-[12px] leading-[1.5] break-words whitespace-pre-wrap text-fg-3 [overflow-wrap:anywhere]">{s.output}</pre>}
              </div>
            </li>
          );
        })}
      </ol>
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- an API endpoint ---------------------------------------------------------------------------------------------------------

const METHOD_TONE: Record<string, Tone> = {
  GET: 'info',
  POST: 'good',
  PUT: 'warn',
  PATCH: 'warn',
  DELETE: 'bad',
};
const PLACES = ['path', 'query', 'header', 'body'] as const;
const PLACE_LABEL: Record<(typeof PLACES)[number], () => string> = {
  path: () => tr('Path parameters'),
  query: () => tr('Query parameters'),
  header: () => tr('Headers'),
  body: () => tr('Body'),
};
const statusTone = (n: number | null): Tone => (n === null ? 'neutral' : n < 300 ? 'good' : n < 400 ? 'info' : n < 500 ? 'warn' : 'bad');

/** A path with its parameters ({id}, :id) in the accent. */
function PathText({ path }: { path: string }) {
  return (
    <>
      {path.split(/(\{[^}]+\}|(?<=\/):[A-Za-z_]\w*)/).map((p, i) =>
        i % 2 ? (
          <span key={i} className="text-accent">
            {p}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** A response's body: JSON laid out, anything else as it is. */
function bodyText(v: unknown): { code: string; json: boolean } {
  if (isObj(v) || Array.isArray(v)) return { code: JSON.stringify(v, null, 2), json: true };
  const s = str(v);
  if (/^\s*[[{]/.test(s))
    try {
      return { code: JSON.stringify(JSON.parse(s), null, 2), json: true };
    } catch {}
  return { code: s, json: false };
}

function Api({ data, done }: { data: Data; done: boolean }) {
  const method = (str(data.method) || 'GET').toUpperCase();
  const path = str(data.path ?? data.url ?? data.endpoint ?? data.route);
  const params = arr(data.params ?? data.parameters).filter(isObj);
  const placeOf = (p: Data) => {
    const s = str(p.in ?? p.location).toLowerCase();
    if (/path|url/.test(s)) return 'path';
    if (/head/.test(s)) return 'header';
    if (/body|json|form|payload/.test(s)) return 'body';
    if (/query|search/.test(s)) return 'query';
    return method === 'GET' || method === 'DELETE' ? 'query' : 'body';
  };
  const groups = PLACES.map((k) => ({
    k,
    items: params.filter((p) => placeOf(p) === k),
  })).filter((g) => g.items.length);
  const request = isObj(data.request) ? data.request : str(data.request) ? { code: str(data.request) } : null;
  const responses = arr(data.responses).filter(isObj);
  const [pick, setPick] = useKept<number>('response', 0);
  const at = Math.min(Math.max(0, num(pick) ?? 0), Math.max(0, responses.length - 1));
  const r = responses[at];
  const body = r && (str(r.body) || isObj(r.body) || Array.isArray(r.body)) ? bodyText(r.body) : null;
  return (
    <Card>
      {path && (
        <div className="flex min-w-0 items-start gap-2.5">
          <span className={cx('mt-px shrink-0 rounded-md px-2 py-0.5 font-mono text-[12px] font-bold tracking-wide', TONE[METHOD_TONE[method] ?? 'neutral'])}>{method}</span>
          <span className="min-w-0 flex-1 pt-px font-mono text-[14px] font-medium break-all">
            <PathText path={path} />
          </span>
          {done && <Copy text={path} label={tr('Copy the path')} />}
        </div>
      )}
      {str(data.summary) && <Md text={data.summary} className="mt-2.5 text-[13.5px] text-fg-2" />}
      {str(data.auth) && (
        <div className="mt-2.5 flex items-start gap-1.5 text-[12.5px] text-fg-2">
          <Lock size={13} className="mt-0.5 shrink-0 text-fg-3" />
          <span className="min-w-0">{str(data.auth)}</span>
        </div>
      )}
      {groups.map((g) => (
        <Section key={g.k} title={PLACE_LABEL[g.k]()} className="mt-4">
          <div className="divide-y divide-line/70 rounded-lg border border-line">
            {g.items.map((p, i) => (
              <div key={i} className="px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-mono text-[13px] font-semibold break-all">{str(p.name)}</span>
                  {str(p.type) && <span className="font-mono text-[12px] text-fg-3">{str(p.type)}</span>}
                  {yes(p.required) && <span className="text-[11.5px] font-medium text-warn">{tr('required')}</span>}
                </div>
                {str(p.description) && <Md text={p.description} className="mt-0.5 text-[13px] text-fg-2" />}
              </div>
            ))}
          </div>
        </Section>
      ))}
      {request && str(request.code) && (
        <Section title={tr('Example request')} className="mt-4">
          <CodeBlock code={str(request.code)} lang={str(request.lang) || 'bash'} className="!my-0" />
        </Section>
      )}
      {responses.length > 0 && (
        <Section title={tr('Responses')} className="mt-4">
          <Seg
            size="sm"
            options={responses.map((x, i) => ({
              value: i,
              label: (
                <span className="inline-flex items-center gap-1.5 font-mono">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: TONE_FILL[statusTone(num(x.status ?? x.code))],
                    }}
                    aria-hidden
                  />
                  {str(x.status ?? x.code) || '—'}
                </span>
              ),
            }))}
            value={at}
            onChange={setPick}
          />
          {r && (
            <div className="mt-2">
              {str(r.description) && <Md text={r.description} className="text-[13px] text-fg-2" />}
              {body && <CodeBlock code={body.code} lang={body.json ? 'json' : str(r.lang) || null} className="!mb-0" />}
            </div>
          )}
        </Section>
      )}
    </Card>
  );
}

// ---- an error, explained -------------------------------------------------------------------------------------------

const LIKELY: Record<string, { bars: number; label: () => string }> = {
  high: { bars: 3, label: () => tr('Most likely') },
  medium: { bars: 2, label: () => tr('Possible') },
  low: { bars: 1, label: () => tr('Less likely') },
};

function Likelihood({ level }: { level: string }) {
  const l = LIKELY[level];
  if (!l) return null;
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1.5 pt-0.5 text-[11.5px] font-medium', l.bars === 3 ? 'text-fg' : 'text-fg-3')}>
      <span className="inline-flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2].map((k) => (
          <span key={k} className={cx('w-[3px] rounded-[1px]', k < l.bars ? (l.bars === 3 ? 'bg-accent' : 'bg-fg-3') : 'bg-bg-3')} style={{ height: 5 + k * 3 }} />
        ))}
      </span>
      {l.label()}
    </span>
  );
}

/** The line that names the error ("ModuleNotFoundError: …", "error[E0308]: …"): the last that does, else the first. */
function keyLine(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) if (/^\s*(?:[\w.$]*(?:Error|Exception|Fault)\b|panic\b|fatal\b|error\b|E\d{3,})/i.test(lines[i])) return i;
  return 0;
}

/** An error's text, its naming line in bold; a long one folded in the middle. */
function ErrorText({ lines, at }: { lines: string[]; at: number }) {
  const [all, setAll] = useState(false);
  const long = lines.length > 14 && !all;
  const shown: (number | null)[] = long ? [0, 1, 2, 3, null, ...lines.map((_, i) => i).slice(-6)] : lines.map((_, i) => i);
  if (long && at > 3 && at < lines.length - 6) shown.splice(5, 0, at);
  return (
    <pre className="m-0 min-w-0 flex-1 font-mono text-[12.5px] leading-[1.6] break-words whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">
      {shown.map((i, k) =>
        i === null ? (
          <button key={`f${k}`} type="button" onClick={() => setAll(true)} className="block text-fg-3 hover:text-fg">
            ⋯ {tr('{0} more lines').replace('{0}', fmtNum(lines.length - shown.length + 1))}
          </button>
        ) : (
          <span key={i} className={cx('block', i === at && lines.length > 1 && 'font-semibold')}>
            {lines[i] || ' '}
          </span>
        ),
      )}
    </pre>
  );
}

function ErrorUi({ data, done }: { data: Data; done: boolean }) {
  const error = str(data.error ?? data.message).replace(/\s+$/, '');
  const lines = error ? error.split('\n') : [];
  const at = keyLine(lines);
  const causes = arr(data.causes ?? data.fixes)
    .map((c) => (isObj(c) ? c : { cause: str(c) }))
    .filter((c) => str(c.cause ?? c.text) || str(c.fix));
  const prevent = arr(data.prevent)
    .map((p) => textOf(p))
    .filter(Boolean);
  const docs = arr(data.docs ?? data.links)
    .map((d) => (isObj(d) ? d : { url: str(d) }))
    .filter((d) => /^https?:/i.test(str(d.url)));
  return (
    <Card>
      {str(data.where) && <div className="mb-1.5 font-mono text-[12px] text-fg-3">{str(data.where)}</div>}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-err/30 bg-err/[0.07] py-2.5 pr-1.5 pl-3">
          <OctagonX size={16} className="mt-0.5 shrink-0 text-err" />
          <ErrorText lines={lines} at={at} />
          {done && <Copy text={error} label={tr('Copy the error')} />}
        </div>
      )}
      {causes.length > 0 && (
        <Section title={causes.length > 1 ? tr('Likely causes') : tr('The cause')} className="mt-4">
          <ol className="m-0 list-none space-y-2.5 p-0">
            {causes.map((c, i) => (
              <li key={i} className="rounded-xl border border-line p-3">
                <div className="flex items-start gap-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bg-2 text-[12px] font-semibold text-fg-2">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <Md text={c.cause ?? c.text} className="min-w-0 flex-1 pt-0.5 text-[14px] font-medium text-fg" />
                      <Likelihood level={str(c.likelihood ?? c.likely).toLowerCase()} />
                    </div>
                    {str(c.fix) && (
                      <div className="mt-1.5 flex gap-2 text-[13.5px] text-fg-2">
                        <Wrench size={13} className="mt-[4px] shrink-0 text-fg-3" />
                        <Md text={c.fix} className="min-w-0 flex-1" />
                      </div>
                    )}
                    {str(c.code) && <CodeBlock code={str(c.code)} lang={str(c.lang) || 'bash'} className="!mb-0" />}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}
      {prevent.length > 0 && (
        <Section title={tr('Next time')} className="mt-4">
          <ul className="m-0 list-none space-y-1.5 p-0">
            {prevent.map((p, i) => (
              <li key={i} className="flex gap-2 text-[13.5px] text-fg-2">
                <ShieldCheck size={14} className="mt-[3px] shrink-0 text-fg-3" />
                <Md text={p} inline />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {(docs.length > 0 || (done && error)) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-[13px]">
          {docs.map((d, i) => (
            <LinkOut key={i} url={d.url}>
              {str(d.label) || hostOf(d.url)}
            </LinkOut>
          ))}
          {done && error && (
            <Ask text={tr('I tried these fixes and still get this error: {0}').replace('{0}', lines[at] ?? error)} className="ml-auto">
              {tr('Still failing')}
            </Ask>
          )}
        </div>
      )}
    </Card>
  );
}

// ---- test results --------------------------------------------------------------------------------------------------------

function Tests({ data, done }: { data: Data; done: boolean }) {
  const passed = num(data.passed) ?? 0;
  const failed = num(data.failed) ?? 0;
  const skipped = num(data.skipped) ?? 0;
  const total = passed + failed + skipped;
  const counted = num(data.passed) !== null || num(data.failed) !== null;
  const failures = arr(data.failures).filter(isObj);
  const suites = arr(data.suites).filter((s) => isObj(s) && str(s.name));
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });
  const parts: { n: number; tone: Tone; label: string; Icon: LucideIcon }[] = [
    { n: passed, tone: 'good', label: tr('Passed'), Icon: CircleCheck },
    { n: failed, tone: 'bad', label: tr('Failed'), Icon: CircleX },
    { n: skipped, tone: 'neutral', label: tr('Skipped'), Icon: CircleMinus },
  ];
  const sub = [total ? tr('{0} tests').replace('{0}', fmtNum(total)) : '', str(data.duration)].filter(Boolean).join(' · ');
  return (
    <Card>
      <Head title={data.title} sub={sub} aside={total > 0 && done ? <Chip tone={failed ? 'bad' : 'good'}>{failed ? tr('Failing') : tr('All passing')}</Chip> : undefined} />
      {counted && (
        <div className="grid grid-cols-3 gap-2">
          {parts.map((p) => (
            <div key={p.label} className="min-w-0 rounded-xl bg-bg-1 px-3 py-2.5">
              <div className={cx('flex items-center gap-1.5 truncate text-[12px] font-medium', p.n ? TONE_TEXT[p.tone] : 'text-fg-3')}>
                <p.Icon size={14} className="shrink-0" />
                {p.label}
              </div>
              <div className="mt-0.5 text-[22px] leading-tight font-semibold tabular-nums">{fmtNum(p.n)}</div>
            </div>
          ))}
        </div>
      )}
      {total > 0 && (
        <div className="mt-3 flex h-2 gap-[2px] overflow-hidden rounded-full" aria-hidden>
          {parts
            .filter((p) => p.n > 0)
            .map((p) => (
              <span key={p.label} style={{ flex: p.n, background: TONE_FILL[p.tone] }} />
            ))}
        </div>
      )}
      {failures.length > 0 && (
        <Section title={tr('Failures')} className="mt-4">
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {failures.map((f, i) => {
              const on = !!open[i];
              return (
                <div key={i}>
                  <button type="button" onClick={() => setOpen((o) => ({ ...o, [i]: !on }))} aria-expanded={on} className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-1">
                    <ChevronRight size={14} className={cx('mt-[3px] shrink-0 text-fg-3 transition-transform', on && 'rotate-90')} />
                    <CircleX size={14} className="mt-[3px] shrink-0 text-err" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium break-words">{str(f.name ?? f.test ?? f.title)}</span>
                      {str(f.file) && <span className="block font-mono text-[11.5px] break-all text-fg-3">{str(f.file)}</span>}
                    </span>
                  </button>
                  {on && (str(f.message) || str(f.trace)) && (
                    <div className="px-3 pb-3 pl-[46px]">
                      {str(f.message) && <pre className="m-0 font-mono text-[12.5px] leading-[1.55] break-words whitespace-pre-wrap text-err [overflow-wrap:anywhere]">{str(f.message)}</pre>}
                      {str(f.trace) && <pre className="m-0 mt-2 max-h-64 overflow-auto rounded-lg bg-code-bg px-3 py-2 font-mono text-[12px] leading-[1.55] break-words whitespace-pre-wrap text-fg-2 [overflow-wrap:anywhere]">{str(f.trace)}</pre>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
      {suites.length > 0 && (
        <Section title={tr('By suite')} className="mt-4">
          <div className="space-y-1.5">
            {suites.map((s, i) => {
              const counts: [number, Tone][] = [
                [num(s.passed) ?? 0, 'good'],
                [num(s.failed) ?? 0, 'bad'],
                [num(s.skipped) ?? 0, 'neutral'],
              ];
              const f = counts[1][0];
              return (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(56px,140px)_minmax(72px,auto)] items-center gap-3 text-[13px]">
                  <span className="truncate font-mono text-[12.5px]">{str(s.name)}</span>
                  <span className="flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-bg-3" aria-hidden>
                    {counts
                      .filter(([n]) => n > 0)
                      .map(([n, tone]) => (
                        <span key={tone} style={{ flex: n, background: TONE_FILL[tone] }} />
                      ))}
                  </span>
                  <span className="text-right text-[12px] whitespace-nowrap tabular-nums">
                    <span className="text-fg-2">{fmtNum(counts[0][0])} ✓</span>
                    {f > 0 && <span className="ml-2 font-semibold text-err">{fmtNum(f)} ✗</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}
      {done && failures.length > 0 && (
        <div className="mt-4">
          <Ask text={`${tr('Help me fix these failing tests:')}\n${failures.map((f) => `- ${str(f.name ?? f.test ?? f.title)}${str(f.file) ? ` (${str(f.file)})` : ''}: ${str(f.message).split('\n')[0]}`).join('\n')}`}>{tr('Ask to fix them')}</Ask>
        </div>
      )}
    </Card>
  );
}

// ---- JSON as a tree -----------------------------------------------------------------------------------------------------

const IDENT = /^[A-Za-z_$][\w$]*$/;
const pathTo = (parent: string, key: string | number) => (typeof key === 'number' ? `${parent}[${key}]` : IDENT.test(key) ? (parent ? `${parent}.${key}` : key) : `${parent}[${JSON.stringify(key)}]`);
const valueText = (v: unknown) => (typeof v === 'string' ? v : (JSON.stringify(v, null, 2) ?? String(v)));
const ROWS_MAX = 100;

interface JCtx {
  open: number;
  all: boolean | null;
  flips: Record<string, boolean>;
  flip: (path: string, on: boolean) => void;
  done: boolean;
}

function Scalar({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="text-fg-3">null</span>;
  if (typeof v === 'string') return <span className="text-ok">{JSON.stringify(v)}</span>;
  if (typeof v === 'number') return <span className="text-info">{String(v)}</span>;
  if (typeof v === 'boolean') return <span className="text-warn">{String(v)}</span>;
  return <span>{String(v)}</span>;
}

function JRow({ k, v, path, depth, last, ctx }: { k: string | number | null; v: unknown; path: string; depth: number; last: boolean; ctx: JCtx }) {
  const [more, setMore] = useState(false);
  const list = Array.isArray(v);
  const branch = list || isObj(v);
  const entries: [string | number, unknown][] = list ? (v as unknown[]).map((x, i) => [i, x]) : branch ? Object.entries(v as Data) : [];
  const on = branch && (ctx.flips[path] ?? ctx.all ?? depth < ctx.open);
  const shown = more ? entries : entries.slice(0, ROWS_MAX);
  const [l, r] = list ? ['[', ']'] : ['{', '}'];
  const comma = last ? '' : ',';
  const pad = 4 + depth * 16;
  const size = list ? (entries.length === 1 ? tr('1 item') : tr('{0} items').replace('{0}', fmtNum(entries.length))) : entries.length === 1 ? tr('1 key') : tr('{0} keys').replace('{0}', fmtNum(entries.length));
  const toggle = () => ctx.flip(path, !on);
  return (
    <>
      <div className="group/j flex min-w-0 items-start rounded-md hover:bg-bg-2/70" style={{ paddingLeft: pad }}>
        <span className="flex h-[1.7em] w-4 shrink-0 items-center">
          {branch && entries.length > 0 && (
            <button type="button" onClick={toggle} aria-expanded={on} aria-label={on ? tr('Close') : tr('Open')} className="grid h-4 w-4 place-items-center rounded text-fg-3 hover:text-fg">
              <ChevronRight size={12} className={cx('transition-transform', on && 'rotate-90')} />
            </button>
          )}
        </span>
        <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
          {k !== null && (
            <>
              <span className={typeof k === 'number' ? 'text-fg-3' : 'text-accent'}>{typeof k === 'number' ? k : JSON.stringify(k)}</span>
              <span className="text-fg-3">: </span>
            </>
          )}
          {!branch ? (
            <>
              <Scalar v={v} />
              <span className="text-fg-3">{comma}</span>
            </>
          ) : on || !entries.length ? (
            <span className="text-fg-3">{entries.length ? l : `${l}${r}${comma}`}</span>
          ) : (
            <button type="button" onClick={toggle} className="text-left">
              <span className="text-fg-3">
                {l}…{r}
                {comma}
              </span>
              <span className="ml-2 font-sans text-[11.5px] text-fg-3">{size}</span>
            </button>
          )}
        </span>
        {ctx.done && (
          <span className="invisible flex shrink-0 gap-0.5 pr-1 group-focus-within/j:visible group-hover/j:visible">
            <MiniCopy text={() => valueText(v)} title={tr('Copy the value')} />
            {path && <MiniCopy text={path} title={tr('Copy its path: {0}').replace('{0}', path)} icon={Route} />}
          </span>
        )}
      </div>
      {on && entries.length > 0 && (
        <>
          {shown.map(([ck, cv], i) => (
            <JRow key={String(ck)} k={ck} v={cv} path={pathTo(path, ck)} depth={depth + 1} last={i === entries.length - 1} ctx={ctx} />
          ))}
          {entries.length > shown.length && (
            <button type="button" onClick={() => setMore(true)} className="block py-0.5 font-sans text-[12px] text-fg-3 hover:text-fg" style={{ paddingLeft: pad + 32 }}>
              ⋯ {tr('Show {0} more').replace('{0}', fmtNum(entries.length - shown.length))}
            </button>
          )}
          <div className="text-fg-3" style={{ paddingLeft: pad + 16 }}>
            {r}
            {comma}
          </div>
        </>
      )}
    </>
  );
}

function JsonTree({ data, done }: { data: Data; done: boolean }) {
  const value = useMemo(() => {
    let v: unknown = 'data' in data ? data.data : done ? Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'title' && k !== 'open')) : undefined;
    if (typeof v === 'string' && /^\s*[[{]/.test(v))
      try {
        v = JSON.parse(v);
      } catch {}
    return v;
  }, [data, done]);
  const [all, setAll] = useState<boolean | null>(null);
  const [flips, setFlips] = useState<Record<string, boolean>>({});
  const ctx: JCtx = {
    open: Math.max(0, num(data.open) ?? 2),
    all,
    flips,
    flip: (p, on) => setFlips((f) => ({ ...f, [p]: on })),
    done,
  };
  const branch = isObj(value) || Array.isArray(value);
  return (
    <Card>
      <Head
        title={data.title}
        className={cx(!str(data.title) && 'mb-2')}
        aside={
          done && value !== undefined ? (
            <span className="flex items-center gap-0.5">
              {branch && (
                <>
                  <button
                    type="button"
                    onClick={() => (setFlips({}), setAll(true))}
                    title={tr('Open all')}
                    aria-label={tr('Open all')}
                    className="inline-grid h-6 w-6 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg"
                  >
                    <ChevronsUpDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => (setFlips({}), setAll(false))}
                    title={tr('Close all')}
                    aria-label={tr('Close all')}
                    className="inline-grid h-6 w-6 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg"
                  >
                    <ChevronsDownUp size={13} />
                  </button>
                </>
              )}
              <Copy text={() => JSON.stringify(value, null, 2) ?? ''} label={tr('Copy as JSON')} />
            </span>
          ) : undefined
        }
      />
      {value !== undefined && (
        <div className="-mx-1 overflow-x-auto rounded-lg bg-code-bg px-1 py-1.5 font-mono text-[12.5px] leading-[1.7]">
          <JRow k={null} v={value} path="" depth={0} last ctx={ctx} />
        </div>
      )}
    </Card>
  );
}

// ---- a regular expression ------------------------------------------------------------------------------------------------

const TEXT_MAX = 4000;
const MATCHES_MAX = 500;
/** A group that repeats inside a repeat ((a+)+): such patterns can take very long on a long line, so lines are kept short. */
const NESTED = /\([^()]*[+*][^()]*\)[+*{]/;

interface Hit {
  at: number;
  end: number;
  groups: [string, string | undefined][];
}

function lineHits(re: RegExp, line: string, budget: { n: number }): Hit[] {
  const out: Hit[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while (budget.n < MATCHES_MAX && (m = re.exec(line))) {
    const named = m.groups ? Object.entries(m.groups) : [];
    out.push({
      at: m.index,
      end: m.index + m[0].length,
      groups: named.length ? named : m.slice(1).map((g, i) => [`$${i + 1}`, g]),
    });
    budget.n++;
    if (!m[0].length) re.lastIndex += (line.codePointAt(re.lastIndex) ?? 0) > 0xffff ? 2 : 1;
    if (!re.global) break;
  }
  return out;
}

const MARKS = ['bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]', 'bg-[color-mix(in_srgb,var(--info)_28%,transparent)]'];
const TEXTBOX = 'm-0 block w-full rounded-lg border px-3 py-2 font-mono text-[13px] leading-[1.7] break-words whitespace-pre-wrap';

function RegexUi({ data, done }: { data: Data; done: boolean }) {
  const pattern = str(data.pattern ?? data.regex);
  const flags = [...new Set(str(data.flags).replace(/[^dgimsuvy]/g, ''))].join('');
  const explain = arr(data.explain ?? data.parts)
    .map((p) => (isObj(p) ? p : { part: str(p) }))
    .map((p) => ({
      part: str(p.part ?? p.token),
      meaning: p.meaning ?? p.text ?? p.explain,
    }))
    .filter((p) => p.part || str(p.meaning));
  const compiled = useMemo((): { re: RegExp | null; error: string } => {
    if (!pattern) return { re: null, error: '' };
    try {
      return {
        re: new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`),
        error: '',
      };
    } catch (e) {
      return { re: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [pattern, flags]);
  // Where each explained part sits in the pattern, in order.
  const segments = useMemo(() => {
    const out: { text: string; part: number }[] = [];
    let at = 0;
    explain.forEach((p, i) => {
      const k = p.part ? pattern.indexOf(p.part, at) : -1;
      if (k < 0) return;
      if (k > at) out.push({ text: pattern.slice(at, k), part: -1 });
      out.push({ text: p.part, part: i });
      at = k + p.part.length;
    });
    if (at < pattern.length) out.push({ text: pattern.slice(at), part: -1 });
    return out;
  }, [explain, pattern]);
  const [hover, setHover] = useState<number | null>(null);
  const sample = arr(data.tests ?? data.examples)
    .map((t) => textOf(t))
    .join('\n');
  const [edited, setEdited] = useState<string | null>(null);
  const text = (edited ?? sample).slice(0, TEXT_MAX);
  const typed = useDeferredValue(text);
  const lineMax = NESTED.test(pattern) ? 80 : 1000;
  const result = useMemo(() => {
    const re = compiled.re;
    if (!re) return null;
    const budget = { n: 0 };
    let long = false;
    const lines = typed.split('\n').map((line) => {
      if (line.length > lineMax) {
        long = true;
        return { line, hits: [] as Hit[] };
      }
      return { line, hits: lineHits(re, line, budget) };
    });
    return { lines, count: budget.n, long };
  }, [compiled, typed, lineMax]);
  const hits = result ? result.lines.flatMap((l) => l.hits.map((h) => ({ ...h, text: l.line.slice(h.at, h.end) }))) : [];
  const grouped = hits.filter((h) => h.groups.length > 0);
  let mark = 0;
  return (
    <Card>
      {pattern && (
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1 font-mono text-[15px] leading-[1.7] break-all">
            <span className="text-fg-3">/</span>
            {segments.map((s, i) =>
              s.part < 0 ? (
                <span key={i}>{s.text}</span>
              ) : (
                <span key={i} onMouseEnter={() => setHover(s.part)} onMouseLeave={() => setHover(null)} className={cx('rounded-[3px] transition-colors', hover === s.part ? 'bg-accent text-accent-fg' : s.part % 2 ? 'bg-bg-3' : 'bg-bg-2')}>
                  {s.text}
                </span>
              ),
            )}
            <span className="text-fg-3">/</span>
            {flags && <span className="text-accent">{flags}</span>}
          </div>
          {done && <Copy text={pattern} label={tr('Copy the pattern')} />}
        </div>
      )}
      {done && compiled.error && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-err/10 px-3 py-2 text-[13px] text-err">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span className="min-w-0">
            {tr('This pattern does not work here:')} <span className="font-mono text-[12.5px]">{compiled.error}</span>
          </span>
        </div>
      )}
      {explain.length > 0 && (
        <div className="mt-3 grid gap-x-3 gap-y-1 @md:grid-cols-[auto_minmax(0,1fr)]">
          {explain.map((p, i) => (
            <div key={i} className="contents" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <span className={cx('self-start justify-self-start rounded-md px-1.5 py-0.5 font-mono text-[12.5px] break-all transition-colors @md:max-w-[240px]', hover === i ? 'bg-accent text-accent-fg' : 'bg-bg-2 text-fg')}>{p.part}</span>
              <Md text={p.meaning} className="mb-1.5 pt-0.5 text-[13.5px] text-fg-2 @md:mb-0" />
            </div>
          ))}
        </div>
      )}
      {(sample || done) && result && (
        <Section
          title={tr('Try it')}
          className="mt-4"
          aside={<span className="text-[12px] text-fg-3 tabular-nums">{result.count === 0 ? tr('No match') : result.count === 1 ? tr('1 match') : tr('{0} matches').replace('{0}', fmtNum(result.count))}</span>}
        >
          <div className="relative">
            <div aria-hidden className={cx(TEXTBOX, 'border-line bg-code-bg text-fg')}>
              {result.lines.map((l, li) => {
                let at = 0;
                const parts: ReactNode[] = [];
                for (const h of l.hits) {
                  if (h.end <= h.at) continue;
                  if (h.at > at) parts.push(l.line.slice(at, h.at));
                  parts.push(
                    <mark key={h.at} className={cx('rounded-[3px] text-fg', MARKS[mark++ % 2])}>
                      {l.line.slice(h.at, h.end)}
                    </mark>,
                  );
                  at = h.end;
                }
                parts.push(l.line.slice(at));
                return (
                  <Fragment key={li}>
                    {li > 0 && '\n'}
                    {parts}
                  </Fragment>
                );
              })}
              {'​'}
            </div>
            {done && (
              <textarea
                value={text}
                onChange={(e) => setEdited(e.target.value.slice(0, TEXT_MAX))}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label={tr('Type some text to test')}
                placeholder={tr('Type some text to test')}
                className={cx(TEXTBOX, 'absolute inset-0 h-full resize-none overflow-hidden border-transparent bg-transparent text-transparent caret-fg outline-none focus:border-accent')}
              />
            )}
          </div>
          {result.long && <div className="mt-1 text-[12px] text-fg-3">{tr('Lines over {0} characters are not tested.').replace('{0}', fmtNum(lineMax))}</div>}
          {grouped.length > 0 && (
            <div className="mt-2.5 space-y-1">
              {grouped.slice(0, 6).map((h, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[12px]">
                  <span className="font-medium text-fg">{h.text}</span>
                  {h.groups.map(([name, g]) => (
                    <span key={name} className="text-fg-3">
                      {name} <span className="text-fg-2">{g ?? '—'}</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </Card>
  );
}

// ---- keyboard shortcuts ----------------------------------------------------------------------------------------------------

const MAC_KEYS: Record<string, string> = {
  cmd: '⌘',
  command: '⌘',
  meta: '⌘',
  super: '⌘',
  option: '⌥',
  opt: '⌥',
  alt: '⌥',
  shift: '⇧',
  ctrl: '⌃',
  control: '⌃',
  enter: '↩',
  return: '↩',
  backspace: '⌫',
  delete: '⌫',
  esc: 'esc',
  escape: 'esc',
  tab: '⇥',
};
const ARROWS: Record<string, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
};
const KEY_NAMES: Record<string, string> = {
  '⌘': 'Command',
  '⌥': 'Option',
  '⇧': 'Shift',
  '⌃': 'Control',
  '↩': 'Return',
  '⌫': 'Delete',
  '⇥': 'Tab',
};

/** "Ctrl+K Ctrl+S" as its steps and each step's keys: [["Ctrl", "K"], ["Ctrl", "S"]]; Mac keys as their signs. */
function keySteps(combo: string, mac: boolean): string[][] {
  return combo
    .replace(/\s*\+\s*/g, '+')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((step) =>
      step.split(/\+(?=.)/).map((k) => {
        const low = k.toLowerCase();
        if (ARROWS[low]) return ARROWS[low];
        if (mac && MAC_KEYS[low]) return MAC_KEYS[low];
        return k.length === 1 ? k.toUpperCase() : k;
      }),
    );
}

function Keys({ combo, mac }: { combo: string; mac: boolean }) {
  const steps = keySteps(combo, mac);
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {steps.map((keys, s) => (
        <Fragment key={s}>
          {s > 0 && <span className="px-0.5 text-[11.5px] text-fg-3">{tr('then')}</span>}
          {keys.map((k, i) => (
            <kbd
              key={i}
              title={KEY_NAMES[k]}
              className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border border-line-2 bg-bg-1 px-1.5 font-sans text-[11.5px] leading-none font-medium text-fg-2 shadow-[inset_0_-1.5px_0_var(--line-2)]"
            >
              {k}
            </kbd>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

const onMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(`${navigator.platform} ${navigator.userAgent}`);

function Shortcuts({ data }: { data: Data }) {
  const groups = (arr(data.groups).length ? arr(data.groups) : [{ name: '', keys: data.keys ?? data.shortcuts }])
    .filter(isObj)
    .map((g) => ({
      name: str(g.name ?? g.title),
      keys: arr(g.keys ?? g.shortcuts ?? g.items)
        .filter(isObj)
        .map((k) => ({
          keys: str(k.keys ?? k.key ?? k.shortcut),
          mac: str(k.mac),
          action: textOf(k, 'action', 'does', 'description', 'name'),
        }))
        .filter((k) => k.keys || k.action),
    }))
    .filter((g) => g.keys.length);
  const both = groups.some((g) => g.keys.some((k) => k.mac));
  const [os, setOs] = useKept<'mac' | 'win' | null>('os', null);
  const mac = both && (os ?? (onMac() ? 'mac' : 'win')) === 'mac';
  const [q, setQ] = useState('');
  const total = groups.reduce((n, g) => n + g.keys.length, 0);
  const t = q.trim().toLowerCase();
  const shown = t
    ? groups
        .map((g) => ({
          ...g,
          keys: g.keys.filter((k) => `${k.action} ${k.keys} ${k.mac}`.toLowerCase().includes(t)),
        }))
        .filter((g) => g.keys.length)
    : groups;
  return (
    <Card>
      <Head
        title={data.title || data.app}
        sub={data.title ? data.app : undefined}
        aside={
          both ? (
            <Seg
              size="sm"
              options={[
                { value: 'win', label: tr('Windows') },
                { value: 'mac', label: tr('Mac') },
              ]}
              value={mac ? 'mac' : 'win'}
              onChange={(v) => setOs(v)}
            />
          ) : undefined
        }
      />
      {total > 12 && (
        <label className="relative mb-3 block">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Filter')} className="h-8 w-full rounded-lg border border-line bg-bg-1 pr-2 pl-8 text-[13px] outline-none focus:border-accent @md:w-60" />
        </label>
      )}
      <div className="gap-x-8 @2xl:columns-2">
        {shown.map((g, gi) => (
          <Section key={gi} title={g.name || undefined} className="mb-4 break-inside-avoid last:mb-0">
            {g.keys.map((k, i) => (
              <div key={i} className="flex min-w-0 items-center justify-between gap-3 border-b border-line/60 py-1.5 last:border-b-0">
                <span className="min-w-0 text-[13.5px]">{k.action}</span>
                <Keys combo={(mac && k.mac) || k.keys} mac={mac} />
              </div>
            ))}
          </Section>
        ))}
      </div>
      {t && !shown.length && <div className="py-4 text-center text-[13px] text-fg-3">{tr('No shortcut matches that.')}</div>}
    </Card>
  );
}

// ---- repositories --------------------------------------------------------------------------------------------------------

/** The colours code hosts give languages (a language's own colour). */
const LANG_COLOR: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#f1e05a',
  python: '#3572a5',
  go: '#00add8',
  rust: '#dea584',
  ruby: '#701516',
  java: '#b07219',
  kotlin: '#a97bff',
  swift: '#f05138',
  c: '#555555',
  'c++': '#f34b7d',
  'c#': '#178600',
  php: '#4f5d95',
  shell: '#89e051',
  html: '#e34c26',
  css: '#663399',
  dart: '#00b4ab',
  elixir: '#6e4a7e',
  haskell: '#5e5086',
  lua: '#000080',
  scala: '#c22d40',
  zig: '#ec915c',
  vue: '#41b883',
  svelte: '#ff3e00',
  'jupyter notebook': '#da5b0b',
  julia: '#a270ba',
  r: '#198ce7',
  nix: '#7e7eff',
  astro: '#ff5a03',
  ocaml: '#ef7a08',
  perl: '#0298c3',
  clojure: '#db5855',
  erlang: '#b83998',
  'objective-c': '#438eff',
  powershell: '#012456',
  dockerfile: '#384d54',
  hcl: '#844fba',
  solidity: '#aa6746',
  elm: '#60b5cc',
  gleam: '#ffaff3',
  nim: '#ffc200',
  fortran: '#4d41b1',
  matlab: '#e16737',
};

function RepoCard({ r, done }: { r: Data; done: boolean }) {
  const url = str(r.url ?? r.html_url);
  const full = str(r.name ?? r.full_name) || url.replace(/^https?:\/\/(www\.)?[^/]+\//i, '');
  const cut = full.lastIndexOf('/');
  const owner = cut > 0 ? full.slice(0, cut) : '';
  const name = cut > 0 ? full.slice(cut + 1) : full;
  const lang = str(r.language);
  const topics = words(r.topics);
  const stars = num(r.stars ?? r.stargazers_count);
  const forks = num(r.forks ?? r.forks_count);
  const meta: ReactNode[] = [];
  if (lang)
    meta.push(
      <span key="l" className="inline-flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-full ring-1 ring-line-2"
          style={{
            background: LANG_COLOR[lang.toLowerCase()] ?? 'var(--fg-3)',
          }}
          aria-hidden
        />
        {lang}
      </span>,
    );
  if (forks !== null)
    meta.push(
      <span key="f" className="inline-flex items-center gap-1 tabular-nums" title={tr('Forks')}>
        <GitFork size={12} />
        {compact(forks)}
      </span>,
    );
  if (str(r.license))
    meta.push(
      <span key="c" className="inline-flex items-center gap-1">
        <Scale size={12} />
        {str(r.license)}
      </span>,
    );
  if (str(r.updated)) meta.push(<span key="u">{tr('Updated {0}').replace('{0}', fmtDate(r.updated))}</span>);
  const title = (
    <>
      {owner && <span className="font-normal opacity-75">{owner}/</span>}
      <span className="font-semibold">{name}</span>
    </>
  );
  return (
    <Card className="flex min-w-0 flex-col">
      <div className="flex min-w-0 items-start gap-2">
        <BookMarked size={15} className="mt-[3px] shrink-0 text-fg-3" />
        <div className="min-w-0 flex-1 text-[15px] leading-snug">
          {/^https?:\/\//i.test(url) ? (
            <LinkOut url={url} icon={false} className="max-w-full">
              {title}
            </LinkOut>
          ) : (
            <span className="break-words">{title}</span>
          )}
        </div>
        {stars !== null && (
          <span className="inline-flex shrink-0 items-center gap-1 pt-px text-[12.5px] font-medium text-fg-2 tabular-nums" title={tr('Stars')}>
            <Star size={13} className="text-[#e8a317]" fill="currentColor" strokeWidth={0} />
            {compact(stars)}
          </span>
        )}
      </div>
      {str(r.description) && <Md text={r.description} className="mt-1.5 text-[13.5px] text-fg-2" />}
      {topics.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {topics.slice(0, 8).map((t, i) => (
            <Chip key={i} tone="accent">
              {t}
            </Chip>
          ))}
        </div>
      )}
      <div className="mt-auto">
        {meta.length > 0 && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-[12px] text-fg-3">{meta}</div>}
        {str(r.install) && (
          <div className="mt-3">
            <CommandLine cmd={str(r.install)} done={done} />
          </div>
        )}
      </div>
    </Card>
  );
}

function Repos({ data, done }: { data: Data; done: boolean }) {
  const repos = arr(data.repos ?? data.repositories ?? data.items)
    .map((r) => (isObj(r) ? r : { name: str(r) }))
    .filter((r) => str(r.name ?? r.full_name) || str(r.url));
  return (
    <div>
      {str(data.title) && <h3 className="aui-h3 mb-2.5 px-0.5">{str(data.title)}</h3>}
      <div className="grid gap-3 @2xl:grid-cols-2">
        {repos.map((r, i) => (
          <RepoCard key={i} r={r} done={done} />
        ))}
      </div>
    </div>
  );
}

export const CODE_UIS: Record<string, AnswerUiView> = {
  code: CodeTabs,
  commands: Commands,
  api: Api,
  error: ErrorUi,
  tests: Tests,
  json: JsonTree,
  regex: RegexUi,
  shortcuts: Shortcuts,
  repo: Repos,
};
