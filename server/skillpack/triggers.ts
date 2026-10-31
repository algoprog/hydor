// Keyword triggers: a skill whose frontmatter lists `triggers:` is put into Custom's turn by itself when
// the user's message uses one of them, for models that rarely call the skill tool on their own. A
// trigger is a word or a phrase, matched whole and in any case; one ending in * also matches longer
// words ("renovat*": renovate, renovation). Short or trivial messages match nothing.

export interface TriggerSkill {
  name: string;
  triggers: string[];
}

export interface TriggerMatch {
  name: string;
  /** The trigger that matched, as the skill lists it. */
  trigger: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A trigger as a pattern: whole words, any case, spaces as any run of spaces; a trailing * for word endings. */
export function triggerPattern(t: string): RegExp | null {
  const stem = t.trim().endsWith('*');
  const words = t.trim().replace(/\*$/, '').trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.join(' ').length < 3) return null;
  // Straight and curly apostrophes alike: "doesn't" matches "doesn’t".
  const body = words.map((w) => escape(w).replace(/['’]/g, "['’]")).join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}${stem ? '[\\p{L}\\p{N}]*' : ''}(?![\\p{L}\\p{N}])`, 'iu');
}

/** Messages too small to need a skill: a greeting, a yes, a short question. */
export function trivial(message: string): boolean {
  const words = message.trim().split(/\s+/).filter(Boolean);
  return words.length < 4;
}

/**
 * The skills a message calls for, best first: those with the most distinct triggers in it, then the
 * order they were given in. At most `max`.
 */
export function matchTriggers(message: string, skills: TriggerSkill[], max = 2): TriggerMatch[] {
  if (trivial(message)) return [];
  const text = message.slice(0, 4000);
  const hits: { name: string; trigger: string; n: number; i: number }[] = [];
  skills.forEach((s, i) => {
    let n = 0;
    let first = '';
    for (const t of s.triggers) {
      const re = triggerPattern(t);
      if (re?.test(text)) {
        n++;
        first ||= t;
      }
    }
    if (n) hits.push({ name: s.name, trigger: first, n, i });
  });
  return hits
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, max)
    .map(({ name, trigger }) => ({ name, trigger }));
}
