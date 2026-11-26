// What a run left: how many files and lines the builder wrote that are in the app's folder (not what was installed, locked, generated or built), and, for a change request,
// how many lines are new or changed since the app was first built.
//   node scripts/webapp-bench/measure.ts <app folder> [--json]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

/** Folders that are never the builder's: installed packages, builds, caches, what the app keeps and what a tool generates. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.output', '.nitro', '.vinxi', '.tanstack', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', 'coverage', 'data', 'drizzle', '.vite', '__pycache__', '.venv', 'venv', 'target']);
const LOCKS = /^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|deno\.lock|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock)$/;
const GENERATED = /(\.gen\.[a-z]+|\.min\.(js|css)|\.map|\.d\.ts|\.tsbuildinfo)$/;
/** Text that is code, markup, styling or configuration. Notes (markdown) are not counted: a builder's report is not the app. */
const COUNTED = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss|html?|sql|svelte|vue|py|rb|go|rs|sh|ya?ml|toml|ejs|hbs|njk|pug|php|java|cs|txt)$/i;

export interface Size {
  files: number;
  lines: number;
}

const linesIn = (text: string): number => text.split('\n').filter((l) => l.trim() !== '').length;

export function appFiles(app: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.isSymbolicLink()) walk(path);
      } else if (entry.isFile() && COUNTED.test(entry.name) && !LOCKS.test(entry.name) && !GENERATED.test(entry.name) && statSync(path).size < 2_000_000) out.push(path);
    }
  };
  walk(app);
  return out;
}

export function measure(app: string): Size {
  const files = appFiles(app);
  return { files: files.length, lines: files.reduce((n, f) => n + linesIn(readFileSync(f, 'utf8')), 0) };
}

const linesOf = (text: string): string[] => text.split('\n').map((l) => l.trim()).filter(Boolean);

/** How many lines of `now` are not in `before`: a line counts once for each time it is there and was not before (a line that moved is not new). */
export function addedLines(before: string, now: string): number {
  const have = new Map<string, number>();
  for (const l of linesOf(before)) have.set(l, (have.get(l) ?? 0) + 1);
  let added = 0;
  for (const l of linesOf(now)) {
    const n = have.get(l) ?? 0;
    if (n > 0) have.set(l, n - 1);
    else added++;
  }
  return added;
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { json: { type: 'boolean' } } });
  const app = positionals[0];
  if (!app || !existsSync(app)) {
    console.error('usage: node scripts/webapp-bench/measure.ts <app folder> [--json]');
    return 2;
  }
  const size = measure(resolve(app));
  console.log(values.json ? JSON.stringify(size, null, 2) : `${size.files} files, ${size.lines} lines`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) process.exit(await main());
