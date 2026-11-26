// Finds the addresses an app writes for its own pages, files and API that start with a single slash ("/notes", "/app.js"). Hydor
// shows an app at a path of its own when it is reached through one hostname (a tunnel): there such an address leaves the app and
// reaches Hydor instead. Addresses relative to the page work at any path. This reads the app's own source files, only text and
// Node: contract-check.ts (so the script a builder runs) uses it, with nothing of Hydor's own.
import fs from "node:fs";
import path from "node:path";

export interface OwnPath {
  /** Relative to the app's folder, with slashes. */
  file: string;
  line: number;
  /** The address as written, or what is wrong where there is no address ("base" of Vite). */
  address: string;
}

export interface OwnPaths {
  /** Source files read. */
  files: number;
  found: OwnPath[];
}

/** Folders that hold what is made, fetched or somebody else's, never the app's own source. */
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage", "target", "vendor", "vendored", "third_party", "third-party", "bower_components", "jspm_packages", "site-packages", "venv", "__pycache__", "design"]);
const MARKUP = new Set([".html", ".htm", ".vue", ".svelte", ".ejs", ".hbs", ".njk", ".pug", ".php", ".erb", ".jinja", ".j2", ".twig", ".liquid", ".mustache", ".mjml"]);
const CODE = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx", ".go"]);
const HASH = new Set([".py", ".rb"]);
const STYLE = new Set([".css", ".scss", ".sass", ".less"]);
const MAX_FILE = 512 * 1024;
const MAX_FILES = 3000;
const MAX_DEPTH = 10;
const MAX_LINE = 2000;

const kindOf = (ext: string): "markup" | "code" | "hash" | "style" | null => (MARKUP.has(ext) ? "markup" : CODE.has(ext) ? "code" : HASH.has(ext) ? "hash" : STYLE.has(ext) ? "style" : null);

/** Source files of the app: [absolute path, kind]. Not hidden folders, built or fetched ones, minified files, tests, or files over 512 KB. */
function sources(root: string): { file: string; kind: NonNullable<ReturnType<typeof kindOf>> }[] {
  const out: { file: string; kind: NonNullable<ReturnType<typeof kindOf>> }[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
    let names: fs.Dirent[];
    try {
      names = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    names.sort((a, b) => a.name.localeCompare(b.name));
    for (const d of names) {
      if (out.length >= MAX_FILES) return;
      const full = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (d.name.startsWith(".") || SKIP_DIRS.has(d.name) || /^(__tests__|tests?|e2e)$/.test(d.name)) continue;
        walk(full, depth + 1);
      } else if (d.isFile()) {
        const kind = kindOf(path.extname(d.name).toLowerCase());
        if (!kind || /\.min\.|\.d\.ts$|(^|[.-])(test|spec)\.[a-z]+$|-test\.[a-z]+$/i.test(d.name)) continue;
        try {
          if (fs.statSync(full).size > MAX_FILE) continue;
        } catch {
          continue;
        }
        out.push({ file: full, kind });
      }
    }
  };
  walk(root, 0);
  return out;
}

/** The text with its comments turned into spaces (newlines kept), so that offsets and lines stay. Quotes are followed so that "http://x" is no comment. */
function blank(text: string, kind: "markup" | "code" | "hash" | "style"): string {
  if (kind === "markup") return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  if (kind === "style") return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const o = text.split("");
  const n = o.length;
  let i = 0;
  const wipe = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (o[k] !== "\n") o[k] = " ";
  };
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (kind === "hash" && c === "#") {
      let e = text.indexOf("\n", i);
      if (e < 0) e = n;
      wipe(i, e);
      i = e;
    } else if (kind === "code" && c === "/" && next === "/") {
      let e = text.indexOf("\n", i);
      if (e < 0) e = n;
      wipe(i, e);
      i = e;
    } else if (kind === "code" && c === "/" && next === "*") {
      let e = text.indexOf("*/", i + 2);
      e = e < 0 ? n : e + 2;
      wipe(i, e);
      i = e;
    } else if (c === '"' || c === "'" || (c === "`" && kind === "code")) {
      // A string: to its end. One that is not a template ends at its line (a stray quote in a pattern must not swallow the file).
      let k = i + 1;
      while (k < n && text[k] !== c && (c === "`" || text[k] !== "\n")) k += text[k] === "\\" ? 2 : 1;
      i = k + 1;
    } else i++;
  }
  return o.join("");
}

interface Rule {
  re: RegExp;
  /** The group with the address (default 1). */
  at?: number;
}

const Q = "[\"'`]";
/** Starts with one slash and is no "//host": what leaves the app's path. */
const OWN = String.raw`(\/(?!\/)[^"'\`\\\s)]*)`;
const OWN_STR = String.raw`(\/(?!\/)[^"'\`\\]*)`;

const RULES: Rule[] = [
  // markup: href, src, action, formaction, poster (and the ones scripts read), written or in JSX/templates as a string
  { re: new RegExp(String.raw`(?<![\w-])(?:href|src|action|formaction|poster|data-src|data-href)\s*=\s*(?:\{\s*)?\\?${Q}${OWN}`, "gi") },
  // meta refresh
  { re: new RegExp(String.raw`http-equiv\s*=\s*\\?["']refresh\\?["'][^>]*?content\s*=\s*\\?["']\s*\d+\s*;\s*url\s*=\s*${OWN}`, "gi") },
  // css: url(/…) and @import "/…"
  { re: new RegExp(String.raw`url\(\s*${Q}?${OWN}`, "gi") },
  { re: new RegExp(String.raw`@import\s+${Q}${OWN}`, "gi") },
  // requests
  { re: new RegExp(String.raw`(?<![\w$.])(?:window\.)?(?:fetch|axios|ky|got|new\s+EventSource|new\s+WebSocket|new\s+Request)\s*\(\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`(?<![\w$])(?:axios|ky|got|\$|superagent)\.(?:get|post|put|patch|delete|head|options|request|getJSON|ajax|postJSON)\s*\(\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`\.open\(\s*["'](?:GET|POST|PUT|PATCH|DELETE|HEAD)["']\s*,\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`\bbaseURL\s*:\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`navigator\.sendBeacon\(\s*${Q}${OWN_STR}`, "g") },
  // moving the page
  { re: new RegExp(String.raw`(?:(?<![\w$.])|(?<=\b(?:window|document|top|self|parent)\.))location(?:\.href)?\s*=(?!=)\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`\blocation\.(?:assign|replace)\(\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`\b(?:pushState|replaceState)\([^,()]*,[^,()]*,\s*${Q}${OWN_STR}`, "g") },
  // the server sending people on
  { re: new RegExp(String.raw`\bredirect\w*\(\s*(?:\d{3}\s*,\s*|[A-Za-z_.]*Status\w*\s*,\s*)?${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`\bRedirect\(\s*\w+\s*,\s*\w+\s*,\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`(?:["'](?:[Ll]ocation)["']|\bLocation)\s*[:,]\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`\bLocation:\s*${OWN}`, "g") },
];

/** Each candidate of a srcset that starts with one slash. */
const SRCSET = /(?<![\w-])srcset\s*=\s*\\?(["'])([^"']*)\1/gi;

const lineOf = (starts: number[], at: number): number => {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
};

const VITE = /^vite\.config\.(?:[cm]?[jt]s)$/;

/** Vite's own index.html names its script and files with a slash and has them rewritten with its `base`: its config says whether that is ever relative. */
function viteBase(dir: string): { file: string; line: number; address: string } | null {
  let config: string | null = null;
  try {
    config = fs.readdirSync(dir).find((n) => VITE.test(n)) ?? null;
  } catch {}
  if (!config || !fs.existsSync(path.join(dir, "index.html"))) return null;
  let text = "";
  try {
    text = fs.readFileSync(path.join(dir, config), "utf8");
  } catch {
    return null;
  }
  const code = blank(text, "code");
  const m = /\bbase\s*:\s*(["'`])([^"'`]*)\1/.exec(code);
  // A base that is not a literal (an environment variable) is taken as chosen.
  if (m && m[2] !== "/") return null;
  if (!m && /\bbase\s*:/.test(code)) return null;
  const at = m ? m.index : 0;
  return { file: config, line: text.slice(0, at).split("\n").length, address: m ? `base: "/"` : `no base (Vite builds with "/": set base: './')` };
}

/** The own addresses in `text`, as (index, address). Exposed for the tests. */
export function addressesIn(text: string, ext: string): { at: number; address: string }[] {
  const kind = kindOf(ext.toLowerCase());
  if (!kind) return [];
  const clean = blank(text, kind);
  const seen = new Set<number>();
  const out: { at: number; address: string }[] = [];
  for (const r of RULES) {
    r.re.lastIndex = 0;
    for (let m = r.re.exec(clean); m; m = r.re.exec(clean)) {
      const address = m[r.at ?? 1];
      if (!address) continue;
      const at = m.index + m[0].lastIndexOf(address);
      if (seen.has(at)) continue;
      seen.add(at);
      out.push({ at, address });
    }
  }
  SRCSET.lastIndex = 0;
  for (let m = SRCSET.exec(clean); m; m = SRCSET.exec(clean)) {
    let pos = m.index + m[0].indexOf(m[2], m[0].indexOf("=") + 1);
    for (const part of m[2].split(",")) {
      const lead = part.length - part.trimStart().length;
      const url = part.trim().split(/\s+/)[0] ?? "";
      if (/^\/(?!\/)/.test(url) && !seen.has(pos + lead)) {
        seen.add(pos + lead);
        out.push({ at: pos + lead, address: url });
      }
      pos += part.length + 1;
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Looks through the app's own source files in `dir` for addresses of its own that start with a single slash. */
export function scanOwnPaths(dir: string): OwnPaths {
  const root = path.resolve(dir);
  const found: OwnPath[] = [];
  const list = sources(root);
  let files = 0;
  for (const { file, kind } of list) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    files++;
    if (text.split("\n").some((l) => l.length > MAX_LINE)) continue;
    const rel = path.relative(root, file).split(path.sep).join("/");
    const ext = path.extname(file).toLowerCase();
    // Vite's index.html is rewritten with its base: what its config says about that is looked at instead.
    if (path.basename(file) === "index.html" && kind === "markup") {
      const folder = path.dirname(file);
      let config = false;
      try {
        config = fs.readdirSync(folder).some((n) => VITE.test(n));
      } catch {}
      if (config) {
        const b = viteBase(folder);
        if (b) found.push({ file: path.relative(root, path.join(folder, b.file)).split(path.sep).join("/"), line: b.line, address: b.address });
        continue;
      }
    }
    const starts = [0];
    for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
    for (const a of addressesIn(text, ext)) found.push({ file: rel, line: lineOf(starts, a.at), address: a.address });
  }
  return { files, found };
}
