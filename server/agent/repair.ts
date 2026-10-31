// Tool calls as models write them, made runnable: arguments that are almost JSON (trailing commas, single
// quotes, raw newlines, Python's True and None, comments, a cut-off end, the same object sent twice),
// tools called by other harnesses' names or with a typo, arguments under other names, and errors that
// say exactly what to send when something is still wrong.
import fs from 'node:fs';
import path from 'node:path';

/** What repair needs of a tool. */
export interface Callable {
  name: string;
  parameters: Record<string, unknown>;
}

// ---- JSON --------------------------------------------------------------------------------------------

const BARE: Record<string, string> = { True: 'true', False: 'false', None: 'null', NaN: 'null', Infinity: 'null', undefined: 'null', true: 'true', false: 'false', null: 'null' };

/** Where the value that opens at `start` closes (after it), or -1 when it never does. */
function closing(t: string, start: number): number {
  let depth = 0;
  let q = '';
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '\\') i++;
      else if (c === q) q = '';
    } else if (c === '"' || c === "'") q = c;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && --depth === 0) return i + 1;
  }
  return -1;
}

/** Rewrites almost-JSON as JSON: quotes, escapes, bare words, comments, trailing commas, what was left open. */
function mend(t: string): string {
  let out = '';
  let q = '';
  const stack: string[] = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '\\') {
        const n = t[i + 1];
        if (n === undefined) break;
        if (n === "'") out += "'";
        else if ('"\\/bfnrtu'.includes(n)) out += c + n;
        else if (n === '\n') out += '\\n';
        else out += '\\\\' + n;
        i++;
      } else if (c === q) {
        out += '"';
        q = '';
      } else if (c === '"') out += '\\"';
      else if (c === '\n') out += '\\n';
      else if (c === '\r') out += '\\r';
      else if (c === '\t') out += '\\t';
      else if (c < ' ') out += `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`;
      else out += c;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      out += '"';
    } else if (c === '/' && t[i + 1] === '/') {
      while (i < t.length && t[i] !== '\n') i++;
    } else if (c === '/' && t[i + 1] === '*') {
      const end = t.indexOf('*/', i + 2);
      i = end < 0 ? t.length : end + 1;
    } else if (c === '{' || c === '[') {
      stack.push(c === '{' ? '}' : ']');
      out += c;
    } else if (c === '}' || c === ']') {
      out = out.replace(/,\s*$/, '');
      stack.pop();
      out += c;
    } else if (/[A-Za-z_$~./]/.test(c)) {
      const m = /^[A-Za-z_$][\w$-]*/.exec(t.slice(i))?.[0] ?? '';
      // A value left unquoted ({"path": src/app.ts}): all of it up to the next comma or bracket, as text.
      if (out.trimEnd().endsWith(':') && !(m && BARE[m] && /^\s*[,}\]\n]|^\s*$/.test(t.slice(i + m.length)))) {
        let j = i;
        while (j < t.length && !',}]\n'.includes(t[j])) j++;
        out += JSON.stringify(t.slice(i, j).trim());
        i = j - 1;
        continue;
      }
      if (!m) {
        out += c;
        continue;
      }
      i += m.length - 1;
      const after = /^\s*:/.test(t.slice(i + 1));
      out += after ? JSON.stringify(m) : (BARE[m] ?? JSON.stringify(m));
    } else out += c;
  }
  if (q) out += '"';
  out = out.replace(/,\s*$/, '').replace(/:\s*$/, ': null');
  while (stack.length) out += stack.pop();
  return out;
}

/**
 * A model's arguments as a value. Plain JSON first; then what models get wrong: a code fence, text before
 * the object, the object sent twice, JSON inside a string, and anything mend() fixes.
 */
export function repairJson(raw: string): { value?: unknown; error?: string } {
  let t = raw.replace(/^﻿/, '').trim();
  const fence = /^```[\w-]*\s*\n?([\s\S]*?)\n?```$/.exec(t);
  if (fence) t = fence[1].trim();
  if (!t) return { value: {} };
  const tryParse = (s: string) => {
    try {
      return { ok: true, v: JSON.parse(s) as unknown };
    } catch {
      return { ok: false, v: undefined };
    }
  };
  let r = tryParse(t);
  if (!r.ok) {
    const start = t.search(/[{[]/);
    if (start >= 0) {
      // Values one after another (some servers repeat the whole arguments), text around them, or one left open.
      const whole: string[] = [];
      let open = '';
      for (let from = start; ; ) {
        const end = closing(t, from);
        if (end < 0) {
          open = t.slice(from);
          break;
        }
        whole.push(t.slice(from, end));
        const next = t.slice(end).search(/\S/);
        if (next < 0 || !'{['.includes(t[end + next])) break;
        from = end + next;
      }
      for (const v of [...whole.reverse(), open].filter(Boolean)) {
        r = tryParse(v);
        if (!r.ok) r = tryParse(mend(v));
        if (r.ok) break;
      }
    } else if (/^[-\d"'tfnTFN]/.test(t)) r = tryParse(mend(t));
  }
  if (!r.ok) return { error: 'not readable as JSON' };
  // JSON inside a string: '"{\"path\": \"a\"}"'.
  if (typeof r.v === 'string' && /^\s*[{[]/.test(r.v)) {
    const inner = repairJson(r.v);
    if (inner.value !== undefined) return inner;
  }
  return { value: r.v };
}

// ---- names -------------------------------------------------------------------------------------------

/** Other harnesses' names for these tools (Claude Code, Codex, Gemini CLI, OpenHands, Cline…), and plain words. */
const TOOL_ALIASES: Record<string, string> = {
  shell: 'bash', run: 'bash', run_command: 'bash', run_shell_command: 'bash', execute: 'bash', execute_command: 'bash', execute_bash: 'bash',
  terminal: 'bash', exec: 'bash', bash_command: 'bash', cmd: 'bash', command: 'bash', sh: 'bash', run_terminal_cmd: 'bash', container_exec: 'bash',
  local_shell: 'bash', run_in_terminal: 'bash',
  cat: 'read_file', read: 'read_file', view: 'read_file', open_file: 'read_file', view_file: 'read_file', read_text_file: 'read_file',
  readfile: 'read_file', get_file_contents: 'read_file', file_read: 'read_file', view_image: 'read_file', read_many_files: 'read_file',
  write: 'write_file', create_file: 'write_file', create: 'write_file', save_file: 'write_file', write_to_file: 'write_file', file_write: 'write_file',
  new_file: 'write_file', writefile: 'write_file',
  edit: 'edit_file', str_replace: 'edit_file', replace: 'edit_file', replace_in_file: 'edit_file', search_replace: 'edit_file', replace_string_in_file: 'edit_file',
  edit_text_file: 'edit_file', modify_file: 'edit_file', editfile: 'edit_file', file_edit: 'edit_file',
  multiedit: 'multi_edit', edits: 'multi_edit', multi_replace: 'multi_edit',
  apply_diff: 'apply_patch', applypatch: 'apply_patch', patch: 'apply_patch', apply_unified_diff: 'apply_patch',
  ls: 'list_dir', list: 'list_dir', list_files: 'list_dir', list_directory: 'list_dir', dir: 'list_dir', listdir: 'list_dir', list_folder: 'list_dir',
  search: 'grep', rg: 'grep', search_files: 'grep', search_file_content: 'grep', grep_search: 'grep', find_in_files: 'grep', ripgrep: 'grep', search_code: 'grep',
  find: 'glob', find_files: 'glob', file_search: 'glob', glob_search: 'glob', glob_files: 'glob', find_file: 'glob',
  fetch: 'web_fetch', webfetch: 'web_fetch', fetch_url: 'web_fetch', read_url: 'web_fetch', browse: 'web_fetch', open_url: 'web_fetch', http_get: 'web_fetch',
  fetch_webpage: 'web_fetch', url_fetch: 'web_fetch',
  todo: 'todo_write', todowrite: 'todo_write', update_plan: 'todo_write', update_todos: 'todo_write', plan: 'todo_write', todo_list: 'todo_write',
  write_todos: 'todo_write', todo_update: 'todo_write', set_plan: 'todo_write',
  load_skill: 'skill', use_skill: 'skill', read_skill: 'skill',
  bashoutput: 'bash_output', get_output: 'bash_output', read_output: 'bash_output', shell_output: 'bash_output', process_output: 'bash_output', check_output: 'bash_output',
  killshell: 'bash_kill', kill_shell: 'bash_kill', killbash: 'bash_kill', kill_bash: 'bash_kill', kill_process: 'bash_kill', stop_process: 'bash_kill',
  tool_search: 'find_tools', search_tools: 'find_tools', toolsearch: 'find_tools', list_tools: 'find_tools',
  websearch: 'web_search', google_web_search: 'web_search', search_web: 'web_search', internet_search: 'web_search', google_search: 'web_search',
};

/** OpenHands' and Anthropic's one-tool file editor: which of ours each of its commands is. */
const EDITORS = new Set(['str_replace_editor', 'str_replace_based_edit_tool', 'text_editor', 'editor', 'file_editor']);

export const normName = (name: string) =>
  name
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/^(functions?|tools?|default_api)[.:]/, '')
    .replace(/:\d+$/, '')
    .replace(/\(\)$/, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[-\s.]+/g, '_')
    .replace(/_tool$/, '');

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}

/** The tool a model means: its exact name, another harness's name for it, a name sent twice, or one typo away. */
export function findTool<T extends Callable>(name: string, tools: T[]): T | undefined {
  const exact = tools.find((t) => t.name === name);
  if (exact) return exact;
  let n = normName(name);
  // Some servers repeat the name in every piece of a streamed call: read_fileread_file.
  if (n.length % 2 === 0 && n.slice(0, n.length / 2) === n.slice(n.length / 2)) n = n.slice(n.length / 2);
  const by = (x: string) => tools.find((t) => t.name === x || normName(t.name) === x);
  const hit = by(n) ?? (TOOL_ALIASES[n] ? by(TOOL_ALIASES[n]) : undefined) ?? (EDITORS.has(n) ? by('edit_file') : undefined);
  if (hit) return hit;
  // An MCP tool called by its own name (offered as mcp__server__name), or by its full name when it is offered by its own.
  const suffix = tools.filter((t) => t.name.toLowerCase().endsWith(`__${n}`));
  if (suffix.length === 1) return suffix[0];
  const own = /^mcp__.+?__(.+)$/.exec(n)?.[1];
  if (own) {
    const t = by(own);
    if (t) return t;
  }
  if (n.length >= 5) {
    const close = tools.map((t) => ({ t, d: distance(n, normName(t.name)) })).filter((x) => x.d <= (n.length >= 8 ? 2 : 1));
    close.sort((a, b) => a.d - b.d);
    if (close.length && (close.length === 1 || close[0].d < close[1].d)) return close[0].t;
  }
}

/** Names close to an unknown one, for the error. */
export function closeNames(name: string, tools: Callable[]): string[] {
  const n = normName(name);
  return tools
    .map((t) => ({ name: t.name, d: distance(n, normName(t.name)) + (normName(t.name).includes(n) || n.includes(normName(t.name)) ? 0 : 1) }))
    .filter((x) => x.d <= 2)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => x.name);
}

// ---- arguments ---------------------------------------------------------------------------------------

/** Argument names models use for ours. */
const ARG_ALIASES: Record<string, string[]> = {
  path: ['file_path', 'filePath', 'filename', 'file', 'dir', 'directory', 'absolute_path', 'target_file', 'filepath', 'fname', 'folder', 'dir_path', 'directory_path', 'target'],
  old_string: ['oldString', 'old_str', 'old', 'search', 'find', 'old_text', 'oldText', 'original', 'before', 'from'],
  new_string: ['newString', 'new_str', 'new', 'replacement', 'replace', 'new_text', 'newText', 'updated', 'after', 'to'],
  content: ['contents', 'text', 'file_text', 'data', 'body', 'code', 'file_content', 'fileContent'],
  command: ['cmd', 'script', 'shell', 'bash_command', 'commandLine', 'command_line', 'commands'],
  pattern: ['query', 'regex', 'glob_pattern', 'search', 'search_term', 'regexp', 'expression', 'glob'],
  url: ['link', 'href', 'uri', 'address', 'page', 'website'],
  offset: ['start_line', 'line', 'from_line', 'start', 'startLine', 'line_start', 'line_number'],
  limit: ['lines', 'count', 'max_lines', 'num_lines', 'n', 'line_count'],
  replace_all: ['replaceAll', 'all', 'global'],
  todos: ['plan', 'items', 'tasks', 'todo_list', 'list', 'steps'],
  name: ['skill', 'skill_name', 'skillName'],
  id: ['process_id', 'shell_id', 'bash_id', 'task_id', 'job_id', 'processId', 'shellId'],
  query: ['q', 'keywords', 'search', 'what', 'description'],
  patch: ['input', 'diff', 'patch_text', 'patchText', 'changes'],
  edits: ['changes', 'replacements', 'operations'],
  timeout: ['timeout_seconds', 'seconds', 'time_limit'],
  background: ['run_in_background', 'detach', 'async', 'detached'],
};

/** A shell command given as a list (Codex: ["bash", "-lc", "…"]), as one string. */
function commandText(v: unknown): unknown {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return v;
  const a = v as string[];
  if (a.length === 3 && /(^|\/)(ba|z)?sh$/.test(a[0]) && /^-[a-z]*c[a-z]*$/.test(a[1])) return a[2];
  return a.map((w) => (/^[\w@%+=:,./-]+$/.test(w) ? w : `'${w.replace(/'/g, `'\\''`)}'`)).join(' ');
}

/** Arguments fitted to the schema: renamed keys, "20" as 20, "true" as true, JSON text as values, a command list as a string. */
export function fitArgs(args: Record<string, any>, schema: any): Record<string, any> {
  const props: Record<string, any> = schema?.properties ?? {};
  const out: Record<string, any> = { ...args };
  // An editor's view_range [from, to], or start and end lines, as offset and limit.
  if ('offset' in props && 'limit' in props && out.offset === undefined) {
    const range = Array.isArray(out.view_range) ? out.view_range : null;
    const from = Number(range?.[0] ?? out.start_line ?? out.startLine);
    const to = Number(range?.[1] ?? out.end_line ?? out.endLine);
    if (from > 0) {
      out.offset = from;
      if (to >= from) out.limit = to - from + 1;
      for (const k of ['view_range', 'start_line', 'startLine', 'end_line', 'endLine']) delete out[k];
    }
  }
  for (const [k, p] of Object.entries(props)) {
    if (out[k] === undefined)
      for (const alt of ARG_ALIASES[k] ?? [])
        if (out[alt] !== undefined && !(alt in props)) {
          out[k] = out[alt];
          delete out[alt];
          break;
        }
    let v = out[k];
    if (k === 'command' && p.type === 'string') v = out[k] = commandText(v);
    if (typeof v === 'string') {
      const s = v.trim();
      if ((p.type === 'integer' || p.type === 'number') && /^-?\d+(\.\d+)?$/.test(s)) out[k] = Number(s);
      else if (p.type === 'boolean' && /^(true|false|yes|no|1|0)$/i.test(s)) out[k] = /^(true|yes|1)$/i.test(s);
      else if ((p.type === 'array' || p.type === 'object') && /^[[{]/.test(s)) {
        const r = repairJson(s);
        if (r.value !== undefined && typeof r.value === 'object') out[k] = r.value;
      } else if (p.type === 'array' && s && p.items?.type === 'string') out[k] = [v];
    } else if (p.type === 'string' && v != null && typeof v !== 'string') out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    else if (p.type === 'array' && v != null && !Array.isArray(v) && typeof v === 'object' && p.items?.type === 'object') out[k] = [v];
    if ((out[k] === null || out[k] === '') && !(schema.required ?? []).includes(k)) delete out[k];
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

const typeName = (p: any) => (p?.enum ? p.enum.map((e: unknown) => JSON.stringify(e)).join(' | ') : p?.type === 'array' ? `list of ${p.items?.type ?? 'values'}` : (p?.type ?? 'value'));

/** What is still wrong with fitted arguments, said so the model can fix it; null when nothing is. */
export function checkArgs(tool: Callable, args: Record<string, any>): string | null {
  const schema: any = tool.parameters ?? {};
  const props: Record<string, any> = schema.properties ?? {};
  const problems: string[] = [];
  for (const k of schema.required ?? []) if (args[k] === undefined) problems.push(`${k} is missing (${typeName(props[k])}${props[k]?.description ? `: ${String(props[k].description).slice(0, 120)}` : ''})`);
  for (const [k, v] of Object.entries(args)) {
    const p = props[k];
    if (!p || v === undefined) continue;
    if (p.enum && !p.enum.includes(v)) problems.push(`${k} must be one of ${typeName(p)}, not ${JSON.stringify(v).slice(0, 60)}`);
    else if ((p.type === 'integer' || p.type === 'number') && typeof v !== 'number') problems.push(`${k} must be a number, not ${JSON.stringify(v).slice(0, 60)}`);
    else if (p.type === 'array' && !Array.isArray(v)) problems.push(`${k} must be a list`);
    else if (p.type === 'object' && (typeof v !== 'object' || Array.isArray(v))) problems.push(`${k} must be an object`);
  }
  if (!problems.length) return null;
  const example = Object.fromEntries((schema.required ?? Object.keys(props).slice(0, 2)).map((k: string) => [k, props[k]?.type === 'integer' || props[k]?.type === 'number' ? 1 : props[k]?.type === 'boolean' ? true : props[k]?.type === 'array' ? [] : '…']));
  return `${tool.name} did not run: ${problems.join('; ')}. Call it again with arguments like ${JSON.stringify(example)}.`;
}

/**
 * Calls written for another harness's tools, turned into ours: the file editor with a command
 * (view, create, str_replace, insert), Codex's update_plan, a patch sent to the edit tool.
 */
export function adapt(name: string, args: Record<string, any>): { name: string; args: Record<string, any> } {
  const n = normName(name);
  if (EDITORS.has(n) && typeof args.command === 'string') {
    const p = args.path ?? args.file_path;
    switch (args.command) {
      case 'view':
        return { name: 'read_file', args: { path: p, ...(args.view_range ? { view_range: args.view_range } : {}) } };
      case 'create':
        return { name: 'write_file', args: { path: p, content: args.file_text ?? args.content ?? '' } };
      case 'str_replace':
        return { name: 'edit_file', args: { path: p, old_string: args.old_str ?? args.old_string, new_string: args.new_str ?? args.new_string ?? '' } };
      case 'insert':
        return { name: 'edit_file', args: { path: p, old_string: '', new_string: args.new_str ?? args.new_string ?? args.text ?? '', insert_line: Number(args.insert_line ?? 0) } };
    }
  }
  if ((n === 'update_plan' || n === 'todo_write') && Array.isArray(args.plan) && !args.todos)
    return { name: 'todo_write', args: { todos: args.plan.map((x: any) => ({ content: String(x.step ?? x.content ?? x.text ?? ''), status: x.status })) } };
  if ((n === 'patch' || n === 'edit' || n === 'apply_diff') && typeof (args.patch ?? args.input ?? args.diff) === 'string' && args.old_string === undefined && args.old_str === undefined)
    return { name: 'apply_patch', args: { patch: args.patch ?? args.input ?? args.diff } };
  return { name, args };
}

/** A path the model gave with a line-number prefix or quotes kept on: the file it means, when that one exists. */
export function cleanPath(p: unknown, cwd: string): unknown {
  if (typeof p !== 'string') return p;
  const t = p.trim().replace(/^["'`]|["'`]$/g, '').replace(/^file:\/\//, '');
  if (t !== p && fs.existsSync(path.resolve(cwd, t))) return t;
  const noLine = t.replace(/:\d+(:\d+)?$/, '');
  if (noLine !== t && !fs.existsSync(path.resolve(cwd, t)) && fs.existsSync(path.resolve(cwd, noLine))) return noLine;
  return t;
}
