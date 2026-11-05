// The formula the cursor is in, drawn with KaTeX in a small card above its first line (below when there is no room):
// $…$, \(…\), \[…\], $$…$$ and the display environments (equation, align, gather, multline…), with the document's own
// \newcommand macros applied where KaTeX can. The card follows what is typed without blinking: one card while the
// cursor stays in the same formula, its drawing changed in place. It shows in Visual mode too, where the formula the
// cursor is in shows as its source.
import { StateField, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, showTooltip, type Tooltip, type TooltipView } from '@codemirror/view';
import { texHtml, texHtmlNow } from '../common/katex';
import { katexOf, mathAt, texSpans, type MathSpan } from './scan';

/** The span the main cursor (or what is picked, inside one span) is in, with something in it. */
function spanAt(state: EditorState): MathSpan | null {
  const r = state.selection.main;
  const spans = state.field(texSpans);
  const m = mathAt(spans, r.head);
  if (!m || r.from < m.from || r.to > m.to) return null;
  if (!state.sliceDoc(m.innerFrom, m.innerTo).trim()) return null;
  return m;
}

const theme = EditorView.baseTheme({
  '.cm-tooltip.cm-tex-preview': {
    padding: '6px 10px',
    maxWidth: 'min(640px, 92vw)',
    maxHeight: '40vh',
    overflow: 'auto',
    borderRadius: '10px',
    border: '1px solid var(--line)',
    background: 'var(--elevated)',
    color: 'var(--fg)',
    boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
    fontSize: '15px',
  },
  '.cm-tooltip.cm-tex-preview .katex-display': { margin: '0' },
});

/** The formula preview (see the top of this file); `macros`: the document's, for KaTeX. */
export function mathPreview(macros: () => Record<string, string>): Extension {
  const view = (): TooltipView => {
    const dom = document.createElement('div');
    dom.className = 'cm-tex-preview';
    let last = '';
    let ask = 0;
    const draw = (state: EditorState) => {
      const m = spanAt(state);
      if (!m) return;
      const tex = katexOf(state.doc.toString(), m);
      const key = `${m.display ? 'D' : 'i'}${tex}`;
      if (key === last) return;
      last = key;
      let mac: Record<string, string> = {};
      try {
        mac = macros();
      } catch {}
      const now = texHtmlNow(tex, m.display, mac);
      if (now !== null) dom.innerHTML = now;
      else {
        const n = ++ask;
        void texHtml(tex, m.display, mac).then((html) => {
          if (n === ask) dom.innerHTML = html;
        });
      }
    };
    return {
      dom,
      mount: (v) => draw(v.state),
      update: (u) => {
        if (u.docChanged || u.selectionSet) draw(u.state);
      },
    };
  };
  const field = StateField.define<Tooltip | null>({
    create: (s) => {
      const m = spanAt(s);
      return m ? { pos: m.from, above: true, arrow: false, create: view } : null;
    },
    update: (v, tr) => {
      if (!tr.docChanged && !tr.selection) return v;
      const m = spanAt(tr.state);
      if (!m) return null;
      // The same formula: the same card, drawn again in place.
      if (v && tr.changes.mapPos(v.pos) === m.from) return v.pos === m.from ? v : { ...v, pos: m.from };
      return { pos: m.from, above: true, arrow: false, create: view };
    },
    provide: (f) => showTooltip.from(f),
  });
  return [texSpans, field, theme];
}
