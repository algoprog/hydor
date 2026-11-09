// The persisted half of a session view: a transcript file parsed incrementally as it grows.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { Agent, TimelineItem, TimelinePage } from '../shared/types.ts';
import { agentRoots, config } from './config.ts';
import { ClaudeParser } from './history/claude.ts';
import { CodexParser } from './history/codex.ts';
import { AcpParser } from './history/acp.ts';
import { previewItem } from './history/common.ts';
import { LineSplitter } from './runner/frames.ts';

const CHUNK = 4 << 20;
const WHOLE_CAP = 1500;

/** A message from the user, which opens a turn (as the timeline groups them). */
const startsTurn = (it: TimelineItem | undefined) => !!it && it.kind === 'user' && it.meta !== 'note' && it.meta !== 'command-output';

/** Where Claude Code keeps the transcript for a session started in `cwd` (by the account whose history is `projectsDir`). */
export function claudeTranscriptPath(cwd: string, sessionId: string, projectsDir = config.claudeProjectsDir): string {
  return path.join(projectsDir, cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${sessionId}.jsonl`);
}

export function findClaudeTranscript(sessionId: string): string | null {
  for (const root of agentRoots.claudeProjects) {
    try {
      for (const dir of fs.readdirSync(root)) {
        const p = path.join(root, dir, `${sessionId}.jsonl`);
        if (fs.existsSync(p)) return p;
      }
    } catch {}
  }
  return null;
}

/**
 * Emits 'items' (changed items) whenever new transcript lines were parsed.
 */
export class Timeline extends EventEmitter {
  parser: ClaudeParser | CodexParser | AcpParser;
  private offset = 0;
  private splitter = new LineSplitter();
  private watcher: fs.FSWatcher | null = null;
  private poll: NodeJS.Timeout | null = null;
  private reading: Promise<void> | null = null;
  private again = false;
  private finished = false;
  /** When a missing transcript was last looked for elsewhere. */
  private lookedAt = 0;
  loaded = false;
  lastUsed = Date.now();
  subscribers = 0;

  constructor(
    public readonly key: string,
    public readonly agent: Agent,
    public filePath: string | null,
  ) {
    super();
    const o = { retain: true, collectChunks: false };
    this.parser = agent === 'claude' ? new ClaudeParser(o) : agent === 'codex' ? new CodexParser(o) : new AcpParser(o);
  }

  /** The session's goal as its transcript tells it, while one is set and not met or cleared. */
  goal() {
    return this.parser.goal;
  }

  /** Reads everything written so far and starts following the file. */
  async load(live: boolean): Promise<void> {
    await this.readMore();
    this.loaded = true;
    if (!live) this.finish();
    this.follow();
  }

  setPath(p: string) {
    if (this.filePath === p) return;
    this.filePath = p;
    this.unfollow();
    this.follow();
    this.poke();
  }

  /** Closes the last turn once the session is no longer running. */
  finish() {
    if (this.finished) return;
    this.finished = true;
    this.parser.finish();
    this.flush();
  }

  /** New activity; the transcript may be about to change. */
  reopen() {
    this.finished = false;
  }

  endTurn() {
    if (this.parser instanceof ClaudeParser) {
      this.parser.endTurn();
      this.flush();
    }
  }

  private follow() {
    if (this.poll) return;
    // inotify catches appends immediately; the poll covers files that appear later or odd filesystems.
    this.poll = setInterval(() => this.poke(), 1500);
    this.tryWatch();
  }

  private tryWatch() {
    if (this.watcher || !this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      this.watcher = fs.watch(this.filePath, { persistent: false }, () => this.poke());
      this.watcher.on('error', () => {
        this.watcher?.close();
        this.watcher = null;
      });
    } catch {
      this.watcher = null;
    }
  }

  unfollow() {
    this.watcher?.close();
    this.watcher = null;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  poke() {
    if (this.reading) {
      this.again = true;
      return;
    }
    this.readMore().catch(() => {});
  }

  readMore(): Promise<void> {
    if (this.reading) {
      this.again = true;
      return this.reading;
    }
    this.reading = (async () => {
      do {
        this.again = false;
        await this.readOnce();
      } while (this.again);
    })().finally(() => {
      this.reading = null;
    });
    return this.reading;
  }

  private async readOnce() {
    const file = this.filePath;
    if (!file) return;
    let st: fs.Stats;
    try {
      st = await fs.promises.stat(file);
    } catch {
      this.relocate(file);
      return;
    }
    this.tryWatch();
    if (st.size < this.offset) {
      // Rewritten (e.g. deleted and recreated): start over.
      this.offset = 0;
      this.splitter = new LineSplitter();
      this.parser = this.agent === 'claude' ? new ClaudeParser({ retain: true, collectChunks: false }) : new CodexParser({ retain: true, collectChunks: false });
      this.emit('reset');
    }
    if (st.size === this.offset) return;
    const fh = await fs.promises.open(file, 'r');
    try {
      const buf = Buffer.allocUnsafe(CHUNK);
      while (this.offset < st.size) {
        const { bytesRead } = await fh.read(buf, 0, Math.min(CHUNK, st.size - this.offset), this.offset);
        if (bytesRead <= 0) break;
        const at = this.offset;
        this.offset += bytesRead;
        // Line offsets let a message's images be read back from the transcript when shown.
        this.splitter.pushAt(Buffer.from(buf.subarray(0, bytesRead)), at, (line, off) => this.parser.feed(line, off));
        // Let other requests run between chunks of a large transcript.
        await new Promise((r) => setImmediate(r));
      }
    } finally {
      await fh.close();
    }
    this.flush();
  }

  /**
   * A Claude session's transcript is followed from before the CLI writes it, where it is expected. Should it
   * turn up elsewhere (another account's folder, a folder named otherwise), it is found by its name there and
   * followed, so the page never waits on a file that will not come (its steps would show running forever).
   */
  private relocate(file: string) {
    if (this.agent !== 'claude' || Date.now() - this.lookedAt < 1000) return;
    this.lookedAt = Date.now();
    const found = findClaudeTranscript(path.basename(file, '.jsonl'));
    if (found && found !== file) this.setPath(found);
  }

  /** What changed since the last time; `initial` while the transcript is first read (the server's own listeners hear
   * it, pages fetch what they show of it themselves). */
  private flush() {
    const changed = this.parser.takeDirty();
    if (changed.length) this.emit('items', changed, !this.loaded);
  }

  get total(): number {
    return this.parser.items.length;
  }

  /**
   * Items before `before` (the end when not given): `limit` of them, or with `whole`, reaching back to
   * the message that began the turn they start in, so a page holds whole turns and shows as more
   * conversation rather than more hidden steps (within WHOLE_CAP, for turns of thousands of steps).
   */
  page(before: number | undefined, limit: number, whole = false): TimelinePage {
    const items = this.parser.items;
    const end = Math.max(0, Math.min(before ?? items.length, items.length));
    let start = Math.max(0, end - limit);
    if (whole) {
      const floor = Math.max(0, end - WHOLE_CAP);
      while (start > floor && !startsTurn(items[start])) start--;
    }
    return { items: items.slice(start, end).map(previewItem), total: items.length, start };
  }

  item(id: string): TimelineItem | undefined {
    return this.parser.items.find((i) => i.id === id);
  }

  has(id: string): boolean {
    return this.parser.has(id);
  }

  /** Recent user prompts, used to match optimistic messages with the stored ones. */
  userTexts(sinceTs: number): string[] {
    const out: string[] = [];
    const items = this.parser.items;
    for (let i = items.length - 1; i >= 0 && out.length < 20; i--) {
      const it = items[i];
      if (it.kind === 'user') {
        if ((it.ts ?? 0) < sinceTs) break;
        out.push(it.text);
      }
    }
    return out;
  }

  dispose() {
    this.unfollow();
    this.removeAllListeners();
  }
}
