// What the Insert menu puts at the cursor: LaTeX for a section, a list, a figure, a table, an equation, a citation…
// Each is a CodeMirror snippet with places to fill in (${…}; Tab goes to the next), made around what is picked when
// something is: the words as a section's title, the lines as a list's items. Some need a package, which the preamble
// gets when it lacks it.
import type { TexDoc } from '@shared/latex';

export type SnipId = 'section' | 'subsection' | 'bold' | 'italic' | 'itemize' | 'enumerate' | 'figure' | 'table' | 'equation' | 'align' | 'cite' | 'footnote' | 'link';

export interface Snip {
  id: SnipId;
  label: string;
  /** The command, beside the label in the menu. */
  hint: string;
}

export const SNIPPETS: Snip[] = [
  { id: 'section', label: 'Section heading', hint: '\\section' },
  { id: 'subsection', label: 'Subsection heading', hint: '\\subsection' },
  { id: 'bold', label: 'Bold', hint: 'Ctrl+B' },
  { id: 'italic', label: 'Italic', hint: 'Ctrl+I' },
  { id: 'itemize', label: 'Bulleted list', hint: 'itemize' },
  { id: 'enumerate', label: 'Numbered list', hint: 'enumerate' },
  { id: 'figure', label: 'Figure with a picture', hint: 'figure' },
  { id: 'table', label: 'Table', hint: 'tabular' },
  { id: 'equation', label: 'Equation', hint: 'equation' },
  { id: 'align', label: 'Aligned equations', hint: 'align' },
  { id: 'cite', label: 'Citation', hint: '\\cite' },
  { id: 'footnote', label: 'Footnote', hint: '\\footnote' },
  { id: 'link', label: 'Link', hint: '\\href' },
];

/** Text that goes into a snippet as it is: what would read as a place to fill in, or a brace's escape, is escaped. */
const lit = (s: string) => s.replace(/\\([{}])/g, '\\\\$1').replace(/([$#])\{/g, '$1\\{');

/** A place to fill in, named by what goes there. */
const field = (name: string) => '${' + name + '}';

/** A label's name from words: "Results and costs" → "results-and-costs". */
export const labelOf = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'x';

export interface Made {
  template: string;
  /** On lines of its own. */
  block: boolean;
  /** Packages the preamble must load. */
  needs?: string[];
}

/**
 * The snippet for `id`, made around `picked` (the text picked, '' when none). `picture`: the name of the picture a
 * figure shows; `key`: a bibliography entry to cite.
 */
export function makeSnippet(id: SnipId, picked: string, o: { picture?: string; key?: string; labels?: string[] } = {}): Made {
  // A label the document has not used yet: fig:plot, else fig:plot-2…
  const free = (base: string) => {
    const taken = new Set(o.labels ?? []);
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  };
  const one = picked && !picked.includes('\n') ? picked.trim() : '';
  const lines = picked
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  switch (id) {
    case 'section':
    case 'subsection':
      return { template: `\\${id}{${one ? lit(one) : field('Title')}}`, block: true };
    case 'bold':
    case 'italic':
      return { template: '', block: false };
    case 'itemize':
    case 'enumerate': {
      const items = lines.length ? lines.map((l) => `  \\item ${lit(l.replace(/^([-*•]|\d+[.)])\s+/, ''))}`) : [`  \\item ${field('First')}`, `  \\item ${field('Second')}`];
      return { template: [`\\begin{${id}}`, ...items, `\\end{${id}}`].join('\n'), block: true };
    }
    case 'figure': {
      const name = o.picture ?? 'figures/picture.png';
      const caption = name.replace(/^.*\//, '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      return {
        template: [
          '\\begin{figure}[htbp]',
          '  \\centering',
          `  \\includegraphics[width=${field('0.8')}\\linewidth]{${lit(name)}}`,
          `  \\caption{${field(caption.charAt(0).toUpperCase() + caption.slice(1))}}`,
          `  \\label{${lit(free(`fig:${labelOf(caption)}`))}}`,
          '\\end{figure}',
        ].join('\n'),
        block: true,
        needs: ['graphicx'],
      };
    }
    case 'table':
      return {
        template: [
          '\\begin{table}[htbp]',
          '  \\centering',
          '  \\begin{tabular}{lrl}',
          '    \\hline',
          `    ${field('Name')} & ${field('Value')} & ${field('Note')} \\\\`,
          '    \\hline',
          '    A & 1 & First \\\\',
          '    B & 2 & Second \\\\',
          '    \\hline',
          '  \\end{tabular}',
          `  \\caption{${field('Caption')}}`,
          `  \\label{tab:${field('label')}}`,
          '\\end{table}',
        ].join('\n'),
        block: true,
      };
    case 'equation':
      return { template: ['\\begin{equation}', `  ${one ? lit(one) : field('E = mc^2')}`, `  \\label{eq:${field('label')}}`, '\\end{equation}'].join('\n'), block: true, needs: ['amsmath'] };
    case 'align':
      return {
        template: ['\\begin{align}', ...(lines.length ? lines.map((l, i) => `  ${lit(l)}${i < lines.length - 1 ? ' \\\\' : ''}`) : [`  ${field('a')} &= b + c \\\\`, '  d &= e - f']), '\\end{align}'].join('\n'),
        block: true,
        needs: ['amsmath'],
      };
    case 'cite':
      return { template: `~\\cite{${field(o.key ?? 'key')}}`, block: false };
    case 'footnote':
      return { template: `\\footnote{${one ? lit(one) : field('A note')}}`, block: false };
    case 'link':
      return { template: `\\href{${field('https://')}}{${one ? lit(one) : field('the words to click')}}`, block: false, needs: ['hyperref'] };
  }
}

/** The labels (\label{…}) of a document, its bibliography's keys, its pictures and files: what completions offer. */
export function docWords(d: TexDoc) {
  const labels = new Set<string>();
  const keys = new Set<string>();
  for (const t of [d.main, ...d.files.filter((f) => /\.(tex|ltx)$/i.test(f.name)).map((f) => f.text)]) for (const m of t.matchAll(/\\label\s*\{([^{}]+)\}/g)) labels.add(m[1].trim());
  for (const f of d.files) if (f.name.endsWith('.bib')) for (const m of f.text.matchAll(/@\s*([A-Za-z]+)\s*[{(]\s*([^,\s]+)\s*,/g)) if (!/^(comment|string|preamble)$/i.test(m[1])) keys.add(m[2]);
  return { labels: [...labels], keys: [...keys], pictures: d.pictures.map((p) => p.name), files: d.files.map((f) => f.name) };
}

/** main.tex with `\usepackage{name}` in its preamble for each of `names` it does not load yet (after its last \usepackage). */
export function withPackages(main: string, names: string[]): string {
  const lines = main.split('\n');
  const begin = lines.findIndex((l) => /^\s*\\begin\s*\{document\}/.test(l));
  if (begin < 0) return main;
  const head = lines.slice(0, begin).join('\n');
  const missing = names.filter((n) => !new RegExp(`\\\\(usepackage|RequirePackage)\\s*(\\[[^\\]]*\\])?\\s*\\{[^}]*\\b${n}\\b`).test(head) && !(n === 'graphicx' && /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\bgraphics\b/.test(head)));
  if (!missing.length) return main;
  let at = -1;
  for (let i = 0; i < begin; i++) if (/^\s*\\usepackage/.test(lines[i])) at = i;
  // After the last package, but before hyperref, which asks to come last.
  let put = at >= 0 ? at + 1 : lines.findIndex((l, i) => i < begin && /^\s*\\documentclass/.test(l)) + 1;
  if (at >= 0 && /\{hyperref\}/.test(lines[at])) put = at;
  lines.splice(Math.max(put, 0), 0, ...missing.map((n) => `\\usepackage{${n}}`));
  return lines.join('\n');
}

/** main.tex with a bibliography from refs.bib before \end{document}, when it has none. */
export function withBibliography(main: string, bib: string): string {
  if (/\\(bibliography|addbibresource|printbibliography)\s*[{[]/.test(main)) return main;
  return main.replace(/(\n?)(\s*\\end\s*\{document\})/, `$1\n\\bibliographystyle{plain}\n\\bibliography{${bib.replace(/\.bib$/, '')}}\n$2`);
}

export const SAMPLE_BIB = `@book{knuth1984,
  author    = {Donald E. Knuth},
  title     = {The {\\TeX}book},
  publisher = {Addison-Wesley},
  year      = {1984}
}
`;
