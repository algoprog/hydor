// Read-only links to a session for people without the password. A link names one session, can expire,
// and can be turned off; only its hash is kept. Guests see the conversation, the steps by name, file
// changes and pages the agent showed; not command output, tool input or the agent's thinking.
import crypto from 'node:crypto';
import { isConfidential } from '../shared/confidential.ts';
import type { TimelineItem } from '../shared/types.ts';
import { HttpError } from './auth.ts';
import { kvGet, kvSet, type DB } from './db.ts';
import { sessionExtra } from './sessionExtra.ts';

interface GuestLink {
  id: string;
  hash: string;
  key: string;
  createdAt: number;
  expiresAt?: number;
  views: number;
  lastSeen?: number;
}

export interface GuestLinkView {
  id: string;
  createdAt: number;
  expiresAt?: number;
  views: number;
  lastSeen?: number;
}

const hashOf = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

function all(db: DB): GuestLink[] {
  try {
    return JSON.parse(kvGet(db, 'guest_links') ?? '[]');
  } catch {
    return [];
  }
}

function save(db: DB, list: GuestLink[]) {
  // Expired links go after a week, so the list does not grow for ever.
  const keep = list.filter((l) => !l.expiresAt || l.expiresAt > Date.now() - 7 * 86_400_000);
  kvSet(db, 'guest_links', JSON.stringify(keep));
}

export function createGuestLink(db: DB, key: string, days: number | null): { id: string; token: string } {
  // A confidential session stays on this computer: no link opens it from elsewhere.
  if (isConfidential(sessionExtra(db, key))) throw new HttpError(409, 'A confidential session can’t be shared: what was said in it stays on this computer.');
  const token = crypto.randomBytes(18).toString('base64url');
  const l: GuestLink = { id: crypto.randomBytes(4).toString('hex'), hash: hashOf(token), key, createdAt: Date.now(), views: 0, expiresAt: days ? Date.now() + days * 86_400_000 : undefined };
  save(db, [...all(db), l]);
  return { id: l.id, token };
}

export function guestLinks(db: DB, key: string): GuestLinkView[] {
  return all(db)
    .filter((l) => l.key === key && (!l.expiresAt || l.expiresAt > Date.now()))
    .map(({ id, createdAt, expiresAt, views, lastSeen }) => ({ id, createdAt, expiresAt, views, lastSeen }));
}

export function revokeGuestLink(db: DB, id: string) {
  save(
    db,
    all(db).filter((l) => l.id !== id),
  );
}

/** The session a live link opens, counting the visit (at most once a minute per link). */
export function openGuestLink(db: DB, token: string, visit: boolean): string | null {
  const h = hashOf(token);
  const list = all(db);
  const l = list.find((x) => crypto.timingSafeEqual(Buffer.from(x.hash), Buffer.from(h)));
  if (!l || (l.expiresAt && l.expiresAt < Date.now())) return null;
  if (visit && (!l.lastSeen || Date.now() - l.lastSeen > 60_000)) {
    l.views++;
    l.lastSeen = Date.now();
    save(db, list);
  }
  return l.key;
}

/** What a guest may see of a timeline item. */
export function guestItem(it: TimelineItem): TimelineItem | null {
  switch (it.kind) {
    case 'thinking':
      return null;
    case 'user':
      // Images come from a signed-in route; guests see that there were some.
      return { ...it, imageAt: undefined, handoff: it.handoff && { ...it.handoff, context: '' } };
    case 'tool': {
      const t = it.tool;
      const page = t.name.endsWith('__show_html');
      return {
        ...it,
        tool: {
          name: t.name,
          category: t.category,
          title: t.category === 'command' ? t.label || 'Ran a command' : t.title,
          label: t.label,
          status: t.status,
          files: t.files,
          durationMs: t.durationMs,
          todos: t.todos,
          questions: t.questions,
          answers: t.answers,
          input: page ? t.input : undefined,
        },
      };
    }
    default:
      return it;
  }
}
