// The documents a turn made or changed (a report, a paper, a PDF, a Word, Excel or PowerPoint file, LaTeX, a notebook, a
// Markdown write-up), as cards under its reply: every time, whether or not the agent handed them over with present_files.
// They come from what its tools changed, and from the documents the server found changed in the session's folder while the
// turn ran (GET /api/fs/made) that the turn plausibly made.
import { useEffect, useState } from 'react';
import { isMadeDoc } from '@shared/documents';
import type { FileChange, TimelineItem, TurnItem } from '@shared/types';
import { api } from '../../lib/api';
import { basename, dirname } from '../../lib/format';
import { Card, cardsGrid, FileCard, presentedPaths, useFileStats } from '../documents/FileCards';
import { resolveIn } from '../documents/fileTypes';
import { nagetTool } from '../registry';

/** A document the server found changed within a span of time. */
export interface MadeFile {
  path: string;
  size: number;
  mtime: number;
  born?: number;
}

/** The parts of a turn (Timeline's Segment) that tell what it made. */
export interface TurnLike {
  prompt?: TimelineItem;
  notice?: TimelineItem;
  work: TimelineItem[];
  answer: TimelineItem[];
  attention: TimelineItem[];
  end?: TurnItem;
}

export interface TurnFiles {
  /** Every file its tools changed, as absolute paths (a moved one by its new place), each once. */
  changed: string[];
  /** The files its present_files calls hand over. */
  handed: string[];
  /** The documents to show as cards. */
  docs: Card[];
}

/** How long after a turn ends a file's change still counts as the turn's (the file system's clock and the app's differ a little). */
export const SLACK = 5000;
/** At most this much of a tool call's input, and of its output, is searched for the names of files. */
const INPUT_CHARS = 20_000;
const NONE: MadeFile[] = [];

/** When the turn started. */
export const startOf = (t: TurnLike): number | undefined => t.prompt?.ts ?? t.notice?.ts ?? t.work[0]?.ts;

const cache = new WeakMap<object, { finished: boolean; cwd?: string; home?: string; made: MadeFile[]; out: TurnFiles }>();

/** What a turn made: for a finished one, its documents as cards; for any, the files it changed and handed over. Kept for as long as its parts are. */
export function turnFiles(t: TurnLike, finished: boolean, cwd: string | undefined, home: string | undefined, made: MadeFile[] = NONE): TurnFiles {
  const hit = cache.get(t);
  if (hit && hit.finished === finished && hit.cwd === cwd && hit.home === home && hit.made === made) return hit.out;
  const out = compute(t, finished, cwd, home, made);
  cache.set(t, { finished, cwd, home, made, out });
  return out;
}

function compute(t: TurnLike, finished: boolean, cwd: string | undefined, home: string | undefined, made: MadeFile[]): TurnFiles {
  const items = [...t.work, ...t.answer, ...t.attention];
  // What its tools changed, in the order they did: created, or only changed.
  const changes = new Map<string, { created: boolean; deleted: boolean }>();
  const dirs = new Set<string>();
  const handed: string[] = [];
  const said: string[] = [];
  const inputs: string[] = [];
  for (const it of items) {
    if (it.kind === 'assistant') said.push(it.text);
    if (it.kind !== 'tool') continue;
    if (it.tool.status === 'error' || it.tool.status === 'declined' || it.tool.status === 'interrupted') continue;
    if (nagetTool(it.tool.name) === 'present_files') handed.push(...presentedPaths(it, cwd, home));
    if (finished) {
      // The history keeps little of a call's input (a command or a path as its title, no input), so its title, subtitle, label and output count too.
      const t = it.tool;
      let json = '';
      try {
        json = t.input == null ? '' : (JSON.stringify(t.input) ?? '').slice(0, INPUT_CHARS);
      } catch {}
      inputs.push([t.title, t.subtitle, t.label, (t.output ?? '').slice(0, INPUT_CHARS), json].filter(Boolean).join('\n'));
    }
    for (const f of (it.tool.files ?? []) as FileChange[]) {
      const p = resolveIn(f.op === 'move' && f.movePath ? f.movePath : f.path, cwd, home);
      const was = changes.get(p);
      changes.set(p, { created: was ? was.created : f.op === 'create', deleted: f.op === 'delete' });
      dirs.add(dirname(p));
    }
  }
  const changedList = [...changes].filter(([, c]) => !c.deleted).map(([p]) => p);
  const out: TurnFiles = { changed: changedList, handed, docs: [] };
  if (!finished) return out;

  const docs = new Map<string, Card>();
  for (const [p, c] of changes) if (!c.deleted && isMadeDoc(p)) docs.set(p, { path: p, note: c.created ? 'New' : 'Updated' });
  const start = startOf(t);
  const end = t.end?.ts;
  if (start != null && end != null && made.length) {
    const haystack = [...inputs, ...said].join('\n').toLowerCase();
    const named = (p: string) => {
      const name = basename(p).toLowerCase();
      if (haystack.includes(name)) return true;
      const bare = name.replace(/\.[^.]*$/, '');
      return bare.length >= 3 && haystack.includes(bare);
    };
    for (const f of made) {
      if (docs.has(f.path) || f.mtime < start || f.mtime > end + SLACK) continue;
      // Other sessions may write in the same folder at the same time: only what this turn names, or lies beside what it changed, is its.
      if (!named(f.path) && !dirs.has(dirname(f.path))) continue;
      docs.set(f.path, { path: f.path, note: f.born != null && f.born >= start ? 'New' : 'Updated' });
    }
  }
  for (const p of handed) docs.delete(p);
  // What it made to be read (a PDF, a Word file, slides) before the sources it was made from (LaTeX, Markdown, tables).
  const source = (p: string) => (/\.(tex|md|markdown|csv|tsv)$/i.test(p) ? 1 : 0);
  out.docs = [...docs.values()].sort((a, b) => source(a.path) - source(b.path));
  return out;
}

const SHOWN = 4;

/** A finished turn's documents, under its reply: the first few, and the rest on a click. */
export function TurnDocs({ docs, sessionKey }: { docs: Card[]; sessionKey: string }) {
  const [all, setAll] = useState(false);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const list = docs.filter((c) => !gone.has(c.path));
  const shown = all ? list : list.slice(0, SHOWN);
  const stats = useFileStats(shown.map((c) => c.path));
  // A file that is no longer there (a scratch file taken away later) is not shown.
  const missing = shown.filter((c) => stats[c.path] && !stats[c.path]!.exists).map((c) => c.path);
  useEffect(() => {
    if (missing.length) setGone((g) => new Set([...g, ...missing]));
  }, [missing.join('\n')]);
  if (!shown.length) return null;
  const more = list.length - SHOWN;
  return (
    <div>
      <div data-tip="files-made" className={cardsGrid(shown.length)}>
        {shown.map((c) => (
          <FileCard key={c.path} card={c} stat={stats[c.path]} sessionKey={sessionKey} />
        ))}
      </div>
      {more > 0 && (
        <button onClick={() => setAll((a) => !a)} className="rounded-lg px-2.5 py-1 text-left text-[12.5px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg-2">
          {all ? 'Show fewer' : more === 1 ? 'Show 1 more document' : `Show ${more.toLocaleString()} more documents`}
        </button>
      )}
    </div>
  );
}

// The made documents of a session's finished turns: one fetch for them all, on its folder, from the first turn's start to
// the last one's end. Made again when another turn finishes (or the folder changes); the answers are kept by their span.
const fetched = new Map<string, MadeFile[]>();

export function useMadeFiles(cwd: string | undefined, since: number | undefined, until: number | undefined): MadeFile[] {
  const key = cwd && since != null && until != null ? `${cwd}|${since}|${until}` : '';
  const [got, setGot] = useState<{ cwd?: string; files: MadeFile[] }>({ files: NONE });
  useEffect(() => {
    if (!key) return;
    const hit = fetched.get(key);
    if (hit) {
      setGot((g) => (g.files === hit ? g : { cwd, files: hit }));
      return;
    }
    let alive = true;
    api<{ files: MadeFile[] }>(`/api/fs/made?dir=${encodeURIComponent(cwd!)}&since=${since}&until=${until}`)
      .then((r) => {
        if (fetched.size >= 50) fetched.delete(fetched.keys().next().value!);
        fetched.set(key, r.files);
        if (alive) setGot({ cwd, files: r.files });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  return got.cwd === cwd ? got.files : NONE;
}
