import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { NbOutput } from '@shared/types';
import { ansiToHtml } from '../../lib/ansi';
import { Markdown } from '../../components/Markdown';
import { cx } from '../../components/ui';
import type { CellRunView } from './model';

/** Rich outputs in the order Jupyter prefers them. */
const ORDER = [
  'application/vnd.jupyter.widget-view+json',
  'text/html',
  'text/markdown',
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/latex',
  'application/json',
  'text/plain',
  'application/javascript',
];

const THEME_VARS = ['--fg', '--line', '--line-2', '--accent'];

function frameVars(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const v: Record<string, string> = Object.fromEntries(THEME_VARS.map((k) => [k, cs.getPropertyValue(k).trim()]));
  v['--stripe'] = cs.getPropertyValue('--bg-1').trim();
  v['--hover'] = cs.getPropertyValue('--bg-2').trim();
  return v;
}

/** HTML output (a table, an interactive plot) in a sandboxed frame that sizes itself to its content. */
function HtmlFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const [height, setHeight] = useState(36);
  useEffect(() => {
    const send = () => ref.current?.contentWindow?.postMessage({ type: 'wa-nb-html', html, vars: frameVars(), dark: document.documentElement.classList.contains('dark') }, '*');
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      if (e.data?.type === 'wa-nb-ready') {
        ready.current = true;
        send();
      } else if (e.data?.type === 'wa-nb-size' && typeof e.data.h === 'number') setHeight(Math.max(16, Math.min(e.data.h, 6000)));
    };
    // A new theme repaints the output in its colours.
    const onTheme = () => ready.current && ref.current?.contentWindow?.postMessage({ type: 'wa-nb-vars', vars: frameVars(), dark: document.documentElement.classList.contains('dark') }, '*');
    window.addEventListener('message', onMessage);
    window.addEventListener('wa:theme', onTheme);
    if (ready.current) send();
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('wa:theme', onTheme);
    };
  }, [html]);
  return <iframe ref={ref} src="/nbframe" title="Output" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" style={{ height }} className="block w-full border-0" />;
}

/** Stream text keeps to the bottom while it grows, unless it was scrolled up to read. */
function StreamText({ text, err }: { text: string; err?: boolean }) {
  const ref = useRef<HTMLPreElement>(null);
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <pre
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
      className={cx('nb-text max-h-[440px] overflow-auto', err && 'nb-stderr')}
      dangerouslySetInnerHTML={{ __html: ansiToHtml(text.replace(/\r/g, '')) }}
    />
  );
}

function Note({ children }: { children: string }) {
  return <div className="py-1 text-[12px] text-fg-3 italic">{children}</div>;
}

function MimeBundle({ data, metadata }: { data: Record<string, unknown>; metadata: Record<string, any> }) {
  const mime = ORDER.find((m) => data[m] != null) ?? Object.keys(data)[0];
  if (!mime) return null;
  const v = data[mime];
  const text = typeof v === 'string' ? v : '';
  if (mime === 'application/vnd.jupyter.widget-view+json') {
    return (
      <>
        {typeof data['text/plain'] === 'string' && <StreamText text={data['text/plain'] as string} />}
        <Note>Interactive widgets do not run here.</Note>
      </>
    );
  }
  if (mime === 'text/html') return <HtmlFrame html={text} />;
  if (mime === 'text/markdown') return <Markdown text={text} notebook className="py-1" />;
  if (mime === 'text/latex') return <Markdown text={text.trim().startsWith('$') ? text : `$$\n${text}\n$$`} notebook />;
  if (mime.startsWith('image/')) {
    const m = (metadata?.[mime] ?? {}) as Record<string, any>;
    const src = mime === 'image/svg+xml' ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}` : `data:${mime};base64,${text.replace(/\s/g, '')}`;
    return (
      <img
        src={src}
        alt=""
        width={typeof m.width === 'number' ? m.width : undefined}
        height={typeof m.height === 'number' ? m.height : undefined}
        // Transparent figures drawn for a light page stay readable in dark mode.
        className={cx('nb-img my-1', metadata?.needs_background === 'light' && 'rounded bg-white')}
      />
    );
  }
  if (mime === 'application/json') return <StreamText text={JSON.stringify(v, null, 2)} />;
  if (mime === 'application/javascript') return <Note>JavaScript output does not run here.</Note>;
  return <StreamText text={text} />;
}

function OutputView({ o }: { o: NbOutput }) {
  if (o.output_type === 'stream') return <StreamText text={o.text ?? ''} err={o.name === 'stderr'} />;
  if (o.output_type === 'error') {
    const tb = o.traceback?.length ? o.traceback.join('\n') : `${o.ename}: ${o.evalue}`;
    return <pre className="nb-text nb-error overflow-auto" dangerouslySetInnerHTML={{ __html: ansiToHtml(tb) }} />;
  }
  return <MimeBundle data={o.data ?? {}} metadata={(o.metadata ?? {}) as Record<string, any>} />;
}

function InputPrompt({ prompt, password, onSubmit }: { prompt: string; password: boolean; onSubmit: (v: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="flex items-center gap-2 py-1 font-mono text-[12.5px]"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      {prompt && <span className="whitespace-pre text-fg-2">{prompt}</span>}
      <input
        autoFocus
        type={password ? 'password' : 'text'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Type, then Enter"
        className="h-7 min-w-0 flex-1 rounded-md border border-line-2 bg-bg-1 px-2 outline-none focus:border-accent/60"
      />
    </form>
  );
}

export const Outputs = memo(function Outputs({ outputs, run, onInput }: { outputs: NbOutput[]; run?: CellRunView; onInput: (value: string) => void }) {
  if (!outputs.length && !run?.input) return null;
  return (
    <div className="nb-outputs min-w-0 px-3 pt-1.5 pb-1">
      {outputs.map((o, i) => (
        <OutputView key={i} o={o} />
      ))}
      {run?.input && <InputPrompt prompt={run.input.prompt} password={run.input.password} onSubmit={onInput} />}
    </div>
  );
});
