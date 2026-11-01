// Finding sections of the guide by their words, as you type: the topic and section titles count most. Also the
// typed text as it is, for writing without spaces (Chinese).
import { matchItem, queryWords } from '@shared/find';
import { plainText, type GuideTopic } from '@shared/guide';

export interface Found {
  topic: GuideTopic;
  id: string;
  title: string;
  snippet: string;
  score: number;
}

/** Sections that hold the words, best first. */
export function searchGuide(topics: GuideTopic[], q: string, limit = 30): Found[] {
  const words = queryWords(q);
  const whole = q.trim().toLowerCase();
  if (!words.length && !whole) return [];
  const out: Found[] = [];
  for (const t of topics)
    for (const s of t.sections) {
      if (s.id === ASK_SECTION) continue;
      const text = plainText(s.text);
      let { score } = words.length ? matchItem({ title: s.title, keywords: t.title, text }, words, q) : { score: 0 };
      if (!score && whole.length > 1) score = s.title.toLowerCase().includes(whole) ? 3 : text.toLowerCase().includes(whole) ? 1 : 0;
      if (score > 0) out.push({ topic: t, id: s.id, title: s.title, snippet: snippetOf(text, words.length ? words : [whole]), score });
    }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** A line of the text around the first word found. */
function snippetOf(text: string, words: string[]): string {
  const low = text.toLowerCase();
  const at = Math.max(0, Math.min(...words.map((w) => low.indexOf(w.toLowerCase())).filter((i) => i >= 0), text.length));
  const from = at > 60 ? text.lastIndexOf(' ', at - 50) + 1 : 0;
  const s = text.slice(from, from + 170);
  return `${from > 0 ? '…' : ''}${s}${from + 170 < text.length ? '…' : ''}`;
}

/** Each topic ends with things to ask an agent: Help offers them as questions, not as a section. */
export const ASK_SECTION = 'ask-an-agent';

/** The quotes an example comes in, outermost first: «Greek» (with “names” inside), “Chinese”, "English". */
const QUOTED = [/«([^»]+)»/g, /“([^”]+)”/g, /"([^"]+)"/g];

/** That section's examples, without their quotes; a line with two ("Pause it", or "Run it now") gives both. */
export function examplesOf(t: GuideTopic): string[] {
  const s = t.sections.find((x) => x.id === ASK_SECTION);
  if (!s) return [];
  return s.text
    .split('\n')
    .map((l) => /^\s*[-*]\s+(.+)$/.exec(l)?.[1].trim() ?? '')
    .filter(Boolean)
    .flatMap((l) => {
      for (const re of QUOTED) {
        const found = [...l.matchAll(re)].map((m) => m[1].trim()).filter(Boolean);
        if (found.length) return found;
      }
      return [l];
    })
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1));
}
