// Grammar loading and parsing (web-tree-sitter + vendored prebuilt WASM grammars). Both are vendored in this folder:
// no installed packages are needed.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import v8 from 'node:v8';

let Parser; let Language;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GRAMMAR_DIR = path.join(HERE, 'grammars');
// The runtime's module loads tree-sitter.wasm from beside itself.
export const RUNTIME_URL = pathToFileURL(path.join(HERE, 'vendor', 'web-tree-sitter', 'tree-sitter.js')).href;

export const LANG_BY_EXT = {
  '.ts': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.pyi': 'python',
  '.rs': 'rust',
};

// language -> family used by declaration logic
export function family(lang) {
  switch (lang) {
    case 'typescript': case 'tsx': return 'ts';
    case 'javascript': return 'js';
    case 'python': return 'py';
    case 'rust': return 'rs';
    default: return null;
  }
}
export const isTsLike = (lang) => lang === 'typescript' || lang === 'tsx' || lang === 'javascript';

export function langForFile(file) {
  const i = file.lastIndexOf('.');
  if (i < 0) return null;
  return LANG_BY_EXT[file.slice(i).toLowerCase()] || null;
}

// --lang value -> predicate over language names
export function langFilter(value) {
  if (!value) return null;
  const v = String(value).toLowerCase();
  const map = {
    ts: ['typescript', 'tsx'], typescript: ['typescript', 'tsx'], tsx: ['tsx'],
    js: ['javascript'], javascript: ['javascript'], jsx: ['javascript'],
    py: ['python'], python: ['python'],
    rs: ['rust'], rust: ['rust'],
  };
  if (!map[v]) return undefined;
  return new Set(map[v]);
}

function disabled(lang) {
  const v = process.env.SYM_NO_GRAMMAR;
  if (!v) return false;
  if (v === '1' || v === 'all') return true;
  const fam = family(lang);
  return v.split(',').some((x) => x === lang || x === fam);
}

let initPromise = null;
const languages = new Map(); // lang -> Language | null
const parsers = new Map();

async function init() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        // Background TurboFan compilation of the multi-MB grammar modules costs ~1 s of CPU at exit;
        // baseline (Liftoff) code parses just as fast for our workloads.
        v8.setFlagsFromString('--liftoff-only');
        ({ Parser, Language } = await import(RUNTIME_URL));
        await Parser.init();
        return true;
      } catch { return false; }
    })();
  }
  return initPromise;
}

export async function loadLanguage(lang) {
  if (languages.has(lang)) return languages.get(lang);
  let result = null;
  if (!disabled(lang)) {
    try {
      if (await init()) {
        result = await Language.load(path.join(GRAMMAR_DIR, `tree-sitter-${lang}.wasm`));
        // Verify it can actually parse (ABI mismatches fail here or at setLanguage).
        const p = new Parser();
        p.setLanguage(result);
        parsers.set(lang, p);
      }
    } catch {
      result = null;
      parsers.delete(lang);
    }
  }
  languages.set(lang, result);
  return result;
}

// Returns a tree or null (grammar unavailable / parse failure).
export async function parse(lang, source) {
  const L = await loadLanguage(lang);
  if (!L) return null;
  const p = parsers.get(lang);
  try {
    return p.parse(source) || null;
  } catch {
    return null;
  }
}

// Loading a grammar after the first parse is very slow (~1 s) in web-tree-sitter 0.25, so
// callers load every language they will need before parsing anything.
export async function preload(langs) {
  for (const l of new Set(langs)) if (l) await loadLanguage(l);
}
