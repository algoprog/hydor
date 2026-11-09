// Exports from ChatGPT and Claude, for Settings → Memory → Bring in: the .zip each sends by email (or the
// conversations.json in it). Claude's has the memory it kept (memories.json) and the chats; ChatGPT's has the chats,
// whose hidden first message holds the user's custom instructions. Of the chats, only what the user wrote is read
// (not the files they attached, not the replies), the newest first. An export can be a gigabyte, so the zip is read
// from disk, its index first, and conversations.json is inflated and split a chat at a time as it is read.
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import zlib from 'node:zlib';
import type { Material } from './sources.ts';

export type ExportKind = 'chatgpt' | 'claude';

// ---- a zip on disk -------------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  csize: number;
  usize: number;
  offset: number;
}

function readAt(fd: number, pos: number, len: number): Buffer {
  const b = Buffer.alloc(len);
  const n = fs.readSync(fd, b, 0, len, pos);
  return b.subarray(0, n);
}

/** A zip file's entries, from its central directory (zip64 too); null when it is not a zip. */
export function zipEntries(file: string): ZipEntry[] | null {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 22 + 65535 + 20);
    const tail = readAt(fd, size - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--)
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    if (eocd < 0) return null;
    let count = tail.readUInt16LE(eocd + 10);
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    if ((cdOffset === 0xffffffff || count === 0xffff || cdSize === 0xffffffff) && eocd >= 20 && tail.readUInt32LE(eocd - 20) === 0x07064b50) {
      const at = Number(tail.readBigUInt64LE(eocd - 12));
      const z = readAt(fd, at, 56);
      if (z.length === 56 && z.readUInt32LE(0) === 0x06064b50) {
        count = Number(z.readBigUInt64LE(32));
        cdSize = Number(z.readBigUInt64LE(40));
        cdOffset = Number(z.readBigUInt64LE(48));
      }
    }
    if (cdSize > 256 * 1024 * 1024) return null;
    const cd = readAt(fd, cdOffset, cdSize);
    const out: ZipEntry[] = [];
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const flags = cd.readUInt16LE(p + 8);
      const method = cd.readUInt16LE(p + 10);
      let csize = cd.readUInt32LE(p + 20);
      let usize = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      let offset = cd.readUInt32LE(p + 42);
      const name = cd.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
      for (let x = p + 46 + nameLen, end = x + extraLen; x + 4 <= end;) {
        const id = cd.readUInt16LE(x);
        const len = cd.readUInt16LE(x + 2);
        if (id === 0x0001) {
          let q = x + 4;
          if (usize === 0xffffffff) ((usize = Number(cd.readBigUInt64LE(q))), (q += 8));
          if (csize === 0xffffffff) ((csize = Number(cd.readBigUInt64LE(q))), (q += 8));
          if (offset === 0xffffffff) offset = Number(cd.readBigUInt64LE(q));
        }
        x += 4 + len;
      }
      if (!name.endsWith('/')) out.push({ name, method, flags, csize, usize, offset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

/** An entry's bytes as they are inflated; null when it is encrypted or packed some other way. */
function entryStream(file: string, e: ZipEntry): Readable | null {
  if (e.flags & 1 || (e.method !== 0 && e.method !== 8)) return null;
  const fd = fs.openSync(file, 'r');
  let head: Buffer;
  try {
    head = readAt(fd, e.offset, 30);
  } finally {
    fs.closeSync(fd);
  }
  if (head.length < 30 || head.readUInt32LE(0) !== 0x04034b50) return null;
  const start = e.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  if (!e.csize) return Readable.from([]);
  const raw = fs.createReadStream(file, { start, end: start + e.csize - 1, highWaterMark: 1024 * 1024 });
  return e.method === 0 ? raw : raw.pipe(zlib.createInflateRaw());
}

/** A small entry's text. */
async function entryText(file: string, e: ZipEntry, max = 64 * 1024 * 1024): Promise<string | null> {
  if (e.usize > max) return null;
  const s = entryStream(file, e);
  if (!s) return null;
  const parts: Buffer[] = [];
  for await (const c of s) parts.push(c as Buffer);
  return Buffer.concat(parts).toString('utf8').replace(/^﻿/, '');
}

// ---- a JSON array, an item at a time ---------------------------------------------------------------

/** The objects of a JSON array (or the one object a file is), each parsed as soon as it is whole. */
export async function* jsonItems(chunks: AsyncIterable<Buffer | string>): AsyncGenerator<unknown> {
  const dec = new StringDecoder('utf8');
  let depth = 0;
  let inStr = false;
  let esc = false;
  let top: 'array' | 'object' | null = null;
  let parts: string[] = [];
  let taking = false;
  for await (const chunk of chunks) {
    const s = typeof chunk === 'string' ? chunk : dec.write(chunk);
    let from = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (c === 92) esc = true;
        else if (c === 34) inStr = false;
        continue;
      }
      if (c === 34) inStr = true;
      else if (c === 123 || c === 91) {
        if (depth === 0) {
          top = c === 91 ? 'array' : 'object';
          if (top === 'object') ((taking = true), (from = i), (parts = []));
        } else if (depth === 1 && top === 'array' && c === 123) ((taking = true), (from = i), (parts = []));
        depth++;
      } else if (c === 125 || c === 93) {
        depth--;
        if (taking && depth === (top === 'array' ? 1 : 0)) {
          parts.push(s.slice(from, i + 1));
          taking = false;
          const text = parts.join('');
          parts = [];
          try {
            yield JSON.parse(text);
          } catch {}
        }
      }
    }
    if (taking) parts.push(s.slice(from));
  }
}

// ---- what an export holds ----------------------------------------------------------------------------

/** One chat, as read: its title, when, and the user's own words in it. */
interface Chat {
  title: string;
  at: number;
  said: string[];
}

export interface ExportView {
  kind: ExportKind;
  chats: number;
  /** Claude's memory, or ChatGPT's custom instructions, are in it. */
  memory: boolean;
  /** The first and the last chat's dates. */
  from?: number;
  to?: number;
}

const SAID_CHARS = 1200;
const CHAT_CHARS = 3000;
/** Most of the user's words read from the chats, newest first: enough to know them, at a bounded cost. */
export const CHATS_CHARS = 300_000;

const stamp = (v: unknown): number => {
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** A chat with only as much of the user's words as is read of it (a large export stays small while it is read). */
function clip(c: Chat): Chat {
  const said: string[] = [];
  let len = 0;
  for (const s of c.said) {
    if (len >= CHAT_CHARS) break;
    const one = s.slice(0, SAID_CHARS * 2);
    said.push(one);
    len += Math.min(one.length, SAID_CHARS);
  }
  return { ...c, said };
}

/** A ChatGPT chat: its messages on the branch the user last saw, from the first. */
function chatgptChat(c: Record<string, any>): { chat: Chat; instructions?: string } | null {
  const mapping = c?.mapping;
  if (!mapping || typeof mapping !== 'object') return null;
  const branch: Record<string, any>[] = [];
  const seen = new Set<string>();
  for (let id = c.current_node as string | undefined; id && mapping[id] && !seen.has(id); id = mapping[id].parent) {
    seen.add(id);
    if (mapping[id].message) branch.unshift(mapping[id].message);
  }
  const said: string[] = [];
  let instructions: string | undefined;
  for (const m of branch) {
    const content = m.content ?? {};
    if (content.content_type === 'user_editable_context') {
      const parts = [content.user_profile, content.user_instructions].filter((x) => typeof x === 'string' && x.trim());
      if (parts.length) instructions = parts.join('\n\n');
      continue;
    }
    if (m.author?.role !== 'user' || m.metadata?.is_visually_hidden_from_conversation) continue;
    if (content.content_type !== 'text' && content.content_type !== 'multimodal_text') continue;
    const text = (Array.isArray(content.parts) ? content.parts : [])
      .filter((p: unknown): p is string => typeof p === 'string')
      .join('\n')
      .trim();
    if (text) said.push(text);
  }
  return { chat: { title: String(c.title ?? '').trim() || 'Untitled', at: stamp(c.update_time ?? c.create_time), said }, instructions };
}

/** A Claude chat: what the user wrote in it. */
function claudeChat(c: Record<string, any>): Chat | null {
  if (!Array.isArray(c?.chat_messages)) return null;
  const said: string[] = [];
  for (const m of c.chat_messages) {
    if (m?.sender !== 'human') continue;
    const blocks = Array.isArray(m.content) ? m.content.filter((b: any) => b?.type === 'text' && typeof b.text === 'string').map((b: any) => b.text) : [];
    const text = (blocks.length ? blocks.join('\n') : String(m.text ?? '')).trim();
    if (text) said.push(text);
  }
  return { title: String(c.name ?? '').trim() || 'Untitled', at: stamp(c.updated_at ?? c.created_at), said };
}

/** The export's files: the zip's entries by their base name, or the one JSON file it is. */
async function* chatFiles(file: string, entries: ZipEntry[] | null): AsyncGenerator<Readable> {
  if (!entries) {
    yield fs.createReadStream(file, { highWaterMark: 1024 * 1024 });
    return;
  }
  // conversations.json, or its parts in a large export (conversations-000.json …).
  for (const e of entries.filter((x) => /(^|\/)conversations(-\d+)?\.json$/i.test(x.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    const s = entryStream(file, e);
    if (s) yield s;
  }
}

/** Which export a file is: by the zip's files, or by the first words of the JSON. */
export async function exportKind(file: string): Promise<{ kind: ExportKind | 'claude-memory'; entries: ZipEntry[] | null } | null> {
  let entries: ZipEntry[] | null = null;
  try {
    entries = zipEntries(file);
  } catch {}
  if (entries) {
    const names = new Set(entries.map((e) => e.name.replace(/^.*\//, '').toLowerCase()));
    if (names.has('memories.json') || names.has('projects.json') || names.has('users.json')) return { kind: 'claude', entries };
    if (names.has('chat.html') || names.has('message_feedback.json') || names.has('user.json') || names.has('model_comparisons.json')) return { kind: 'chatgpt', entries };
    const conv = entries.find((e) => /(^|\/)conversations(-\d+)?\.json$/i.test(e.name));
    if (!conv) return null;
    const head = await peek(entryStream(file, conv));
    return head.includes('"mapping"') ? { kind: 'chatgpt', entries } : head.includes('"chat_messages"') ? { kind: 'claude', entries } : null;
  }
  const head = await peek(fs.createReadStream(file, { end: 256 * 1024 }));
  if (head.includes('"mapping"')) return { kind: 'chatgpt', entries: null };
  if (head.includes('"chat_messages"')) return { kind: 'claude', entries: null };
  if (head.includes('"conversations_memory"')) return { kind: 'claude-memory', entries: null };
  return null;
}

async function peek(s: Readable | null, max = 256 * 1024): Promise<string> {
  if (!s) return '';
  let out = '';
  for await (const c of s) {
    out += (c as Buffer).toString('utf8');
    if (out.length >= max) break;
  }
  s.destroy();
  return out;
}

/** Claude's memories.json: the memory across chats, and each project's (named by projects.json). */
function claudeMemories(data: unknown, projects: Map<string, string>): Material[] {
  const d = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!d || typeof d !== 'object') return [];
  const out: Material[] = [];
  const all = d.conversations_memory;
  if (typeof all === 'string' && all.trim()) out.push({ source: 'Claude', kind: 'memory', name: 'Claude’s memory across chats', text: all.trim().slice(0, 24_000) });
  const per = d.project_memories;
  const each: [string, unknown][] = Array.isArray(per)
    ? per.map((p: any) => [String(p?.project_uuid ?? p?.uuid ?? ''), p?.memory ?? p?.text])
    : per && typeof per === 'object'
      ? Object.entries(per)
      : [];
  for (const [uuid, text] of each) {
    if (typeof text !== 'string' || !text.trim()) continue;
    const name = projects.get(uuid) ?? 'a project';
    out.push({ source: 'Claude', kind: 'memory', project: name, name: `Claude’s memory of the project “${name}”`, text: text.trim().slice(0, 12_000) });
  }
  return out;
}

/**
 * Reads an export: its memory (Claude's memory, ChatGPT's custom instructions) and the user's words in its chats, the
 * newest first, up to CHATS_CHARS. `view` only counts.
 */
export async function readExport(file: string, o: { signal?: AbortSignal } = {}): Promise<{ view: ExportView; material: Material[] }> {
  const found = await exportKind(file);
  if (!found) throw new Error('This is not an export from ChatGPT or Claude: give the .zip they send, or the conversations.json in it');
  const { entries } = found;
  const kind: ExportKind = found.kind === 'chatgpt' ? 'chatgpt' : 'claude';
  const source = kind === 'chatgpt' ? 'ChatGPT' : 'Claude';
  const material: Material[] = [];
  if (found.kind === 'claude-memory') {
    const text = fs.readFileSync(file, 'utf8');
    material.push(...claudeMemories(JSON.parse(text), new Map()));
    return { view: { kind, chats: 0, memory: material.length > 0 }, material };
  }
  if (kind === 'claude' && entries) {
    const projects = new Map<string, string>();
    const pj = entries.find((e) => /(^|\/)projects\.json$/i.test(e.name));
    const pt = pj ? await entryText(file, pj) : null;
    try {
      for (const p of pt ? (JSON.parse(pt) as { uuid?: string; name?: string }[]) : []) if (p?.uuid && p.name) projects.set(p.uuid, p.name);
    } catch {}
    const mj = entries.find((e) => /(^|\/)memories\.json$/i.test(e.name));
    const mt = mj ? await entryText(file, mj) : null;
    try {
      if (mt) material.push(...claudeMemories(JSON.parse(mt), projects));
    } catch {}
  }
  const chats: Chat[] = [];
  let instructions: { text: string; at: number } | undefined;
  for await (const stream of chatFiles(file, entries)) {
    for await (const item of jsonItems(stream)) {
      if (o.signal?.aborted) {
        stream.destroy();
        throw new Error('Stopped');
      }
      if (kind === 'chatgpt') {
        const r = chatgptChat(item as Record<string, any>);
        if (!r) continue;
        if (r.instructions && (!instructions || r.chat.at > instructions.at)) instructions = { text: r.instructions, at: r.chat.at };
        if (r.chat.said.length) chats.push(clip(r.chat));
      } else {
        const c = claudeChat(item as Record<string, any>);
        if (c?.said.length) chats.push(clip(c));
      }
    }
  }
  if (instructions)
    material.push({ source, kind: 'profile', name: 'Custom instructions (what you told ChatGPT about you, and how to answer)', text: instructions.text.slice(0, 12_000), at: instructions.at });
  chats.sort((a, b) => b.at - a.at);
  const day = (t: number) => (t ? new Date(t).toISOString().slice(0, 10) : 'undated');
  let used = 0;
  for (const c of chats) {
    if (used >= CHATS_CHARS) break;
    const lines: string[] = [];
    let len = 0;
    for (const s of c.said) {
      const one = s.replace(/\s+/g, ' ').slice(0, SAID_CHARS);
      if (len + one.length > CHAT_CHARS) break;
      lines.push(`- ${one}`);
      len += one.length;
    }
    if (!lines.length) continue;
    const text = lines.join('\n');
    used += text.length;
    material.push({ source, kind: 'chats', name: `“${c.title.slice(0, 120)}” (${day(c.at)})`, text, at: c.at });
  }
  const dated = chats.map((c) => c.at).filter(Boolean);
  return {
    view: {
      kind,
      chats: chats.length,
      memory: material.some((m) => m.kind !== 'chats'),
      from: dated.length ? dated.reduce((a, b) => Math.min(a, b)) : undefined,
      to: dated.length ? dated.reduce((a, b) => Math.max(a, b)) : undefined,
    },
    material,
  };
}
