// A ```mermaid block drawn as a diagram, in the app's colours: light or dark and the user's own theme, drawn again when
// the theme changes. Until its block has all come in (a reply still being written), or when it cannot be drawn, its
// code shows; the code is a click away, and the diagram opens full screen or saves as an SVG picture.
//
// Mermaid is loaded the first time a diagram is drawn (it is big). Its pictures go into the page as SVG: in its strict
// mode labels are text and a diagram's clicks do nothing, the page's policy runs no script but the app's own, and the
// look is the app's (a diagram's own %%{init}%% cannot change its theme, colours or font).
import { memo, useEffect, useState } from 'react';
import { CodeXml, Download, Expand, Shapes } from 'lucide-react';
import type { MermaidConfig } from 'mermaid';
import { PageOverlay } from '../features/pages/overlay';
import { tr } from '../i18n/runtime';
import { BarButton as Bar, CodeBlock, CopyButton } from './Markdown';
import { cx } from './ui';

type Mermaid = (typeof import('mermaid'))['default'];
let loaded: Promise<Mermaid> | null = null;
const mermaid = () => (loaded ??= import('mermaid').then((m) => m.default));

// ---- the app's colours, as Mermaid takes them ------------------------------------------------------------------

let probe: CanvasRenderingContext2D | null | undefined;
/** A CSS colour (any form the theme uses) as #rrggbb, laid over `under` when it is see-through: Mermaid works its shades out from hex. */
function hex(colour: string, under = '#ffffff'): string {
  if (probe === undefined) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    probe = c.getContext('2d', { willReadFrequently: true });
  }
  if (!probe) return colour;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = under;
  probe.fillRect(0, 0, 1, 1);
  probe.fillStyle = colour;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** `a` with `t` of `b` in it (0 to 1). */
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** The keys a diagram's own %%{init}%% may not change: Mermaid's own, and its look. */
const SECURE = ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'theme', 'themeVariables', 'themeCSS', 'darkMode', 'fontFamily', 'fontSize'];

function config(): MermaidConfig {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const dark = root.classList.contains('dark');
  const v = (k: string, d: string) => cs.getPropertyValue(`--${k}`).trim() || d;
  const bg = hex(v('bg', dark ? '#000000' : '#ffffff'));
  const c = (k: string, d: string) => hex(v(k, d), bg);
  const panel = c('panel', bg);
  const fg = c('fg', dark ? '#eeeeee' : '#1b1915');
  const fg2 = c('fg-2', fg);
  const fg3 = c('fg-3', fg);
  const line = c('line', fg3);
  const line2 = c('line-2', fg3);
  const accent = c('accent', dark ? '#8aa8ff' : '#805a00');
  const err = c('err', '#d33');
  // The series of a chart: the same six the pages' kit gives its charts.
  const series = ['accent', 'info', 'ok', 'warn', 'claude', 'codex'].map((k) => c(k, accent));
  const tint = (x: string, t = dark ? 0.26 : 0.14) => mix(panel, x, t);
  const font = v('font-sans', 'ui-sans-serif, system-ui, sans-serif');
  const node = tint(accent);
  const scale = Object.fromEntries(series.flatMap((x, i) => [[`cScale${i}`, tint(x, dark ? 0.34 : 0.22)], [`cScale${i + 6}`, tint(x, dark ? 0.2 : 0.12)]]));
  const labels = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`cScaleLabel${i}`, fg]));
  const pies = Object.fromEntries(series.flatMap((x, i) => [[`pie${i + 1}`, x], [`pie${i + 7}`, mix(x, panel, 0.45)]]));
  const gits = Object.fromEntries(series.flatMap((x, i) => [[`git${i}`, x], [`gitBranchLabel${i}`, dark ? bg : '#ffffff']]));
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    secure: SECURE,
    theme: 'base',
    fontFamily: font,
    // A little closer together than Mermaid's own spacing: a reply is narrower than a page.
    flowchart: { nodeSpacing: 36, rankSpacing: 44, padding: 12, diagramPadding: 8 },
    themeVariables: {
      darkMode: dark,
      background: bg,
      fontFamily: font,
      fontSize: '14px',
      primaryColor: node,
      primaryTextColor: fg,
      primaryBorderColor: accent,
      secondaryColor: tint(series[1]),
      secondaryTextColor: fg,
      secondaryBorderColor: series[1],
      tertiaryColor: tint(series[2]),
      tertiaryTextColor: fg,
      tertiaryBorderColor: series[2],
      mainBkg: node,
      nodeBorder: accent,
      nodeTextColor: fg,
      textColor: fg,
      titleColor: fg,
      lineColor: fg3,
      defaultLinkColor: fg3,
      edgeLabelBackground: panel,
      clusterBkg: mix(bg, panel, 0.6),
      clusterBorder: line2,
      noteBkgColor: tint(series[3]),
      noteTextColor: fg,
      noteBorderColor: series[3],
      actorBkg: node,
      actorBorder: accent,
      actorTextColor: fg,
      actorLineColor: line2,
      signalColor: fg2,
      signalTextColor: fg,
      labelBoxBkgColor: node,
      labelBoxBorderColor: accent,
      labelTextColor: fg,
      loopTextColor: fg,
      activationBkgColor: tint(accent, dark ? 0.4 : 0.26),
      activationBorderColor: accent,
      sequenceNumberColor: dark ? bg : '#ffffff',
      ...scale,
      ...labels,
      ...pies,
      pieTitleTextColor: fg,
      pieSectionTextColor: dark ? bg : '#ffffff',
      pieLegendTextColor: fg,
      pieStrokeColor: panel,
      pieOuterStrokeColor: line,
      ...gits,
      sectionBkgColor: tint(accent, 0.08),
      altSectionBkgColor: panel,
      sectionBkgColor2: tint(series[1], 0.08),
      taskBkgColor: tint(accent, dark ? 0.45 : 0.3),
      taskBorderColor: accent,
      taskTextColor: fg,
      taskTextLightColor: fg,
      taskTextDarkColor: fg,
      taskTextOutsideColor: fg,
      taskTextClickableColor: accent,
      activeTaskBkgColor: tint(series[1], dark ? 0.45 : 0.3),
      activeTaskBorderColor: series[1],
      doneTaskBkgColor: tint(fg3, 0.3),
      doneTaskBorderColor: fg3,
      critBkgColor: tint(err, dark ? 0.45 : 0.3),
      critBorderColor: err,
      gridColor: line,
      todayLineColor: err,
      errorBkgColor: tint(err),
      errorTextColor: fg,
      quadrant1Fill: tint(series[0], 0.18),
      quadrant2Fill: tint(series[1], 0.18),
      quadrant3Fill: tint(series[2], 0.18),
      quadrant4Fill: tint(series[3], 0.18),
      quadrantPointFill: accent,
    },
  };
}

// ---- drawing -----------------------------------------------------------------------------------------------------

let seq = 0;

/** The diagram as SVG; throws when Mermaid cannot read it. */
async function draw(code: string): Promise<string> {
  const m = await mermaid();
  m.initialize(config());
  const id = `mmd-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    return (await m.render(id, code)).svg;
  } finally {
    // What Mermaid may leave behind when it fails.
    document.getElementById(`d${id}`)?.remove();
  }
}

/** Mermaid's error, in a line ("Parse error on line 3: …"). */
const whyNot = (e: unknown) =>
  String((e as Error)?.message ?? e)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^-+\^$/.test(l))
    .slice(0, 2)
    .join(' ')
    .slice(0, 240);

/** The narrowest a diagram is shown, its words still readable: two thirds of its own width (Mermaid gives it as the picture's max-width). */
const minWidth = (svg: string) => Math.round(Number(/max-width:\s*([\d.]+)px/.exec(svg)?.[1] ?? 0) * 0.65);

/** Counts the app's theme changes (lib/theme.ts), for the diagrams to be drawn again in the new colours. */
function useTheme() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = () => setN((x) => x + 1);
    window.addEventListener('wa:theme', on);
    return () => window.removeEventListener('wa:theme', on);
  }, []);
  return n;
}

export default memo(function MermaidBlock({ code, done }: { code: string; done: boolean }) {
  const theme = useTheme();
  const [drawn, setDrawn] = useState<{ code: string; svg?: string; error?: string } | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [full, setFull] = useState(false);
  const text = code.replace(/\n$/, '');
  useEffect(() => {
    if (!done || !text.trim()) return;
    let alive = true;
    draw(text).then(
      (svg) => alive && setDrawn({ code: text, svg }),
      (e) => alive && setDrawn({ code: text, error: whyNot(e) }),
    );
    return () => {
      alive = false;
    };
  }, [text, done, theme]);
  // The last picture stays while the next one is drawn (a new theme), not while other code shows.
  const svg = drawn?.code === text ? drawn.svg : undefined;
  const error = drawn?.code === text ? drawn.error : undefined;
  const save = () => {
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="code-block mermaid-block my-2">
      <div className="flex h-7 items-center gap-1 border-b border-line pr-1.5 pl-3 text-[11px] text-fg-3">
        <Shapes size={12} className="mr-0.5 shrink-0" />
        <span>{tr('Diagram')}</span>
        <span className="flex-1" />
        {svg && (
          <>
            <Bar label={showCode ? tr('Show the diagram') : tr('Show the code')} onClick={() => setShowCode((x) => !x)}>
              {showCode ? <Shapes size={13} /> : <CodeXml size={13} />}
            </Bar>
            <Bar label={tr('Save as a picture (SVG)')} onClick={save}>
              <Download size={13} />
            </Bar>
            <Bar label={tr('Full screen')} onClick={() => setFull(true)}>
              <Expand size={13} />
            </Bar>
          </>
        )}
        <CopyButton text={text} label={tr('Copy the code')} />
      </div>
      {svg && !showCode ? (
        <div className="mermaid-svg" role="img" aria-label={tr('Diagram')} style={{ '--mmd-min': `${minWidth(svg)}px` } as React.CSSProperties} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <>
          {error && (
            <div className="border-b border-line px-3 py-1.5 text-[12px] text-fg-3">
              <span className="text-warn">{tr('This diagram could not be drawn')}</span>
              <span className={cx('ml-1.5 font-mono text-[11px]')}>{error}</span>
            </div>
          )}
          <CodeBlock code={text} lang="mermaid" bare />
        </>
      )}
      {full && svg && (
        <PageOverlay title={tr('Diagram')} onClose={() => setFull(false)}>
          <div className="mermaid-full" dangerouslySetInnerHTML={{ __html: svg }} />
        </PageOverlay>
      )}
    </div>
  );
});
