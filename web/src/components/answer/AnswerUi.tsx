// An answer UI in an agent's reply: a ```ui <name> block of JSON (shared/answer-ui), drawn by its view (registry.ts) in
// place of the code. While the reply streams, what has arrived of the JSON is read as far as it can be (readPartial) and
// drawn as it comes, an address still being written left out (no picture loads half an address); once whole it is read
// as JSON (or as far as it can be, when the agent wrote it a little wrong). A name it does not know, or a view that fails,
// shows the data laid out as it is (DataView). On hover or keyboard focus, its toolbar: the data itself, a copy of it as
// text, Full screen, and under "…" Pin to a board and the card as a picture (CardTools.tsx). Loaded the first time a reply
// has one (Markdown.tsx). A board (features/pages/board) draws its cards with CardView, the same views. A card whose data
// names a source instead of holding its numbers (`from`: a spreadsheet kept in a project's files, or a data file, shared/answer-ui/data-ref.ts)
// is drawn from what the server reads there, with a line naming it (DataRef.tsx).
import { Component, memo, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Braces, Expand, Shapes } from 'lucide-react';
import { answerUi } from '@shared/answer-ui';
import { isDataRef, REF_UIS } from '@shared/answer-ui/data-ref';
import { readPartial, type JsonPath } from '@shared/partial-json';
import { tr } from '../../i18n/runtime';
import { BarButton, CodeBlock, CopyButton, MdCtx } from '../Markdown';
import { cx } from '../ui';
import { viaLink } from '../../lib/machine';
import { CardFullScreen, CardMenu, picturable } from './CardTools';
import type { PinCard } from './PinToBoard';
import { AuiCtx, isObj, str, type AuiInfo, type Data } from './kit';
import { DataView, dataText } from './DataView';
import { unescapeMoney } from './money';
import { FromLine, NotRead, Reading, useCardData } from './DataRef';
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
      const v = unescapeMoney(JSON.parse(text));
      return { value: isObj(v) ? v : Array.isArray(v) ? { items: v } : {}, bad: !isObj(v) && !Array.isArray(v) };
    } catch {}
  const p = readPartial(text);
  const raw = unescapeMoney(p.value);
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

/**
/**
 * A card drawn by its UI's view (unknown, or failing: its data as it is), with nothing around it: what a board shows for
 * each of its cards. `info` is what the views read of where they are (AuiCtx); a card that reads a spreadsheet or a file
 * reads it as the board it is on may (`info.board`).
 */
export function CardView({ name, data, info }: { name: string; data: Data; info: AuiInfo }) {
  const spec = answerUi(name);
  const View = spec ? UIS[spec.id] : undefined;
  const ref = !!spec && REF_UIS.has(spec.id) && isDataRef(data);
  const fed = useCardData(spec?.id ?? '', data, ref, { session: info.sessionKey, board: info.board });
  const value = ref ? (fed.got?.data ?? null) : data;
  const fallback = <DataView data={value ?? data} />;
  return (
    <AuiCtx.Provider value={info}>
      {ref && !value ? (
        fed.error ? (
          <NotRead data={data} error={fed.error} again={fed.again} loading={fed.loading} />
        ) : (
          <Reading data={data} />
        )
      ) : (
        <Guard done fallback={fallback}>
          {View ? <View data={value ?? data} done /> : fallback}
        </Guard>
      )}
      {ref && fed.got && <FromLine card={fed.got} loading={fed.loading} again={fed.again} />}
    </AuiCtx.Provider>
  );
}

/**
 * The block, drawn: `name` is the word after ```ui (the UI's name), `code` the JSON so far, `done` whether it is whole.
 * Outside a reply (a board), `session` and `board` say where it is drawn: what a card that reads a source may read.
 * `noPin`: no Pin to a board (an app's public page, whose visitor has no boards); `webPictures`: its pictures load straight
 * from their https addresses and nothing else shows (an app's public page, whose visitor is not signed in here).
 */
export function AnswerBlock({ name, code, done, demo, session, board, noPin, webPictures }: { name: string; code: string; done: boolean; demo?: boolean; session?: string; board?: string; noPin?: boolean; webPictures?: boolean }) {
  const md = useContext(MdCtx);
  const parsed = useMemo(() => readUi(code, done), [code, done]);
  const asked = (name || (typeof parsed.value.ui === 'string' ? parsed.value.ui : '')).trim();
  const spec = answerUi(asked);
  const View = spec ? UIS[spec.id] : undefined;
  // Its numbers read from a spreadsheet or a file, once the block is whole.
  const ref = !!spec && REF_UIS.has(spec.id) && isDataRef(parsed.value);
  const fed = useCardData(spec?.id ?? '', parsed.value, ref && done && !parsed.bad, { session: session ?? md.sessionKey, board });
  const value = ref ? (fed.got?.data ?? null) : parsed.value;
  const [raw, setRaw] = useState(false);
  const [full, setFull] = useState(false);
  // Whether it can be a picture: asked as its toolbar shows (a map or a figure inside comes in its own time).
  const [pictures, setPictures] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const keep = done && !demo && md.sessionKey ? `${md.sessionKey}:${sum(code.trim())}` : '';
  const info = useMemo<AuiInfo>(() => ({ sessionKey: session ?? md.sessionKey, cwd: md.cwd, offline: md.offline, done, keep, demo, board, webPictures }), [session, md.sessionKey, md.cwd, md.offline, done, keep, demo, board, webPictures]);
  const pretty = useMemo(() => {
    if (!raw) return '';
    try {
      return JSON.stringify(JSON.parse(code), null, 2);
    } catch {
      return code;
    }
  }, [raw, code]);
  // What Pin to a board keeps: the UI and its data as the block holds it (copied now), and the reply it is in. Not at a
  // shared link (nothing is kept there), nor from a confidential session (what it says stays in it), nor for a UI the app
  // does not know.
  const pin = useMemo<PinCard | undefined>(() => {
    if (!done || !spec || viaLink || md.offline || noPin) return undefined;
    let data: Data = parsed.value;
    try {
      const v = JSON.parse(code);
      if (isObj(v)) data = v;
    } catch {}
    const from = md.pinFrom ?? (md.sessionKey ? { session: md.sessionKey, ...(md.cwd ? { cwd: md.cwd } : {}) } : undefined);
    return { ui: spec.id, data, title: str(data.title) || spec.title, from };
  }, [done, spec, code, parsed.value, md.pinFrom, md.sessionKey, md.cwd, md.offline, noPin]);
  if (done && parsed.bad)
    return (
      <div className="my-3">
        <div className="mb-1 text-[12px] text-fg-3">{tr('This card’s data could not be read:')}</div>
        <CodeBlock code={code} lang="json" />
      </div>
    );
  const fallback = <DataView data={value ?? parsed.value} />;
  const drawn =
    ref && !value ? (
      fed.error ? (
        <NotRead data={parsed.value} error={fed.error} again={fed.again} loading={fed.loading} />
      ) : (
        <Reading data={parsed.value} />
      )
    ) : (
      <Guard done={done} fallback={fallback}>
        {View ? <View data={value ?? parsed.value} done={done} /> : fallback}
      </Guard>
    );
  const title = str(parsed.value.title) || spec?.title || asked || tr('Card');
  const look = () => setPictures(!raw && picturable(card.current));
  return (
    <AuiCtx.Provider value={info}>
      <div ref={card} className="aui group/aui relative my-3" data-ui={spec?.id ?? asked} data-tip={done && !demo && !board && !noPin && md.sessionKey && spec ? 'answer-card' : undefined} translate="no" onPointerEnter={done ? look : undefined} onFocus={done ? look : undefined}>
        {raw ? <CodeBlock code={pretty} lang="json" /> : drawn}
        {ref && fed.got && !raw && <FromLine card={fed.got} loading={fed.loading} again={fed.again} />}
        {!done && <span className="aui-live breathe" aria-hidden />}
        {done && (
          <div data-aui-bar className="absolute -top-2.5 right-1 z-10 flex rounded-md border border-line bg-elevated opacity-0 shadow-sm transition-opacity group-hover/aui:opacity-100 focus-within:opacity-100">
            <BarButton label={raw ? tr('Show it') : tr('Show the data')} onClick={() => setRaw((x) => !x)}>
              {raw ? <Shapes size={13} /> : <Braces size={13} />}
            </BarButton>
            <CopyButton text={() => dataText(value ?? parsed.value, spec?.title)} label={tr('Copy as text')} />
            {!raw && (
              <BarButton label={tr('Full screen')} onClick={() => setFull(true)}>
                <Expand size={13} />
              </BarButton>
            )}
            {!raw && <CardMenu card={() => card.current} title={title} pictures={pictures} pin={pin} />}
          </div>
        )}
      </div>
      {full && (
        <CardFullScreen title={title} uiId={spec?.id ?? asked} pictures={pictures} onClose={() => setFull(false)}>
          {drawn}
        </CardFullScreen>
      )}
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
