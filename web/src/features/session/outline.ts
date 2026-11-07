// A turn's work as an outline (Timeline.tsx): each note the agent writes between its steps (what it found, what it
// does next) opens a part, and the steps it then takes go in it. A finished part shows as one line, its note in a few
// words; the part under way shows its note in full and its current step. The words come from the note itself, so
// they show at once, cost nothing and work for every agent and every session, old ones too.
import type { AssistantItem, TimelineItem } from '@shared/types';

export interface Part {
  /** Its first item's id (a note, or the thought before it): it stays the same as the part grows. */
  id: string;
  /** What the agent wrote before its steps (notes in a row are one part); none for the steps before its first note. */
  notes: AssistantItem[];
  /** Its steps, thoughts and the rest, in order. */
  items: TimelineItem[];
}

/**
 * The parts of a turn's work. Thoughts go with what comes after them: a thought before a note is part of that
 * note's part (it is what led to it), so a part starts there.
 */
export function partsOf(work: TimelineItem[]): Part[] {
  const out: Part[] = [];
  let cur: Part | null = null;
  // Thoughts since the last step, waiting to see whether a note or a step comes next.
  let thoughts: TimelineItem[] = [];
  const take = (p: Part) => {
    p.items.push(...thoughts);
    thoughts = [];
  };
  for (const it of work) {
    if (it.kind === 'thinking') {
      thoughts.push(it);
      continue;
    }
    if (it.kind === 'assistant') {
      // Notes with no step between them are one part.
      if (cur && cur.notes.length && !cur.items.some((i) => i.kind === 'tool')) {
        take(cur);
        cur.notes.push(it);
        continue;
      }
      cur = { id: thoughts[0]?.id ?? it.id, notes: [it], items: [] };
      take(cur);
      out.push(cur);
      continue;
    }
    if (!cur) {
      cur = { id: thoughts[0]?.id ?? it.id, notes: [], items: [] };
      out.push(cur);
    }
    take(cur);
    cur.items.push(it);
  }
  if (thoughts.length) {
    if (!cur) out.push((cur = { id: thoughts[0].id, notes: [], items: [] }));
    take(cur);
  }
  return out;
}

/** A note's words with its Markdown taken away: code as its text, links as their words, code blocks left out. */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,:;!?]|$)/g, '$1$2')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sentences: after . ! ? and a space, or after the full stops of Chinese and Japanese. */
const sentences = (t: string) =>
  t
    .split(/(?<=[.!?])\s+(?=\S)|(?<=[。！？])/)
    .map((s) => s.trim())
    .filter(Boolean);

/** "… I'll check what renders", "Let me look at the logs", "so I'm going to …": what follows is what it does next. */
const INTENT = /(?:^|[,;:—–]\s*|\b(?:so|and|then|now|first|next)\s+)(?:i['’]ll|i will|i['’]m going to|i am going to|let me|let['’]s|i need to|i want to|we['’]ll|we need to|time to)\s+(.+)$/i;
/** "Running the whole suite to …", "Finding the route that …": a sentence that starts with what it is doing. */
const GERUND = /^(?:(?:now|next|then|first|so|ok(?:ay)?)[,:]?\s+)?([A-Za-z]+ing)\b/i;
const NOT_DOING = new Set([
  'nothing', 'something', 'everything', 'anything', 'during', 'morning', 'evening', 'string',
  'thing', 'king', 'ring', 'spring', 'sing', 'bring', 'swing', 'wing',
  'ping', 'ceiling', 'sibling', 'wedding', 'pending', 'missing', 'being', 'interesting',
  'existing', 'remaining', 'following', 'according', 'including', 'incoming', 'outgoing', 'ongoing',
  'upcoming',
]);
/** Words a note starts with that say nothing of it ("Now", "OK,", "First,", "Good:"). */
const LEAD = /^(?:(?:now|next|then|first(?:ly)?|second(?:ly)?|finally|also|so|and|but|ok(?:ay)?|alright|all right|good|great|perfect|nice|done|well)\b[,:!.]?\s+)+/i;
const TAIL = /[\s:;,.…—–\-。！？：；，、]+$/;

/** One clause of a sentence, without its lead-in, its end or a long tail, starting with a capital. */
function tidy(s: string): string {
  let t = s.replace(/\s+/g, ' ').trim().replace(TAIL, '');
  t = t.replace(LEAD, '');
  // "To see which apps ran, …": why, before what it does.
  t = t.replace(/^to [^,]{3,80},\s+/i, '');
  if (t.length > 60) {
    const cut = t.search(/,\s+(?:so|to|then|and then|which|because|since|but|while|where|as)\b|\s[—–]\s|;\s|\s\(/);
    if (cut >= 16) t = t.slice(0, cut);
  }
  t = t.replace(TAIL, '');
  if (t.length > 140) t = `${t.slice(0, 139).replace(/\s+\S*$/, '')}…`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * A note in a few words, for its part's line: the heading it starts with (**Like this**), else what it says it does
 * next ("I'll count runs per app…" → "Count runs per app…"), else, for a note ending in a colon (it introduces its
 * step), its last sentence, and its first otherwise.
 */
export function noteTitle(md: string): string {
  const own = md.trim().match(/^\*\*([^*\n]{2,80})\*\*/);
  if (own) return tidy(own[1]);
  const text = plainText(md);
  if (!text) return '';
  const ss = sentences(text);
  for (let i = ss.length - 1; i >= 0; i--) {
    const m = INTENT.exec(ss[i]);
    if (m && m[1].trim().length > 2) return tidy(m[1]);
    const g = GERUND.exec(ss[i]);
    if (g && !NOT_DOING.has(g[1].toLowerCase())) return tidy(ss[i]);
  }
  return tidy(/[:：]\s*$/.test(text) ? ss[ss.length - 1] : ss[0]);
}

/**
 * Whether what the agent is writing after its last step, while it works, reads as a note on what it does next (it
 * shows in the outline) rather than its reply: short and in one piece, with no paragraphs, lists, headings, tables,
 * code or pictures of its own. A reply starts out like a note too; it moves to its place as soon as it reads as one.
 */
export function noteLike(md: string): boolean {
  const t = md.trim();
  if (!t || t.length > 320) return false;
  if (/\n\s*\n/.test(t)) return false;
  if (/^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\|)/m.test(t)) return false;
  if (/```|\$\$|<\/?[a-z][^>]*>|!\[/i.test(t)) return false;
  return true;
}
