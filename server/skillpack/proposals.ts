// Skills agents propose (skill_save) and improvements they propose to one (skill_patch), the user's
// answer to each, and the library's skills removed and brought back (history.ts keeps every change).
// Nothing is saved without the user's approval; the agent hears the answer as a message. In a space, a
// proposal can be kept for the space alone (spaceSkills.ts), and a change to a skill of the space's own
// stays the space's.
import crypto from 'node:crypto';
import { SKILL_NAME, type LibrarySkill, type ScanFinding, type SkillProposal } from '../../shared/skillpack.ts';
import type { Space } from '../../shared/spaces.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { spaceById, spaceOfSession } from '../spaces/index.ts';
import { lineDiff } from './diff.ts';
import { historyTables, lastRemoved, record, usage } from './history.ts';
import { checkText, composeSkill, librarySkills, MAX_SKILL, parseSkill, removeLearned, skillText, slug, writeLearned } from './library.ts';
import { scanSkill, secretsMessage } from './scan.ts';
import { spaceSkillText, writeSpaceSkill } from './spaceSkills.ts';

export { history, noteUse } from './history.ts';
export { MAX_SKILL, slug };
const MAX_PENDING = 5;

const made = new WeakSet<DB>();
function tables(db: DB) {
  if (made.has(db)) return;
  db.exec(`
    create table if not exists skillpack_proposals (
      id text primary key, key text not null, kind text not null, name text not null, status text not null,
      created_at integer not null, decided_at integer, data text not null
    );
    create index if not exists skillpack_proposals_status on skillpack_proposals(status, created_at);`);
  historyTables(db);
  made.add(db);
}

interface Row {
  id: string;
  key: string;
  kind: 'new' | 'patch';
  name: string;
  status: SkillProposal['status'];
  created_at: number;
  decided_at: number | null;
  data: string;
}

interface Data {
  reason?: string;
  before?: string;
  after: string;
  findings: ScanFinding[];
  bundled?: boolean;
  /** The session's space, where it can be kept alone, or the space whose own skill it changes. */
  space?: string;
  /** Where it is kept: as proposed, then as saved. */
  scope?: 'library' | 'space';
  spaceSkill?: boolean;
  saved?: string;
  note?: string;
}

function toProposal(db: DB, r: Row): SkillProposal {
  const d = JSON.parse(r.data) as Data;
  const shown = lineDiff(d.before ?? '', d.saved ?? d.after);
  // A space deleted since: its skills joined the library.
  const sp = d.space ? spaceById(db, d.space) : null;
  return {
    id: r.id,
    key: r.key,
    kind: r.kind,
    name: r.name,
    status: r.status,
    reason: d.reason,
    before: d.before,
    after: d.after,
    ...shown,
    findings: d.findings,
    bundled: d.bundled,
    ...(sp ? { space: { id: sp.id, name: sp.name } } : {}),
    scope: sp && d.scope === 'space' ? 'space' : 'library',
    ...(sp && d.spaceSkill ? { spaceSkill: true } : {}),
    createdAt: r.created_at,
    decidedAt: r.decided_at ?? undefined,
    saved: d.saved,
    note: d.note,
  };
}

function row(db: DB, id: string): Row {
  tables(db);
  const r = db.prepare('select * from skillpack_proposals where id = ?').get(id) as Row | undefined;
  if (!r) throw new HttpError(404, 'No such proposal');
  return r;
}

export const getProposal = (db: DB, id: string): SkillProposal => toProposal(db, row(db, id));

export function pendingProposals(db: DB): SkillProposal[] {
  tables(db);
  return (db.prepare(`select * from skillpack_proposals where status = 'pending' order by created_at desc limit 50`).all() as Row[]).map((r) => toProposal(db, r));
}

// ---- proposing -----------------------------------------------------------------------------------

/** What an agent sends: a new skill, or a change to one. */
export interface ProposalInput {
  key: string;
  kind: 'new' | 'patch';
  name: string;
  description?: string;
  body?: string;
  triggers?: unknown;
  reason?: string;
  /** skill_patch: exact pieces of the current text, each replaced. */
  edits?: unknown;
  /** In a space: true to keep it for the space alone (the user can change it on the card). */
  space?: unknown;
}

function triggerList(v: unknown): string[] | undefined {
  if (v == null || v === '') return undefined;
  const items = (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const bad = items.find((t) => t.length < 3 || t.length > 40);
  if (bad) throw new Error(`Each trigger is a word or short phrase of 3 to 40 characters ("${bad.slice(0, 50)}" is not).`);
  if (items.length > 12) throw new Error('Give at most 12 triggers: the words or phrases someone asking for this would use.');
  return [...new Set(items)];
}

function editList(v: unknown): { find: string; replace: string }[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new Error('edits is a list of {find, replace} pairs.');
  return v.map((e, i) => {
    const find = typeof e?.find === 'string' ? e.find : typeof e?.old === 'string' ? e.old : '';
    const replace = typeof e?.replace === 'string' ? e.replace : typeof e?.new === 'string' ? e.new : null;
    if (!find || replace === null) throw new Error(`Edit ${i + 1} needs find (exact text from the skill) and replace.`);
    return { find, replace };
  });
}

/** Findings on lines the proposal adds (what was there before was already accepted). */
function newFindings(before: string | undefined, after: string): ScanFinding[] {
  const old = new Set((before ?? '').split('\n'));
  const lines = after.split('\n');
  return scanSkill(after).filter((f) => !old.has(lines[f.line - 1] ?? ''));
}

/**
 * Checks and keeps a proposal; throws, in words for the agent, when it cannot be one. An older
 * proposal from the same session for the same skill is replaced (its id is in `replaced`).
 */
export function propose(db: DB, p: ProposalInput): { proposal: SkillProposal; replaced: string[] } {
  tables(db);
  const name = slug(p.name ?? '');
  if (!SKILL_NAME.test(name) || name.length < 2) throw new Error('Give the skill a short name: lowercase words with dashes, like "release-notes".');
  const triggers = triggerList(p.triggers);
  let before: string | undefined;
  let after: string;
  let bundled: boolean | undefined;
  // In a space: its own skills, and those of the spaces it brings together, come before the library's.
  const where = spaceOfSession(db, sessionExtra(db, p.key));
  const owner: Space | undefined = where ? [where.space, ...where.members].find((sp) => spaceSkillText(sp.id, name)) : undefined;
  let space = where?.space.id;
  let scope: Data['scope'] = where && (p.space === true || p.space === 'true') ? 'space' : 'library';
  if (p.kind === 'new') {
    if (owner) throw new Error(`The space ${owner.name} has a skill named ${name} already. To improve it, use skill_patch; for something else, pick another name.`);
    if (skillText(name))
      throw new Error(`There is a skill named ${name} already. To improve it, use skill_patch${where ? ' (the user can keep the change for this space alone)' : ''}; for something else, pick another name.`);
    let body = String(p.body ?? '');
    let description = String(p.description ?? '').trim();
    let listed: string[] | undefined;
    // A whole SKILL.md given as the body: its own frontmatter fills in what is missing.
    if (/^---\r?\n/.test(body)) {
      const fm = parseSkill(body);
      description ||= fm.description ?? '';
      listed = fm.triggers.length ? fm.triggers : undefined;
      body = fm.body;
    }
    if (!description) throw new Error('Give a description: one sentence that says when to use the skill ("Use when …"), not what it does step by step.');
    after = composeSkill({ name, description, triggers: triggers ?? listed, body });
  } else {
    const cur = owner ? { ...spaceSkillText(owner.id, name)!, source: 'space' as const } : skillText(name);
    if (!cur)
      throw new Error(
        `There is no skill named ${name} in the app's skill library (its built-in skills and the ones the user approved)${where ? ' nor in this space' : ''}. Skills in the user's own folders (~/.claude/skills, a project's .claude/skills) are not changed from here: propose a new skill with skill_save instead, or tell the user what to change.`,
      );
    before = cur.text;
    bundled = cur.source === 'bundled' || undefined;
    // A skill of a space's own stays that space's.
    if (owner) [space, scope] = [owner.id, 'space'];
    const edits = editList(p.edits);
    const fm = parseSkill(before);
    if (p.body != null && String(p.body).trim()) {
      after = composeSkill({ name, description: String(p.description ?? '').trim() || fm.description || '', triggers: triggers ?? fm.triggers, body: String(p.body) });
    } else {
      after = before;
      for (const [i, e] of edits.entries()) {
        const n = after.split(e.find).length - 1;
        if (n === 0) throw new Error(`Edit ${i + 1}: its find text is not in the skill. Copy it exactly from the skill's current text (load the skill again to see it).`);
        if (n > 1) throw new Error(`Edit ${i + 1}: its find text appears ${n} times. Include more of the text around it so it appears once.`);
        after = after.replace(e.find, () => e.replace);
      }
      if (p.description != null || triggers) {
        const now = parseSkill(after);
        after = composeSkill({ name, description: String(p.description ?? '').trim() || now.description || '', triggers: triggers ?? now.triggers, body: now.body });
      }
      if (!edits.length && p.description == null && !triggers) throw new Error('Say what to change: edits (find and replace), a new body, a description or triggers.');
    }
    if (after === before) throw new Error('That changes nothing in the skill.');
  }
  checkText(name, after);
  const findings = newFindings(before, after);
  const stop = secretsMessage(findings);
  if (stop) throw new Error(stop);
  const open = db.prepare(`select count(*) as n from skillpack_proposals where key = ? and status = 'pending' and name != ?`).get(p.key, name) as { n: number };
  if (open.n >= MAX_PENDING) throw new Error('Five skill proposals from this conversation are waiting for the user already: wait for their answers first.');
  const now = Date.now();
  const replaced = db.prepare(`select id from skillpack_proposals where key = ? and name = ? and status = 'pending'`).all(p.key, name) as { id: string }[];
  db.prepare(`update skillpack_proposals set status = 'replaced', decided_at = ? where key = ? and name = ? and status = 'pending'`).run(now, p.key, name);
  const id = crypto.randomBytes(6).toString('hex');
  const data: Data = { reason: p.reason?.trim().slice(0, 1000) || undefined, before, after, findings, bundled, space, scope, spaceSkill: owner ? true : undefined };
  db.prepare('insert into skillpack_proposals (id, key, kind, name, status, created_at, data) values (?, ?, ?, ?, ?, ?, ?)').run(id, p.key, p.kind, name, 'pending', now, JSON.stringify(data));
  // Answered ones are kept for half a year, for the cards in older conversations.
  db.prepare(`delete from skillpack_proposals where status != 'pending' and decided_at < ?`).run(now - 180 * 86_400_000);
  return { proposal: getProposal(db, id), replaced: replaced.map((r) => r.id) };
}

// ---- the user's answer ---------------------------------------------------------------------------

/** Tells the pages showing the proposal's session, and every Settings page, that it changed. */
export function announce(d: Deps, p: SkillProposal) {
  d.toSubscribers(p.key, { t: 'feature', id: 'skillpack', key: p.key, data: { proposal: p } });
  d.broadcast({ t: 'feature', id: 'skillpack', data: { library: true } });
}

/**
 * The user's answer: approved (with the text they may have edited) and saved into the library, or into
 * the space (`scope`, when the proposal can go there), or dismissed. The agent hears it as a message, now
 * if it is free, after its turn if not.
 */
export async function decide(d: Deps, id: string, yes: boolean, o: { text?: string; note?: string; scope?: unknown } = {}): Promise<SkillProposal> {
  const r = row(d.db, id);
  const p = toProposal(d.db, r);
  if (p.status !== 'pending') throw new HttpError(409, p.status === 'replaced' ? 'A newer proposal took the place of this one' : 'This was answered already');
  const now = Date.now();
  const data = JSON.parse(r.data) as Data;
  // A skill of the space's own stays there; anything else goes where the user picked, the library unless the session is in a space.
  const scope: 'library' | 'space' = p.spaceSkill ? 'space' : p.space && (o.scope === 'space' || o.scope === 'library' ? o.scope : p.scope) === 'space' ? 'space' : 'library';
  let edited = false;
  if (yes) {
    const text = o.text != null ? String(o.text).replace(/\r\n/g, '\n') : p.after;
    edited = text !== p.after;
    try {
      checkText(p.name, text);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const stop = secretsMessage(newFindings(p.before, text));
    if (stop) throw new HttpError(400, stop);
    if (scope === 'space') {
      const sp = p.space!;
      const mine = spaceSkillText(sp.id, p.name);
      if (p.kind === 'new' && mine) throw new HttpError(409, `${sp.name} has a skill named ${p.name} since. Dismiss this one, or ask the agent to change that skill instead.`);
      if (p.kind === 'patch' && (p.spaceSkill ? mine?.text !== p.before : !!mine || skillText(p.name)?.text !== p.before))
        throw new HttpError(409, `${p.name} changed since this was proposed. Dismiss this one and ask the agent again.`);
      writeSpaceSkill(d.db, sp.id, p.name, text, { key: p.key, proposal: p.id });
    } else {
      const cur = skillText(p.name);
      if (p.kind === 'new' && cur) throw new HttpError(409, `A skill named ${p.name} was saved since. Dismiss this one, or ask the agent to change that skill instead.`);
      if (p.kind === 'patch' && cur?.text !== p.before) throw new HttpError(409, `${p.name} changed since this was proposed. Dismiss this one and ask the agent again.`);
      writeLearned(p.name, text);
      record(d.db, { name: p.name, action: p.kind === 'new' ? 'create' : 'update', key: p.key, proposal: p.id, before: p.before ?? null, after: text });
    }
    data.scope = scope;
    if (edited) data.saved = text;
  } else if (o.note?.trim()) data.note = o.note.trim().slice(0, 1000);
  d.db.prepare('update skillpack_proposals set status = ?, decided_at = ?, data = ? where id = ?').run(yes ? 'approved' : 'dismissed', now, JSON.stringify(data), id);
  const out = getProposal(d.db, id);
  announce(d, out);
  // A space's page counts its skills.
  if (yes && scope === 'space') d.broadcast({ t: 'feature', id: 'spaces', data: { changed: true } });
  const inSpace = scope === 'space' && p.space ? p.space.name : null;
  const what =
    p.kind === 'new'
      ? `the skill “${p.name}”`
      : `your change to the skill “${p.name}”${p.spaceSkill ? ` of the space “${inSpace}”` : inSpace ? ' (saved as the space’s own version; the library’s stays as it was for other sessions)' : p.bundled ? ' (a built-in one: saved as the user’s own version)' : ''}`;
  const where = inSpace ? `one of the skills of the space “${inSpace}” now, for its sessions alone` : 'in the app’s skill library now';
  const text = yes
    ? `The user approved ${what}${edited ? ', after editing it' : ''}. It is ${where}: Custom has it from its next turn, and Claude Code and Codex from their next sessions. Just acknowledge this briefly.`
    : `The user dismissed ${what}; nothing was saved.${data.note ? ` Their note: ${data.note}` : ''} Do not propose it again unless they ask. Just acknowledge this briefly.`;
  await d.sessions.deliverOrQueue(p.key, text).catch(() => {});
  return out;
}

// ---- the library's removed skills and use ---------------------------------------------------------

/** Learned skills the user removed (and has not brought back), newest first. */
export function removedSkills(db: DB): { name: string; at: number }[] {
  tables(db);
  const here = new Set(librarySkills().filter((s) => s.source === 'learned').map((s) => s.dir));
  return lastRemoved(db)
    .filter((r) => !here.has(r.name))
    .map((r) => ({ name: r.name, at: r.at }));
}

/** Removes a learned skill (the built-in one of its name, if any, comes back); its text stays in the history. */
export function removeSkill(db: DB, name: string) {
  tables(db);
  const cur = skillText(name);
  if (!cur || cur.source !== 'learned') throw new HttpError(404, `${name} is not a learned skill`);
  removeLearned(name);
  record(db, { name, action: 'remove', before: cur.text, after: skillText(name)?.text ?? null });
}

/** Brings back a removed learned skill as it was. */
export function restoreSkill(db: DB, name: string) {
  tables(db);
  const r = db.prepare(`select before from skillpack_history where name = ? and action = 'remove' and space is null order by at desc, id desc limit 1`).get(name) as { before: string | null } | undefined;
  if (!r?.before) throw new HttpError(404, `Nothing to bring back for ${name}`);
  const cur = skillText(name);
  if (cur?.source === 'learned') throw new HttpError(409, `${name} is in the library already`);
  writeLearned(name, r.before);
  record(db, { name, action: 'restore', before: cur?.text ?? null, after: r.before });
}

/** The library as Settings shows it: each skill with its use. */
export function libraryView(db: DB): LibrarySkill[] {
  const used = usage(db);
  return librarySkills().map((s) => ({
    name: s.name,
    description: s.description,
    triggers: s.triggers,
    source: s.source,
    overrides: s.overrides,
    path: s.file,
    updatedAt: s.source === 'learned' ? Math.round(s.mtime) : undefined,
    uses: used.get(s.dir)?.uses ?? 0,
    lastUsed: used.get(s.dir)?.last,
  }));
}
