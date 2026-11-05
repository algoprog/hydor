// Maths written in LaTeX, drawn with KaTeX for the editors (an equation in a document or on a slide, a formula's
// preview in the LaTeX editor). KaTeX loads the first time something asks for it, so the editors open no slower; its
// stylesheet is the app's already. A formula KaTeX cannot read comes back drawn in red with what is wrong, never as
// an error thrown, so a half-typed formula shows as it is.
import type katexType from 'katex';
import { useEffect, useMemo, useState } from 'react';

type Katex = typeof katexType;

let loading: Promise<Katex> | null = null;
let loaded: Katex | null = null;

/** KaTeX, loaded once. */
export function loadKatex(): Promise<Katex> {
  loading ??= import('katex').then((m) => {
    loaded = ((m as unknown as { default?: Katex }).default ?? (m as unknown as Katex)) as Katex;
    return loaded;
  });
  return loading;
}

const opts = (display: boolean, macros?: Record<string, string>) => ({
  displayMode: display,
  throwOnError: false,
  strict: 'ignore' as const,
  output: 'html' as const,
  trust: false,
  // A copy: KaTeX writes \gdef's into the macros it is given.
  macros: macros ? { ...macros } : undefined,
  maxExpand: 500,
  maxSize: 50,
});

/** The formula as KaTeX's HTML, now, if KaTeX has loaded (null otherwise). */
export function texHtmlNow(tex: string, display: boolean, macros?: Record<string, string>): string | null {
  if (!loaded) return null;
  try {
    return loaded.renderToString(tex, opts(display, macros));
  } catch (e) {
    return `<span class="katex-error" style="color:#cc0000">${escapeHtml(e instanceof Error ? e.message : String(e))}</span>`;
  }
}

/** The formula as KaTeX's HTML (display: on a line of its own, larger). Never throws. */
export async function texHtml(tex: string, display: boolean, macros?: Record<string, string>): Promise<string> {
  await loadKatex();
  return texHtmlNow(tex, display, macros)!;
}

/** The formula as KaTeX's HTML for a component: null until KaTeX has loaded, then kept up to date. */
export function useTexHtml(tex: string, display: boolean, macros?: Record<string, string>): string | null {
  const [ready, setReady] = useState(!!loaded);
  useEffect(() => {
    if (ready) return;
    let alive = true;
    loadKatex().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [ready]);
  return useMemo(() => (ready ? texHtmlNow(tex, display, macros) : null), [ready, tex, display, macros]);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
