// Maths on a document's or a slide deck's own page (and so in its PDF, its picture in Pages and a published copy): LaTeX drawn as
// KaTeX's HTML here on the server, and the page given KaTeX's stylesheet with the fonts its maths uses inside it, so
// it shows the same wherever the page goes, with nothing loaded from elsewhere. KaTeX comes inside the server's own
// bundle (the paths below are relative so the build takes it in): the desktop app's server ships without the
// packages the web app is built from.
// @ts-expect-error KaTeX's module by its path: its types are the package's (below).
import katexModule from '../../node_modules/katex/dist/katex.mjs';
import type katexType from 'katex';
import * as katexCss from '../../node_modules/katex/dist/katex.min.css' with { type: 'text' };
import AMS from '../../node_modules/katex/dist/fonts/KaTeX_AMS-Regular.woff2' with { type: 'bytes' };
import CaligraphicBold from '../../node_modules/katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2' with { type: 'bytes' };
import Caligraphic from '../../node_modules/katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2' with { type: 'bytes' };
import FrakturBold from '../../node_modules/katex/dist/fonts/KaTeX_Fraktur-Bold.woff2' with { type: 'bytes' };
import Fraktur from '../../node_modules/katex/dist/fonts/KaTeX_Fraktur-Regular.woff2' with { type: 'bytes' };
import MainBoldItalic from '../../node_modules/katex/dist/fonts/KaTeX_Main-BoldItalic.woff2' with { type: 'bytes' };
import MainBold from '../../node_modules/katex/dist/fonts/KaTeX_Main-Bold.woff2' with { type: 'bytes' };
import MainItalic from '../../node_modules/katex/dist/fonts/KaTeX_Main-Italic.woff2' with { type: 'bytes' };
import Main from '../../node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2' with { type: 'bytes' };
import MathBoldItalic from '../../node_modules/katex/dist/fonts/KaTeX_Math-BoldItalic.woff2' with { type: 'bytes' };
import MathItalic from '../../node_modules/katex/dist/fonts/KaTeX_Math-Italic.woff2' with { type: 'bytes' };
import SansBold from '../../node_modules/katex/dist/fonts/KaTeX_SansSerif-Bold.woff2' with { type: 'bytes' };
import SansItalic from '../../node_modules/katex/dist/fonts/KaTeX_SansSerif-Italic.woff2' with { type: 'bytes' };
import Sans from '../../node_modules/katex/dist/fonts/KaTeX_SansSerif-Regular.woff2' with { type: 'bytes' };
import Script from '../../node_modules/katex/dist/fonts/KaTeX_Script-Regular.woff2' with { type: 'bytes' };
import Size1 from '../../node_modules/katex/dist/fonts/KaTeX_Size1-Regular.woff2' with { type: 'bytes' };
import Size2 from '../../node_modules/katex/dist/fonts/KaTeX_Size2-Regular.woff2' with { type: 'bytes' };
import Size3 from '../../node_modules/katex/dist/fonts/KaTeX_Size3-Regular.woff2' with { type: 'bytes' };
import Size4 from '../../node_modules/katex/dist/fonts/KaTeX_Size4-Regular.woff2' with { type: 'bytes' };
import Typewriter from '../../node_modules/katex/dist/fonts/KaTeX_Typewriter-Regular.woff2' with { type: 'bytes' };

const katex = katexModule as typeof katexType;

/** Each font file, and the classes of KaTeX's HTML that draw with it (none: any maths does). */
const FONTS: Record<string, { data: unknown; when?: RegExp }> = {
  'KaTeX_Main-Regular': { data: Main },
  'KaTeX_Math-Italic': { data: MathItalic },
  'KaTeX_Size1-Regular': { data: Size1 },
  'KaTeX_Size2-Regular': { data: Size2 },
  'KaTeX_Size3-Regular': { data: Size3 },
  'KaTeX_Size4-Regular': { data: Size4 },
  'KaTeX_AMS-Regular': { data: AMS, when: /\b(amsrm|mathbb|textbb)\b/ },
  // Bold words in maths (\mathbf, \textbf) and bold symbols.
  'KaTeX_Main-Bold': { data: MainBold, when: /\b(mathbf|textbf|boldsymbol)\b/ },
  'KaTeX_Main-Italic': { data: MainItalic, when: /\b(mathit|textit)\b/ },
  'KaTeX_Main-BoldItalic': { data: MainBoldItalic, when: /\b(boldsymbol|textbf)\b/ },
  'KaTeX_Math-BoldItalic': { data: MathBoldItalic, when: /\bboldsymbol\b/ },
  'KaTeX_Caligraphic-Regular': { data: Caligraphic, when: /\bmathcal\b/ },
  'KaTeX_Caligraphic-Bold': { data: CaligraphicBold, when: /\bmathcal\b/ },
  'KaTeX_Fraktur-Regular': { data: Fraktur, when: /\b(mathfrak|textfrak)\b/ },
  'KaTeX_Fraktur-Bold': { data: FrakturBold, when: /\b(mathboldfrak|textboldfrak)\b/ },
  'KaTeX_SansSerif-Regular': { data: Sans, when: /\b(mathsf|textsf)\b/ },
  'KaTeX_SansSerif-Bold': { data: SansBold, when: /\b(mathboldsf|textboldsf)\b/ },
  'KaTeX_SansSerif-Italic': { data: SansItalic, when: /\b(mathitsf|mathsfit|textitsf)\b/ },
  'KaTeX_Script-Regular': { data: Script, when: /\b(mathscr|textscr)\b/ },
  'KaTeX_Typewriter-Regular': { data: Typewriter, when: /\b(mathtt|texttt)\b/ },
};

const base64 = (v: unknown) => Buffer.from(v as Uint8Array).toString('base64');

/** LaTeX as KaTeX's HTML (with its MathML for screen readers); a formula it cannot read comes back in red, never thrown. */
export function texToHtml(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, maxExpand: 500, maxSize: 50 });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    return `<span class="katex-error" style="color:#cc0000">${msg}</span>`;
  }
}

/** KaTeX's stylesheet for a page whose maths is `html`: the fonts it draws with inside it (as data), the others left out. */
export function katexStyle(html: string): string {
  const css = (katexCss as unknown as { default: string }).default;
  return css.replace(/@font-face\{[^}]*\}/g, (rule) => {
    const name = /url\(fonts\/([\w-]+)\.woff2\)/.exec(rule)?.[1];
    const f = name ? FONTS[name] : undefined;
    if (!f || (f.when && !f.when.test(html))) return '';
    return rule.replace(/src:[^}]*/, `src:url(data:font/woff2;base64,${base64(f.data)}) format("woff2")`);
  });
}
