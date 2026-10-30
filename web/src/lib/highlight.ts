// Lazy Shiki highlighter: the core loads on the first code block, each grammar on first use.
import type { HighlighterCore } from 'shiki/core';

const LANGS: Record<string, () => Promise<any>> = {
  typescript: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  javascript: () => import('@shikijs/langs/javascript'),
  jsx: () => import('@shikijs/langs/jsx'),
  json: () => import('@shikijs/langs/json'),
  jsonc: () => import('@shikijs/langs/jsonc'),
  python: () => import('@shikijs/langs/python'),
  bash: () => import('@shikijs/langs/bash'),
  rust: () => import('@shikijs/langs/rust'),
  go: () => import('@shikijs/langs/go'),
  java: () => import('@shikijs/langs/java'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  css: () => import('@shikijs/langs/css'),
  scss: () => import('@shikijs/langs/scss'),
  html: () => import('@shikijs/langs/html'),
  xml: () => import('@shikijs/langs/xml'),
  markdown: () => import('@shikijs/langs/markdown'),
  yaml: () => import('@shikijs/langs/yaml'),
  toml: () => import('@shikijs/langs/toml'),
  sql: () => import('@shikijs/langs/sql'),
  diff: () => import('@shikijs/langs/diff'),
  dockerfile: () => import('@shikijs/langs/dockerfile'),
  makefile: () => import('@shikijs/langs/makefile'),
  ruby: () => import('@shikijs/langs/ruby'),
  php: () => import('@shikijs/langs/php'),
  swift: () => import('@shikijs/langs/swift'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  lua: () => import('@shikijs/langs/lua'),
  r: () => import('@shikijs/langs/r'),
  latex: () => import('@shikijs/langs/latex'),
  ini: () => import('@shikijs/langs/ini'),
  nginx: () => import('@shikijs/langs/nginx'),
  graphql: () => import('@shikijs/langs/graphql'),
  vue: () => import('@shikijs/langs/vue'),
  svelte: () => import('@shikijs/langs/svelte'),
  haskell: () => import('@shikijs/langs/haskell'),
  scala: () => import('@shikijs/langs/scala'),
  perl: () => import('@shikijs/langs/perl'),
  powershell: () => import('@shikijs/langs/powershell'),
  cmake: () => import('@shikijs/langs/cmake'),
  proto: () => import('@shikijs/langs/proto'),
  hcl: () => import('@shikijs/langs/hcl'),
  regex: () => import('@shikijs/langs/regex'),
  csv: () => import('@shikijs/langs/csv'),
  zig: () => import('@shikijs/langs/zig'),
  elixir: () => import('@shikijs/langs/elixir'),
  dart: () => import('@shikijs/langs/dart'),
  julia: () => import('@shikijs/langs/julia'),
  nix: () => import('@shikijs/langs/nix'),
  vim: () => import('@shikijs/langs/viml'),
};

const ALIASES: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  python3: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  shellscript: 'bash',
  terminal: 'bash',
  yml: 'yaml',
  md: 'markdown',
  rs: 'rust',
  'c++': 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  h: 'c',
  cs: 'csharp',
  golang: 'go',
  kt: 'kotlin',
  rb: 'ruby',
  tex: 'latex',
  docker: 'dockerfile',
  make: 'makefile',
  mk: 'makefile',
  tf: 'hcl',
  jsonl: 'json',
  ndjson: 'json',
  json5: 'jsonc',
  ps1: 'powershell',
  htm: 'html',
  svg: 'xml',
  conf: 'ini',
  cfg: 'ini',
  env: 'ini',
  patch: 'diff',
  jl: 'julia',
  ex: 'elixir',
  exs: 'elixir',
};

export function resolveLang(lang?: string | null): string | null {
  if (!lang) return null;
  const l = lang.toLowerCase().trim();
  const name = ALIASES[l] ?? l;
  return LANGS[name] ? name : null;
}

export function langFromPath(path: string): string | null {
  const base = path.split('/').pop() ?? '';
  if (/^dockerfile/i.test(base)) return 'dockerfile';
  if (/^makefile$/i.test(base)) return 'makefile';
  const ext = base.includes('.') ? base.split('.').pop()! : '';
  return resolveLang(ext);
}

let core: Promise<HighlighterCore> | null = null;
const loaded = new Set<string>();

function highlighter(): Promise<HighlighterCore> {
  if (!core) {
    core = (async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([import('shiki/core'), import('shiki/engine/javascript')]);
      return createHighlighterCore({
        themes: [import('@shikijs/themes/github-light-default'), import('@shikijs/themes/github-dark-default')],
        langs: [],
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      });
    })();
  }
  return core;
}

/** HTML for a code block, or null when the language is unknown (render plain). */
export async function highlight(code: string, lang: string | null): Promise<string | null> {
  const name = resolveLang(lang);
  if (!name || code.length > 400_000) return null;
  const h = await highlighter();
  if (!loaded.has(name)) {
    await h.loadLanguage((await LANGS[name]()).default);
    loaded.add(name);
  }
  return h.codeToHtml(code, {
    lang: name,
    themes: { light: 'github-light-default', dark: 'github-dark-default' },
    defaultColor: 'light',
  });
}
