import { EventEmitter } from 'node:events';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { SearchHit } from '../../shared/types.ts';
import { agentRoots, APP_ROOT, config, paths } from '../config.ts';
import type { DB } from '../db.ts';
import { keptPath } from './kept.ts';
import { searchSessions } from './search.ts';

export { ftsQuery, searchSessions } from './search.ts';

/** Where the app keeps its own link to every Claude Code and Codex transcript (kept.ts). */
export const KEPT_DIR = path.join(config.dataDir, 'kept');

/** The kept link of a transcript, if the app keeps one for it. */
export const keptOfTranscript = (file: string) => keptPath(file, [...agentRoots.claudeProjects, ...agentRoots.codexHomes], KEPT_DIR);

/** The indexer this server started, which answers searches (findSessions). */
let running: Indexer | null = null;

/**
 * Sessions that fit some words, as searchSessions finds them, from the indexer's worker so that nothing here waits on
 * a search that matches many messages (a common word ranked hundreds of thousands of them, a second at worst on this
 * thread); here only when the worker is not there or does not answer in time.
 */
export async function findSessions(db: DB, q: string, limit = 40): Promise<SearchHit[]> {
  return (await running?.search(q, limit)) ?? searchSessions(db, q, limit);
}

/** Main-thread handle on the indexer worker. Emits 'updated' ({keys, removed}) and 'progress'. */
export class Indexer extends EventEmitter {
  private worker: Worker | null = null;
  progress = { done: 0, total: 0, running: true };
  private asked = new Map<number, (hits: SearchHit[] | null) => void>();
  private seq = 0;

  /** The worker's answer to a search, or null when it has none in 3 s (or is not running). */
  search(q: string, limit: number): Promise<SearchHit[] | null> {
    const w = this.worker;
    if (!w) return Promise.resolve(null);
    const id = ++this.seq;
    return new Promise((resolve) => {
      const late = setTimeout(() => (this.asked.delete(id), resolve(null)), 3000);
      late.unref?.();
      this.asked.set(id, (hits) => (clearTimeout(late), resolve(hits)));
      w.postMessage({ type: 'search', id, q, limit });
    });
  }

  start() {
    running = this;
    const w = new Worker(path.join(APP_ROOT, 'dist/server/index-worker.js'), {
      workerData: { dbPath: paths.db, claudeProjectsDirs: agentRoots.claudeProjects, codexHomes: agentRoots.codexHomes, acpDir: path.join(config.dataDir, 'acp'), keptDir: KEPT_DIR },
    });
    this.worker = w;
    w.on('message', (m: { type: string; keys?: string[]; removed?: string[]; done?: number; total?: number; running?: boolean; path?: string; message?: string; id?: number; hits?: SearchHit[] }) => {
      if (m.type === 'updated') {
        this.progress = { done: m.done ?? 0, total: m.total ?? 0, running: !!m.running };
        if (m.keys?.length || m.removed?.length) this.emit('updated', { keys: m.keys ?? [], removed: m.removed ?? [] });
        this.emit('progress', this.progress);
      } else if (m.type === 'searched') {
        const done = this.asked.get(m.id ?? 0);
        this.asked.delete(m.id ?? 0);
        done?.(m.hits ?? null);
      } else if (m.type === 'error') {
        console.warn(`[indexer] ${m.path}: ${m.message}`);
      }
    });
    w.on('error', (e) => console.error('[indexer] worker failed:', e));
    w.on('exit', (code) => {
      this.worker = null;
      for (const done of this.asked.values()) done(null);
      this.asked.clear();
      if (code !== 0) setTimeout(() => this.start(), 5000);
    });
  }

  /** The history folders changed (an account was added or removed). */
  rootsChanged() {
    this.worker?.postMessage({ type: 'roots', claudeProjectsDirs: agentRoots.claudeProjects, codexHomes: agentRoots.codexHomes });
  }

  /** Re-index these transcripts soon (a live session wrote to them). */
  poke(paths: (string | null | undefined)[]) {
    const list = paths.filter(Boolean) as string[];
    if (list.length) this.worker?.postMessage({ type: 'poke', paths: list });
  }

  stop() {
    this.worker?.terminate();
  }
}
