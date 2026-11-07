// A ```html live block of an agent's reply, run in place: a figure, a chart or a small tool inside the reply, in the
// sandboxed frame every page renders in (server/pages/kit.ts), with the pages' kit and its look in the app's theme. A
// fragment gets a page around it in that look. While its block is still coming it grows in place, its scripts held
// back; once complete it runs, fitted to its height. Its choices go to the session's message box as a page's do, and
// what it stores lasts while the app is open. Its code is a click away; it opens full screen and saves as a file.
import { memo, useContext, useMemo, useState } from 'react';
import { CodeXml, Download, Expand, Shapes } from 'lucide-react';
import { memoryStore, PageFrame, pageFile, StreamFrame, usePreviewMax } from '../features/pages/frame';
import { PageOverlay } from '../features/pages/overlay';
import { usePicks } from '../features/session/HtmlPage';
import { tr } from '../i18n/runtime';
import { BarButton as Bar, CodeBlock, CopyButton, MdCtx } from './Markdown';

/** A fragment as a page of its own in the app's look (a little less room around it than a page); a whole page as it is. */
export function livePage(code: string): string {
  if (/<(html|body)[\s>]/i.test(code)) return code;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="n-page" style="padding:14px 16px">${code}</body></html>`;
}

/** Its <title>, when it has one. */
const titleOf = (code: string) =>
  /<title[^>]*>([^<]{1,120})<\/title>/i
    .exec(code)?.[1]
    ?.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim() || '';

/** A short fingerprint of the code, so the frame starts over when it changes. */
const sum = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
};

export default memo(function HtmlBlock({ code, done }: { code: string; done: boolean }) {
  const { sessionKey } = useContext(MdCtx);
  const text = code.replace(/\n$/, '');
  const html = useMemo(() => livePage(text), [text]);
  const title = titleOf(text);
  const [height, setHeight] = useState(0);
  const [showCode, setShowCode] = useState(false);
  const [full, setFull] = useState(false);
  const store = useMemo(() => memoryStore(), []);
  const onPick = usePicks(sessionKey, full);
  const max = usePreviewMax();
  const save = () => {
    const url = URL.createObjectURL(new Blob([pageFile(html)], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\w.-]+/g, '-').slice(0, 60) || 'figure'}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // Until it reports its height, it stands as tall as a small figure.
  const tall = Math.min(Math.max(height || 120, 24), max);
  return (
    <div className="code-block html-live my-2">
      <div className="flex h-7 items-center gap-1 border-b border-line pr-1.5 pl-3 text-[11px] text-fg-3">
        {!done && <span className="breathe mr-1 h-1.5 w-1.5 shrink-0 rounded-full bg-busy" />}
        <span translate="no" className="min-w-0 truncate">
          {title}
        </span>
        <span className="flex-1" />
        {done && (
          <>
            <Bar label={showCode ? tr('Show it') : tr('Show the code')} onClick={() => setShowCode((x) => !x)}>
              {showCode ? <Shapes size={13} /> : <CodeXml size={13} />}
            </Bar>
            <Bar label={tr('Save as a file')} onClick={save}>
              <Download size={13} />
            </Bar>
            <Bar label={tr('Full screen')} onClick={() => setFull(true)}>
              <Expand size={13} />
            </Bar>
          </>
        )}
        <CopyButton text={text} label={tr('Copy the code')} />
      </div>
      {showCode ? (
        <CodeBlock code={text} lang="html" bare />
      ) : (
        <div style={{ height: tall }} className="relative">
          {done ? (
            !full && <PageFrame key={sum(html)} html={html} title={title || tr('Figure')} store={store} onHeight={setHeight} onPick={onPick} />
          ) : (
            <StreamFrame html={html} title={title || tr('Figure')} onHeight={setHeight} label="Writing…" />
          )}
          {done && height > max && !full && (
            // It fades into the card under the button, so its words never run behind the button's.
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-panel via-panel/85 to-transparent pt-14 pb-3">
              <button
                type="button"
                onClick={() => setFull(true)}
                className="pointer-events-auto rounded-full border border-line-2 bg-bg-1 px-3.5 py-1.5 text-[12.5px] font-medium text-fg shadow-sm transition-colors hover:bg-bg-2"
              >
                {tr('See all of it')}
              </button>
            </div>
          )}
        </div>
      )}
      {full && (
        <PageOverlay title={title || tr('Figure')} onClose={() => setFull(false)}>
          <PageFrame key={sum(html)} html={html} title={title || tr('Figure')} store={store} onPick={onPick} fill />
        </PageOverlay>
      )}
    </div>
  );
});
