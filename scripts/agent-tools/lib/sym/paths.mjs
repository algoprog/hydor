// Path helpers. Every function takes the `path` flavour to use (default: this platform's), so the Windows behaviour
// can be tested on any machine with `path.win32`. Printed paths always use forward slashes.
import path from 'node:path';

// Forward slashes on Windows; on POSIX a backslash is an ordinary file-name character and stays.
export function posixPath(p, pm = path) {
  return pm.sep === '\\' ? p.replace(/\\/g, '/') : p;
}

// `p` relative to `cwd` (like path.relative, '' for the same place), with forward slashes.
export function relPosix(cwd, p, pm = path) {
  return posixPath(pm.relative(cwd, pm.resolve(cwd, p)), pm);
}

// Relative path for a search argument: '.' for cwd itself.
export function relOrDot(cwd, p, pm = path) {
  return relPosix(cwd, p, pm) || '.';
}

// Is `abs` the same place as `dir`, or below it?
export function isWithin(abs, dir, pm = path) {
  const rel = pm.relative(dir, abs);
  if (rel === '') return true;
  return rel !== '..' && !rel.startsWith('..' + pm.sep) && !pm.isAbsolute(rel);
}

// Segments of `file` relative to `cwd` ('..' for each step up).
export function relSegments(cwd, file, pm = path) {
  return relPosix(cwd, file, pm).split('/');
}

// Output of a search tool -> a clean relative path: forward slashes, no leading './'.
export function cleanFound(file, pm = path) {
  return posixPath(file, pm).replace(/^(?:\.\/)+/, '');
}

// The module name a Python file stands for: its stem, or its folder for __init__.py; null for other files.
export function moduleStem(file, pm = path) {
  if (!/\.pyi?$/.test(file)) return null;
  const base = pm.basename(file).replace(/\.pyi?$/, '');
  return base === '__init__' ? pm.basename(pm.dirname(file)) : base;
}
