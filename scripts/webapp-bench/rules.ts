// The four rules that the four briefs "of their own logic" ask for, written once as plain functions. They are what the judge's worked examples are checked against
// (rules.test.ts proves that every case in every brief's expect.json is what these say), so a wrong example cannot be the judge's. A builder never sees this file.

// ------------------------------------------------------------------------------------------------ 13 the dough sums

export interface Dough {
  loaves: number;
  loafWeight: number;
  water?: number;
  salt?: number;
  starter?: number;
}

/** Baker's percentages worked on all the flour (the starter's flour included). The starter is half flour, half water, so it is part of the flour and the water. */
export function dough(i: Dough) {
  const water = (i.water ?? 72) / 100;
  const salt = (i.salt ?? 2) / 100;
  const starter = (i.starter ?? 20) / 100;
  const total = i.loaves * i.loafWeight;
  const flour = total / (1 + water + salt);
  const starterWeight = flour * starter;
  return {
    totalDough: total,
    starter: Math.round(starterWeight),
    flour: Math.round(flour - starterWeight / 2),
    water: Math.round(flour * water - starterWeight / 2),
    salt: Math.round(flour * salt * 10) / 10,
  };
}

// ------------------------------------------------------------------------------------------------ 14 the market takings

/** One line of a file, as a list of parts: a comma inside double quotes is part of the text. Null when a quote is never closed. */
export function parts(line: string): string[] | null {
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cell);
      cell = '';
    } else cell += c;
  }
  if (quoted) return null;
  out.push(cell);
  return out.map((p) => p.trim());
}

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export interface Takings {
  total: number;
  itemsSold: number;
  bestSeller: string | null;
  refunds: number;
  skipped: number;
  days: { date: string; takings: number }[];
}

/** The card reader's file: a header line, then date,item,quantity,price. A negative quantity is a refund. A line that cannot be read is skipped and counted. Null when there is no line to read at all. */
export function takings(file: string, split: (line: string) => string[] | null = parts): Takings | null {
  const lines = file.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 1) return null;
  const header = split(lines[0]!)?.map((h) => h.toLowerCase());
  if (!header || header.join(',') !== 'date,item,quantity,price') return null;
  let total = 0;
  let itemsSold = 0;
  let refunds = 0;
  let skipped = 0;
  const perItem = new Map<string, { name: string; count: number; first: number }>();
  const perDay = new Map<string, number>();
  let order = 0;
  for (const line of lines.slice(1)) {
    const p = split(line);
    if (!p || p.length !== 4 || !isDay(p[0]!) || p[1] === '' || !/^-?\d+$/.test(p[2]!) || !/^\d+(\.\d{1,2})?$/.test(p[3]!)) {
      skipped++;
      continue;
    }
    const quantity = Number(p[2]);
    const money = Math.round(quantity * Number(p[3]) * 100) / 100;
    total += money;
    itemsSold += quantity;
    if (quantity < 0) refunds++;
    perDay.set(p[0]!, Math.round(((perDay.get(p[0]!) ?? 0) + money) * 100) / 100);
    const key = p[1]!.toLowerCase();
    const have = perItem.get(key) ?? { name: p[1]!, count: 0, first: order++ };
    have.count += quantity;
    perItem.set(key, have);
  }
  const best = [...perItem.values()].sort((a, b) => b.count - a.count || a.first - b.first)[0];
  return {
    total: Math.round(total * 100) / 100,
    itemsSold,
    bestSeller: best?.name ?? null,
    refunds,
    skipped,
    days: [...perDay].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, t]) => ({ date, takings: t })),
  };
}

// ------------------------------------------------------------------------------------------------ 15 the times tables race

export const QUESTIONS: { ask: string; answer: number }[] = [
  { ask: '6 × 7', answer: 42 },
  { ask: '8 × 9', answer: 72 },
  { ask: '7 × 7', answer: 49 },
  { ask: '12 × 4', answer: 48 },
  { ask: '9 × 6', answer: 54 },
  { ask: '11 × 8', answer: 88 },
  { ask: '3 × 12', answer: 36 },
  { ask: '5 × 9', answer: 45 },
  { ask: '7 × 8', answer: 56 },
  { ask: '12 × 12', answer: 144 },
];

/** One point for each right answer, 3 more for all ten, 2 more for finishing in under 90 seconds with at least 8 right. */
export function race(answers: (number | null)[], seconds: number, fastUnder = 90) {
  const right = QUESTIONS.filter((q, i) => answers[i] === q.answer).length;
  const points = right + (right === 10 ? 3 : 0) + (seconds < fastUnder && right >= 8 ? 2 : 0);
  return { right, points };
}

export interface Play {
  name: string;
  points: number;
  seconds: number;
}

/** The board: each name once (capitals and spaces at the ends do not make a second player) with its best play (more points, else less time, else the earlier one); the best `size`, best first, ties by less time, then the earlier. */
export function board(plays: Play[], size = 5): Play[] {
  const best = new Map<string, { play: Play; at: number }>();
  plays.forEach((p, at) => {
    const key = p.name.trim().toLowerCase();
    const have = best.get(key);
    if (!have || p.points > have.play.points || (p.points === have.play.points && p.seconds < have.play.seconds)) best.set(key, { play: have ? { ...p, name: have.play.name } : p, at: have ? have.at : at });
  });
  return [...best.values()]
    .sort((a, b) => b.play.points - a.play.points || a.play.seconds - b.play.seconds || a.at - b.at)
    .slice(0, size)
    .map((b) => b.play);
}

// ------------------------------------------------------------------------------------------------ 16 the seed calendar

export interface CropRule {
  crop: string;
  steps: { task: string; weeks: number; times?: number; every?: number }[];
}

/** Weeks from the last frost (a minus is before it). A crop with `times` is sown that many times, `every` weeks apart. */
export const CROPS: CropRule[] = [
  { crop: 'Tomatoes', steps: [{ task: 'sow indoors', weeks: -8 }, { task: 'plant out', weeks: 1 }] },
  { crop: 'Runner beans', steps: [{ task: 'sow outside', weeks: 2 }] },
  { crop: 'Carrots', steps: [{ task: 'sow outside', weeks: -3 }, { task: 'sow outside again', weeks: 3 }] },
  { crop: 'Lettuce', steps: [{ task: 'sow outside', weeks: -4, times: 4, every: 3 }] },
  { crop: 'Leeks', steps: [{ task: 'sow indoors', weeks: -10 }, { task: 'plant out', weeks: 4 }] },
];

const DAY = 86_400_000;
const utc = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const written = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Saturday on or before a day. */
export function saturdayOnOrBefore(day: string): string {
  const ms = utc(day);
  return written(ms - ((new Date(ms).getUTCDay() + 1) % 7) * DAY);
}

export function seedCalendar(lastFrost: string, crops: string[], rules: CropRule[] = CROPS): { crop: string; task: string; date: string }[] | null {
  if (!isDay(lastFrost)) return null;
  const tasks: { crop: string; task: string; date: string }[] = [];
  for (const name of crops) {
    const rule = rules.find((r) => r.crop.toLowerCase() === name.trim().toLowerCase());
    if (!rule) return null;
    for (const step of rule.steps) {
      for (let i = 0; i < (step.times ?? 1); i++) tasks.push({ crop: rule.crop, task: step.task, date: saturdayOnOrBefore(written(utc(lastFrost) + (step.weeks + i * (step.every ?? 0)) * 7 * DAY)) });
    }
  }
  return tasks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.crop < b.crop ? -1 : a.crop > b.crop ? 1 : 0));
}
