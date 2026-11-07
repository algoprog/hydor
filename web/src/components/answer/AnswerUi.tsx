// An answer UI in an agent's reply: a ```ui <name> block of JSON (shared/answer-ui), drawn by its view (registry.ts) in
// place of the code. While the reply streams, what has arrived of the JSON is read as far as it can be (readPartial) and
// drawn as it comes, an address still being written left out (no picture loads half an address); once whole it is read
// as JSON (or as far as it can be, when the agent wrote it a little wrong). A name it does not know, or a view that fails,
// shows the data laid out as it is (DataView). On hover: the data itself, and a copy of it as text. Loaded the first time
// a reply has one (Markdown.tsx).
import { Component, memo, useContext, useMemo, useState, type ReactNode } from 'react';
import { Braces, Shapes } from 'lucide-react';
import { answerUi } from '@shared/answer-ui';
import { readPartial, type JsonPath } from '@shared/partial-json';
import { tr } from '../../i18n/runtime';
import { BarButton, CodeBlock, CopyButton, MdCtx } from '../Markdown';
import { cx } from '../ui';
import { AuiCtx, isObj, type AuiInfo, type Data } from './kit';
import { DataView, dataText } from './DataView';
import { UIS } from './registry';

/** Fields that hold an address: one still being written is left out until it is whole. */
const URL_KEY = /^(image|images|src|url|href|link|logo|avatar|poster|thumbnail|thumb|cover|photo|picture|video|audio|trailer|pdf|website|still|icon_url|map_url)$/i;
const URL_LIKE = /^(https?:|\/|data:|~\/|file:)/i;

/** Takes out of `v` the string at `path` (the one still being written) when it is an address. */
function dropOpenAddress(v: unknown, path: JsonPath) {
  let parent: any = v;
  for (const k of path.slice(0, -1)) {
    parent = parent?.[k as any];
    if (!parent || typeof parent !== 'object') return;
  }
  const last = path[path.length - 1];
  const val = parent?.[last as any];
  if (typeof val !== 'string') return;
  const key = typeof last === 'string' ? last : String(path[path.length - 2] ?? '');
  if (!URL_KEY.test(key) && !URL_LIKE.test(val)) return;
  if (Array.isArray(parent) && typeof last === 'number') parent.splice(last, 1);
  else delete parent[last as any];
}

/** The block's data: as JSON once whole, else as far as it can be read; with what went wrong, when it did. */
export function readUi(code: string, done: boolean): { value: Data; bad?: boolean } {
  const text = code.trim();
  if (!text) return { value: {} };
  if (done)
    try {
      const v = JSON.parse(text);
      return { value: isObj(v) ? v : Array.isArray(v) ? { items: v } : {}, bad: !isObj(v) && !Array.isArray(v) };
    } catch {}
  const p = readPartial(text);
  const raw = p.value;
  const value: Data = isObj(raw) ? raw : Array.isArray(raw) ? { items: raw } : {};
  if (!done && p.inString && p.open?.length) dropOpenAddress(value, p.open);
  return { value, bad: done && (raw === undefined || !Object.keys(value).length) };
}

/** A short fingerprint of the block, for what it keeps on this device. */
const sum = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return `${s.length.toString(36)}${(h >>> 0).toString(36)}`;
};

/**
 * A view that fails shows the data as it is instead, and tries again once the block is whole (`done`): data cut short
 * while it streams can trip a view that the whole data does not.
 */
class Guard extends Component<{ children: ReactNode; fallback: ReactNode; done: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn('[answer ui]', e);
  }
  componentDidUpdate(prev: { done: boolean }) {
    if (this.state.failed && this.props.done && !prev.done) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The block, drawn: `name` is the word after ```ui (the UI's name), `code` the JSON so far, `done` whether it is whole. */
export function AnswerBlock({ name, code, done, demo }: { name: string; code: string; done: boolean; demo?: boolean }) {
  const md = useContext(MdCtx);
  const parsed = useMemo(() => readUi(code, done), [code, done]);
  const asked = (name || (typeof parsed.value.ui === 'string' ? parsed.value.ui : '')).trim();
  const spec = answerUi(asked);
  const View = spec ? UIS[spec.id] : undefined;
  const [raw, setRaw] = useState(false);
  const keep = done && !demo && md.sessionKey ? `${md.sessionKey}:${sum(code.trim())}` : '';
  const info = useMemo<AuiInfo>(() => ({ sessionKey: md.sessionKey, cwd: md.cwd, offline: md.offline, done, keep, demo }), [md.sessionKey, md.cwd, md.offline, done, keep, demo]);
  const pretty = useMemo(() => {
    if (!raw) return '';
    try {
      return JSON.stringify(JSON.parse(code), null, 2);
    } catch {
      return code;
    }
  }, [raw, code]);
  if (done && parsed.bad)
    return (
      <div className="my-3">
        <div className="mb-1 text-[12px] text-fg-3">{tr('This card’s data could not be read:')}</div>
        <CodeBlock code={code} lang="json" />
      </div>
    );
  const fallback = <DataView data={parsed.value} />;
  return (
    <AuiCtx.Provider value={info}>
      <div className="aui group/aui relative my-3" data-ui={spec?.id ?? asked} translate="no">
        {raw ? (
          <CodeBlock code={pretty} lang="json" />
        ) : (
          <Guard done={done} fallback={fallback}>
            {View ? <View data={parsed.value} done={done} /> : fallback}
          </Guard>
        )}
        {!done && <span className="aui-live breathe" aria-hidden />}
        {done && (
          <div className="absolute -top-2.5 right-1 z-10 flex rounded-md border border-line bg-elevated opacity-0 shadow-sm transition-opacity group-hover/aui:opacity-100 focus-within:opacity-100">
            <BarButton label={raw ? tr('Show it') : tr('Show the data')} onClick={() => setRaw((x) => !x)}>
              {raw ? <Shapes size={13} /> : <Braces size={13} />}
            </BarButton>
            <CopyButton text={() => dataText(parsed.value, spec?.title)} label={tr('Copy as text')} />
          </div>
        )}
      </div>
    </AuiCtx.Provider>
  );
}

export default memo(function AnswerUi({ name, code, done }: { name: string; code: string; done: boolean }) {
  return <AnswerBlock name={name} code={code} done={done} />;
});

/** For the gallery: a UI drawn with its example, as a reply would show it (`done` false while it plays as streaming). */
export function AnswerDemo({ name, data, code, done = true, className }: { name: string; data?: Data; code?: string; done?: boolean; className?: string }) {
  const text = useMemo(() => code ?? JSON.stringify(data ?? {}), [code, data]);
  return (
    <div className={cx('md', className)}>
      <AnswerBlock name={name} code={text} done={done} demo />
    </div>
  );
}
