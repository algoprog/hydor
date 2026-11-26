// The rules the four larger briefs ask for, written once as plain functions, as rules.ts does for the briefs of their own logic. They are what the worked examples in the larger briefs'
// expect.json files are checked against (plans.test.ts), so a wrong example cannot be the judge's. A builder never sees this file.

// ------------------------------------------------------------------------------------------------ 17 the club: who has paid

/** A member has paid for this month when the payment service told the app so for this month: paying for last month does not count. */
export const paidThisMonth = (paidMonths: string[], month: string): boolean => paidMonths.includes(month);

export type Role = 'chair' | 'treasurer' | 'coach' | 'member';

/** What each role may do, as the maker's words say it. */
export function may(role: Role, what: 'see-all-details' | 'change-others-details' | 'post-notice' | 'give-roles' | 'read-notices-unpaid'): boolean {
  switch (what) {
    case 'see-all-details':
      return role === 'chair' || role === 'treasurer';
    case 'change-others-details':
      return role === 'chair';
    case 'post-notice':
      return role === 'chair' || role === 'coach';
    case 'give-roles':
      return role === 'chair';
    case 'read-notices-unpaid':
      return role !== 'member';
  }
}

// ------------------------------------------------------------------------------------------------ 18 the crews: who sees a row

/** A row belongs to a team; a person sees it when they are in that team. */
export const canSee = (memberships: string[], rowTeam: string): boolean => memberships.includes(rowTeam);

// ------------------------------------------------------------------------------------------------ 19 the help centre

export interface Article {
  title: string;
  text: string;
  category: string;
  status: 'draft' | 'published';
}

/** The address of an article: its title in lower case, letters and digits, the words joined by single hyphens. */
export const slugify = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const wordsOf = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const byTitle = (a: Article, b: Article) => (a.title.toLowerCase() < b.title.toLowerCase() ? -1 : a.title.toLowerCase() > b.title.toLowerCase() ? 1 : 0);

/** The published articles that have every word of the query (whole words, any capitals) in the title or the text: those with all the words in the title first, then the rest, each group in alphabetical order by title. */
export function search(corpus: Article[], query: string): Article[] {
  const q = wordsOf(query);
  if (q.length === 0) return [];
  const found = corpus.filter((a) => a.status === 'published').filter((a) => {
    const have = new Set(wordsOf(`${a.title} ${a.text}`));
    return q.every((w) => have.has(w));
  });
  const inTitle = (a: Article) => q.every((w) => wordsOf(a.title).includes(w));
  return [...found.filter(inTitle).sort(byTitle), ...found.filter((a) => !inTitle(a)).sort(byTitle)];
}

/** The published articles of a category, in alphabetical order by title. */
export const inCategory = (corpus: Article[], category: string): Article[] => corpus.filter((a) => a.status === 'published' && a.category === category).sort(byTitle);

const CATEGORIES: Record<string, { subjects: string[] }> = {
  Heating: { subjects: ['radiator', 'thermostat', 'boiler pressure', 'timer', 'zone valve', 'circulation pump', 'bleed key', 'magnetic filter', 'flue', 'expansion vessel'] },
  'Hot water': { subjects: ['cylinder', 'immersion heater', 'mixer shower', 'tap flow', 'limescale', 'hot water store', 'pressure reducing valve', 'tank thermostat', 'cold feed', 'pipe lagging'] },
  Payments: { subjects: ['annual service invoice', 'direct debit', 'card payment', 'service plan', 'payment reminder', 'refund', 'receipt', 'late fee', 'quote', 'deposit'] },
  Appointments: { subjects: ['first visit', 'rebooking', 'missed visit', 'access to the boiler', 'visit window', 'parking', 'engineer arrival', 'evening visit', 'emergency call out', 'visit reminder'] },
  Safety: { subjects: ['carbon monoxide alarm', 'gas smell', 'flue check', 'ventilation', 'pilot light', 'safe room temperature', 'frozen condensate pipe', 'meter cupboard', 'gas safe card', 'landlord certificate'] },
};
const OPENERS = ['Why your {s} stops working', 'What to do when the {s} is noisy', 'How we check the {s}', 'Looking after the {s}', 'When the {s} needs an engineer'];
const COMMON = ['pressure', 'switch', 'cold', 'reset', 'clock', 'manual', 'filter', 'engineer'];

/** Fifty articles for the help centre, the same every time: ten for each of five categories, one in six a draft, the words of the text drawn from a few that many articles share. */
export function corpus50(): Article[] {
  const out: Article[] = [];
  let n = 0;
  for (const [category, { subjects }] of Object.entries(CATEGORIES)) {
    for (const [i, subject] of subjects.entries()) {
      const title = OPENERS[(n + i) % OPENERS.length]!.replace('{s}', subject);
      const w1 = COMMON[(n * 3 + i) % COMMON.length]!;
      const w2 = COMMON[(n * 5 + i + 2) % COMMON.length]!;
      const text = `Start by looking at the ${subject}. Check the ${w1} and the ${w2} before you call us, and write down what you see. Our engineer will ask about the ${subject} first. Reference ${category.toLowerCase().replace(/ /g, '')}${i}.`;
      out.push({ title, text, category, status: n % 6 === 5 ? 'draft' : 'published' });
      n++;
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ 20 the booking page

export interface Hours {
  weekday: string;
  start: string;
  end: string;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const toMinutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** The free slots of a day: every `minutes` from the start of that weekday's hours while the slot ends by the end; none on a day off; the booked ones are gone. Local times written HH:MM. */
export function slotsFor(day: string, hours: Hours[], daysOff: string[], minutes: number, booked: string[] = []): string[] {
  if (daysOff.includes(day)) return [];
  const weekday = WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]!;
  const out: string[] = [];
  for (const h of hours.filter((x) => x.weekday === weekday)) for (let m = toMinutes(h.start); m + minutes <= toMinutes(h.end); m += minutes) out.push(toTime(m));
  return out.filter((t) => !booked.includes(t)).sort();
}

/** The local time (HH:MM) in a zone of an instant written with an offset or a Z. */
export function localTime(instant: string, zone: string): string | null {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  return `${parts.find((p) => p.type === 'hour')!.value}:${parts.find((p) => p.type === 'minute')!.value}`;
}
