// The identifier rule: a request that names something exact (a path, a function, a flag, a version) bears on the notes
// that name it too, however its meaning compares to theirs. A token of the request that looks like an identifier counts
// when only a few notes of the pool contain it (an identifier in half the notes tells nothing), and those notes count as
// relevant, at most MAX_NOTES for a request, the rarest tokens first.
// Written to be moved into server/memory/search.ts as it is: pure functions of texts.

const EXT = 'ts|tsx|js|jsx|mjs|cjs|json|md|py|rs|go|css|html|yml|yaml|sh|toml|sql|txt|c|h|cpp|java|rb|lock|conf|ini|svg|png|webp|wasm|db|log|mdx|vue|swift|kt|ipynb|csv';
const RULES: { kind: string; re: RegExp }[] = [
  // Paths: with a slash and either a file extension, two slashes or a leading ./ ~/ /.
  { kind: 'path', re: /(?<![\w@./~-])(?:\.{0,2}\/|~\/)?(?:[\w@.-]+\/)+[\w@.-]+/g },
  // File names: name.ext.
  { kind: 'file', re: new RegExp(`(?<![\\w/.-])[\\w-]+(?:\\.[\\w-]+)*\\.(?:${EXT})(?![\\w-])`, 'gi') },
  // camelCase and PascalCase with two or more humps (getUser, PostgreSQL, YouTube).
  { kind: 'camel', re: /(?<![\w-])(?:[a-z]+(?:[A-Z][a-z0-9]*)+|[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+)(?![\w-])/g },
  // snake_case and UPPER_SNAKE with two or more parts.
  { kind: 'snake', re: /(?<![\w-])[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+(?![\w-])/g },
  // kebab-case with two or more parts.
  { kind: 'kebab', re: /(?<![\w-])[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+(?![\w-])/g },
  // Letters mixed with digits: v0.62.0, k8s, x86_64, mDenseOn2.
  { kind: 'mixed', re: /(?<![\w-])(?=[\w.]*[A-Za-z])(?=[\w.]*\d)[A-Za-z0-9][\w.]*[A-Za-z0-9](?![\w-])/g },
  // Flags: --resume, --no-verify.
  { kind: 'flag', re: /(?<![\w-])--[a-z][\w-]+/g },
];

const MIN_LEN = 4;
export const MAX_NOTES = 3;

/** The tokens of a request that look like identifiers (distinct, as written). */
export function identifierTokens(text: string): string[] {
  // Backticks and quotes around a token are not part of it.
  const t = text.replace(/[`"'“”‘’]/g, ' ');
  const out = new Set<string>();
  for (const { kind, re } of RULES)
    for (const m of t.matchAll(re)) {
      const tok = m[0].replace(/[.,;:!?)\]}]+$/, '').replace(/^[(\[{]+/, '');
      if (tok.length < MIN_LEN || tok.includes('://')) continue;
      if (kind === 'path' && !(/\.[a-z0-9]{1,6}$/i.test(tok) || (tok.match(/\//g) ?? []).length >= 2 || /^(?:\.{0,2}\/|~\/)/.test(tok))) continue;
      // Dates and plain numbers with dashes or dots are not names.
      if (!/[A-Za-z]/.test(tok)) continue;
      if (kind === 'kebab' && /^\d{4}-\d{2}(-\d{2})?$/.test(tok)) continue;
      out.add(tok);
    }
  return [...out];
}

/** What a token may be looked for as: a path by itself first, then by its file name. */
function forms(tok: string): string[] {
  const f = [tok.toLowerCase()];
  const base = tok.includes('/') ? tok.slice(tok.lastIndexOf('/') + 1) : '';
  if (base.length >= 5 && /\.[a-z0-9]{1,6}$/i.test(base)) f.push(base.toLowerCase());
  return f;
}

/**
 * The notes (indexes into `texts`) the request's identifiers point to: for each token, the notes containing it when
 * there are between 1 and `cut` of them (cut: the larger of 2 and `frac` of the notes), the tokens with the fewest
 * notes first, at most MAX_NOTES notes in all.
 */
export function identifierNotes(query: string, texts: string[], frac: number): number[] {
  const lower = texts.map((t) => t.toLowerCase());
  const cut = Math.max(2, Math.ceil(frac * texts.length));
  const hits: number[][] = [];
  for (const tok of identifierTokens(query))
    for (const f of forms(tok)) {
      const m: number[] = [];
      lower.forEach((t, i) => t.includes(f) && m.push(i));
      if (m.length >= 1 && m.length <= cut) {
        hits.push(m);
        break;
      }
    }
  hits.sort((a, b) => a.length - b.length);
  const out: number[] = [];
  for (const m of hits) for (const i of m) if (!out.includes(i) && out.length < MAX_NOTES) out.push(i);
  return out;
}
