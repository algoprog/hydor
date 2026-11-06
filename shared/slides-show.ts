// What the slideshow's helpers work out, the same in the app and in tests: when a narrated slide's clicks come (the
// slides runtime keeps the same rule) and the words a narration made with AI says; the rehearsal coach's counting
// (words a minute, filler words in the app's language, reading the slide aloud word for word), its report and the
// timings it gives the slides; and the phone remote's commands and the state of the slideshow it shows.
import { everyEl, plainText, type Deck, type ShapeEl, type Slide, type TextEl } from './slides.ts';

// ---- narration --------------------------------------------------------------------------------------------------

/** When a narrated slide's build clicks come, in seconds from its narration's start: the k-th of n at k/(n+1) of its length. */
export function narrationClicks(seconds: number, clicks: number): number[] {
  if (!(seconds > 0) || !(clicks > 0)) return [];
  const n = Math.min(Math.floor(clicks), 500);
  return Array.from({ length: n }, (_, k) => Math.round(((seconds * (k + 1)) / (n + 1)) * 100) / 100);
}

/** How a deck's narrated slideshow goes: its slides shown, how many have a narration, and how long those last. */
export function narrationTotal(d: Deck): { slides: number; narrated: number; seconds: number } {
  const shown = d.slides.filter((s) => !s.hidden);
  const voiced = shown.filter((s) => s.narration);
  return { slides: shown.length, narrated: voiced.length, seconds: Math.round(voiced.reduce((t, s) => t + (s.narration?.seconds ?? 0), 0) * 10) / 10 };
}

/** Words as a voice reads them: no bullets' marks, no Markdown's stars or links' addresses, one space between words. */
export function spokenWords(text: string): string {
  return text
    .split('\n')
    .map((l) =>
      l
        .replace(/^\s*(?:[-*•◦▪]|\d{1,3}[.)])\s+/, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__|~~|\*|`)/g, '')
        .trim(),
    )
    .filter(Boolean)
    .map((l) => (/[.!?…:;。！？]$/.test(l) ? l : `${l}.`))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** What a slide's narration made with AI says: its speaker notes, else its words (the title first, then the rest from the top). */
export function narrationWords(s: Slide): string {
  if (s.notes?.trim()) return spokenWords(s.notes);
  const texts = everyEl(s.els).filter((e): e is TextEl | ShapeEl => (e.type === 'text' || e.type === 'shape') && !!plainText(e.paras).trim());
  texts.sort((a, b) => Number(b.role === 'title') - Number(a.role === 'title') || a.y - b.y || a.x - b.x);
  return spokenWords(texts.map((e) => plainText(e.paras)).join('\n'));
}

// ---- the rehearsal coach ----------------------------------------------------------------------------------------

/** Letters of scripts written without spaces (Chinese, Japanese): each counts as a word. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;

/** Words said, for counting a pace: words between spaces, each Chinese or Japanese character one. */
export function speechUnits(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const words = text.replace(CJK, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
  return cjk + words;
}

/** The language's first part ("en" of "en-GB"). */
const langOf = (lang: string) => (lang || 'en').toLowerCase().split(/[-_]/)[0];

/** A comfortable pace, words a minute (characters, for Chinese and Japanese): Speaker Coach's 100 to 165 for English. */
export function paceRange(lang: string): [number, number] {
  return ['zh', 'ja'].includes(langOf(lang)) ? [150, 300] : [100, 165];
}

/** Words a minute over a time. */
export const perMinute = (units: number, ms: number) => (ms > 0 ? Math.round((units * 60_000) / ms) : 0);

/** The pace over the last `windowMs` of what was said (each final piece of speech with when it ended and its words), once there is enough to tell. */
export function rollingPace(said: { t: number; units: number }[], now: number, windowMs = 30_000, since = 0): number | null {
  const from = Math.max(since, now - windowMs);
  if (now - from < 12_000) return null;
  const units = said.filter((x) => x.t >= from && x.t <= now).reduce((n, x) => n + x.units, 0);
  return units >= 8 ? perMinute(units, now - from) : null;
}

/** A quiet word on the pace: too fast or too slow for the language's comfortable range (a little room each side), else none. */
export function paceHint(wpm: number | null, lang: string): 'fast' | 'slow' | null {
  if (wpm === null) return null;
  const [lo, hi] = paceRange(lang);
  return wpm > hi * 1.06 ? 'fast' : wpm < lo * 0.9 ? 'slow' : null;
}

/** Filler words by language: those that are always fillers, and (English) those that are only in certain places. */
export const FILLERS: Record<string, string[]> = {
  en: ['um', 'umm', 'uh', 'uhh', 'uhm', 'erm', 'er', 'ah', 'hmm', 'mm', 'you know', 'i mean', 'basically', 'actually', 'literally', 'kind of', 'sort of', 'like', 'so', 'right'],
  zh: ['嗯', '呃', '额', '那个', '就是说', '然后呢', '对吧', '其实'],
  el: ['εεε', 'εε', 'ε', 'μμ', 'δηλαδή', 'ας πούμε', 'ουσιαστικά', 'λοιπόν', 'τέλος πάντων', 'ξέρεις'],
  es: ['eh', 'em', 'este', 'o sea', 'pues', 'bueno', 'en plan', 'digamos'],
  fr: ['euh', 'heu', 'ben', 'bah', 'genre', 'en fait', 'du coup', 'tu vois'],
  de: ['äh', 'ähm', 'öh', 'halt', 'quasi', 'sozusagen', 'eigentlich'],
};

/** English words that count only where they fill: "kind of" not after "a" or "the", "like" between words that do not take it. */
const NOT_BEFORE_KIND = new Set(['a', 'the', 'this', 'that', 'what', 'any', 'some', 'every', 'one', 'no', 'which', 'each', 'all', 'same', 'different', 'my', 'your', 'our', 'their', 'its', 'his', 'her']);
const LIKE_AFTER = new Set(['and', 'but', 'so', 'or', 'um', 'uh', 'like', 'was', 'were', "it's", 'its', "i'm", "they're", "we're", "you're", "he's", "she's"]);
const LIKE_THEN = new Set(['um', 'uh', 'like', 'so', 'you']);
/** The sounds that fill (um, uh…): a "so" after one fills too. */
const SOUNDS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'erm', 'er', 'ah']);

/**
 * The filler words in what was said (a piece at a time, as speech recognition gives it), by the language's list:
 * English "so" only starting a piece (or after an um), "right" only ending one, "like" only between words that are not its own (or
 * starting a piece), "kind of" and "sort of" not as kinds of things, "you know" not asked. Each with how often.
 */
export function fillersIn(pieces: string[], lang: string): Record<string, number> {
  const l = langOf(lang);
  const list = FILLERS[l] ?? FILLERS.en;
  const out: Record<string, number> = {};
  const add = (w: string) => (out[w] = (out[w] ?? 0) + 1);
  for (const piece of pieces) {
    const text = piece.toLowerCase().replace(/[’]/g, "'");
    if (l === 'zh' || l === 'ja') {
      for (const f of list) {
        let at = text.indexOf(f);
        while (at >= 0) {
          add(f);
          at = text.indexOf(f, at + f.length);
        }
      }
      continue;
    }
    const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const before = words[i - 1];
      const after = words[i + 1];
      const pair = after ? `${w} ${after}` : '';
      if (l === 'en') {
        if (pair === 'you know' && !['do', 'did', 'does', "don't", 'if', 'as', 'what'].includes(before ?? '') && after === 'know') {
          add('you know');
          i++;
          continue;
        }
        if (pair === 'i mean') {
          add('i mean');
          i++;
          continue;
        }
        if ((pair === 'kind of' || pair === 'sort of') && !NOT_BEFORE_KIND.has(before ?? '')) {
          add(pair);
          i++;
          continue;
        }
        if (w === 'like') {
          if (i === 0 || LIKE_AFTER.has(before ?? '') || LIKE_THEN.has(after ?? '')) add('like');
          continue;
        }
        if (w === 'so') {
          if ((i === 0 && words.length > 1) || SOUNDS.has(before ?? '')) add('so');
          continue;
        }
        if (w === 'right') {
          if (i === words.length - 1 && words.length > 2) add('right');
          continue;
        }
        if (list.includes(w) && !w.includes(' ')) add(w);
        continue;
      }
      // Other languages: their phrases of two words, then single words.
      if (pair && list.includes(pair)) {
        add(pair);
        i++;
        continue;
      }
      if (list.includes(w)) add(w);
    }
  }
  return out;
}

/** Words of a text for comparing what was said with a slide: lower case, letters and numbers (Chinese and Japanese a character each). */
const tokens = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]|[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];

/** How much of a slide's words were read out word for word: the share of its runs of four words that were said (0 to 1). */
export function readShare(spoken: string, slideText: string): number {
  const grams = (w: string[]) => {
    const out = new Set<string>();
    for (let i = 0; i + 4 <= w.length; i++) out.add(w.slice(i, i + 4).join(' '));
    return out;
  };
  const slide = grams(tokens(slideText));
  if (slide.size < 3) return 0;
  const said = grams(tokens(spoken));
  let hit = 0;
  for (const g of slide) if (said.has(g)) hit++;
  return hit / slide.size;
}

/** A slide's own words, for telling whether they were read out: its text and shapes' words. */
export const slideWords = (s: Slide) =>
  everyEl(s.els)
    .flatMap((e) => (e.type === 'text' || e.type === 'shape' ? [plainText(e.paras)] : []))
    .join('\n');

/** One slide of a rehearsal, as the coach kept it. */
export interface RehearsedSlide {
  /** The deck's slide (its index). */
  i: number;
  /** How long it was shown, in all (ms). */
  ms: number;
  /** When each click of its build came, from when it came (ms). */
  steps: number[];
  /** What was said while it showed, a piece at a time. */
  said: string[];
}

export interface CoachSlide extends RehearsedSlide {
  words: number;
  perMinute: number;
  fillers: number;
  /** The share of its own words read out word for word. */
  read: number;
  /** Shown much shorter or longer than its share of the time. */
  flag?: 'rushed' | 'lingered';
}

export interface CoachReport {
  /** The whole rehearsal (ms), and the time aimed for (ms) when one was set. */
  total: number;
  target?: number;
  words: number;
  perMinute: number;
  /** The comfortable range for the language. */
  range: [number, number];
  /** Each filler word said, the most said first. */
  fillers: [string, number][];
  slides: CoachSlide[];
  /** Slides whose own words were read out word for word. */
  reading: number[];
}

/**
 * The report at the end of a rehearsal: the time against the one aimed for, each slide's time, words and pace, the
 * fillers, the slides read out word for word, and those rushed (well under their share of the time) or lingered on
 * (well over it). A slide's share is the time aimed for split evenly, else the rehearsal's average.
 */
export function coachReport(slides: RehearsedSlide[], deck: Deck, o: { lang: string; targetMinutes?: number }): CoachReport {
  // A slide shown twice (going back to it) counts once, its times added.
  const by = new Map<number, RehearsedSlide>();
  for (const s of slides) {
    const had = by.get(s.i);
    if (had) by.set(s.i, { i: s.i, ms: had.ms + s.ms, steps: had.steps.length >= s.steps.length ? had.steps : s.steps, said: [...had.said, ...s.said] });
    else by.set(s.i, { ...s, steps: [...s.steps], said: [...s.said] });
  }
  const list = [...by.values()].sort((a, b) => a.i - b.i);
  const total = list.reduce((t, s) => t + s.ms, 0);
  const target = o.targetMinutes && o.targetMinutes > 0 ? Math.round(o.targetMinutes * 60_000) : undefined;
  const share = list.length ? (target ?? total) / list.length : 0;
  const all: Record<string, number> = {};
  const out: CoachSlide[] = list.map((s) => {
    const text = s.said.join(' ');
    const words = speechUnits(text);
    const f = fillersIn(s.said, o.lang);
    for (const [w, n] of Object.entries(f)) all[w] = (all[w] ?? 0) + n;
    const slide = deck.slides[s.i];
    const read = slide ? readShare(text, slideWords(slide)) : 0;
    const flag = share > 5000 && s.ms < share * 0.4 && s.ms < 20_000 ? 'rushed' : share > 0 && s.ms > share * 2.2 && s.ms > 30_000 ? 'lingered' : undefined;
    return { ...s, words, perMinute: perMinute(words, s.ms), fillers: Object.values(f).reduce((a, b) => a + b, 0), read, ...(flag ? { flag } : {}) };
  });
  const words = out.reduce((n, s) => n + s.words, 0);
  return {
    total,
    ...(target ? { target } : {}),
    words,
    perMinute: perMinute(words, total),
    range: paceRange(o.lang),
    fillers: Object.entries(all).sort((a, b) => b[1] - a[1]),
    slides: out,
    reading: out.filter((s) => s.read >= 0.5).map((s) => s.i),
  };
}

/**
 * The timings a rehearsal gives the slides (Use these timings): each click of a slide's build when it came, and the
 * slide going on by itself as long after its last click as it stayed then (at least a second), in half seconds.
 */
export function rehearsedTimings(r: CoachReport): Map<number, { auto: number; steps: number[] }> {
  const half = (ms: number) => Math.max(0, Math.round(ms / 500) / 2);
  const out = new Map<number, { auto: number; steps: number[] }>();
  for (const s of r.slides) {
    const steps = s.steps.map(half);
    const last = s.steps.length ? s.steps[s.steps.length - 1] : 0;
    out.set(s.i, { auto: Math.max(1, half(s.ms - last)), steps });
  }
  return out;
}

/** The deck with a rehearsal's timings: each slide rehearsed goes on by itself, its build's clicks timed. */
export function withTimings(d: Deck, t: Map<number, { auto: number; steps: number[] }>): Deck {
  return {
    ...d,
    slides: d.slides.map((s, i) => {
      const x = t.get(i);
      if (!x) return s;
      const tr = { ...(s.transition ?? { fx: 'none' as const }), auto: x.auto };
      if (x.steps.length) tr.steps = x.steps;
      else delete tr.steps;
      return { ...s, transition: tr };
    }),
  };
}

// ---- the phone remote -------------------------------------------------------------------------------------------

/** What the phone asks of the slideshow: the next step or slide, the one before, a slide by its number (from 1, of those shown), the first, the last, a black or white screen (again: back). */
export type RemoteDo = 'next' | 'prev' | 'go' | 'first' | 'last' | 'black' | 'white';
export interface RemoteCmd {
  do: RemoteDo;
  n?: number;
}

const DOS: RemoteDo[] = ['next', 'prev', 'go', 'first', 'last', 'black', 'white'];

/** A command from the phone, checked; null for anything else. */
export function cleanRemoteCmd(v: unknown): RemoteCmd | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const d = DOS.find((x) => x === o.do);
  if (!d) return null;
  if (d !== 'go') return { do: d };
  const n = Number(o.n);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? { do: 'go', n } : null;
}

/** Where the slideshow is, as the window showing it tells the phone. */
export interface RemoteState {
  /** The deck's slide shown (its index), its build's step and how many steps it has. */
  i: number;
  step: number;
  steps: number;
  /** Its place among the slides shown (from 1), and how many are shown. */
  pos: number;
  count: number;
  blank: 'black' | 'white' | null;
  /** When the slideshow started (ms since 1970), for the phone's timer. */
  started: number;
  ended?: boolean;
}

/** The state the slideshow's window sends, checked (numbers in their ranges); null when it is not one. */
export function cleanRemoteState(v: unknown): RemoteState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const int = (x: unknown, max: number) => (Number.isInteger(x) && (x as number) >= 0 && (x as number) <= max ? (x as number) : null);
  const i = int(o.i, 1000);
  const step = int(o.step, 1000);
  const steps = int(o.steps, 1000);
  const pos = int(o.pos, 1000);
  const count = int(o.count, 1000);
  const started = typeof o.started === 'number' && Number.isFinite(o.started) && o.started > 0 ? Math.round(o.started) : null;
  if (i === null || step === null || steps === null || pos === null || count === null || started === null) return null;
  return { i, step, steps, pos, count, blank: o.blank === 'black' || o.blank === 'white' ? o.blank : null, started, ...(o.ended === true ? { ended: true } : {}) };
}
