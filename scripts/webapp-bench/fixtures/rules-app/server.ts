// A small app for each of the four briefs of their own logic, written from rules.ts: it is what proves the judge's plumbing for those briefs (the rule's addresses, the files,
// the board, the restart) and that its worked examples agree with the rules. It is not an example of a builder's app, and it says nothing of whether the rules are what a maker wants.
// BRIEF is 13, 14, 15 or 16; SPOIL names one deliberate mistake (the unit test spoils each in one way and the judge has to name that one line).
import { createServer, type IncomingMessage } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CROPS, QUESTIONS, board, dough, race, seedCalendar, takings, type Play } from '../../rules.ts';

const brief = process.env.BRIEF ?? '13';
const spoil = process.env.SPOIL ?? '';
const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.DATA_DIR ?? '.';
const expectFile = process.env.EXPECT_FILE;
mkdirSync(dataDir, { recursive: true });
const plays = join(dataDir, 'plays.json');
const saved: Play[] = existsSync(plays) ? JSON.parse(readFileSync(plays, 'utf8')) : [];
const limits = { loavesMax: Number(process.env.LOAVES_MAX ?? 60), weightMin: Number(process.env.WEIGHT_MIN ?? 200), boardSize: Number(process.env.BOARD_SIZE ?? 5), under: Number(process.env.UNDER ?? 90), pumpkins: process.env.PUMPKINS === '1', average: process.env.AVERAGE === '1' };

const send = (res: import('node:http').ServerResponse, status: number, body: unknown, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const refuse = (res: import('node:http').ServerResponse, message: string) => send(res, 400, { error: message });
const read = async (req: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
};

const page = (): string => {
  const e = expectFile ? JSON.parse(readFileSync(expectFile, 'utf8')) : { product: 'App', phrases: [] };
  return `<!doctype html><html><head><title>${e.product}</title></head><body><h1>${e.product}</h1><ul>${e.phrases.map((g: string[]) => `<li>${g[0]}</li>`).join('')}</ul></body></html>`;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, page(), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true });
    const body = req.method === 'POST' ? await read(req) : Buffer.alloc(0);
    const json = () => {
      try {
        return JSON.parse(body.toString('utf8'));
      } catch {
        return null;
      }
    };
    if (brief === '13' && req.method === 'POST' && url.pathname === '/api/dough') {
      const b = json();
      const whole = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
      const between = (v: unknown, lo: number, hi: number) => v === undefined || (typeof v === 'number' && v >= lo && v <= hi);
      const okLoaves = spoil === 'no-limits' ? typeof b?.loaves === 'number' : whole(b?.loaves, 1, limits.loavesMax);
      if (!b || !okLoaves || !whole(b.loafWeight, limits.weightMin, 1500) || !between(b.water, 50, 100) || !between(b.salt, 0, 5) || !between(b.starter, 0, 50)) return refuse(res, 'Please give a whole number of loaves, the weight of one loaf in grams, and percentages in the usual range.');
      const r = dough({ loaves: b.loaves, loafWeight: b.loafWeight, ...(b.water !== undefined ? { water: b.water } : {}), ...(b.salt !== undefined ? { salt: b.salt } : {}), ...(b.starter !== undefined ? { starter: b.starter } : {}) });
      if (spoil === 'starter-extra') r.flour = Math.round(r.flour + r.starter / 2);
      return send(res, 200, { flour: r.flour, water: r.water, salt: r.salt, starter: r.starter, total: r.totalDough });
    }
    if (brief === '14' && req.method === 'POST' && url.pathname === '/api/takings') {
      let file = '';
      const type = req.headers['content-type'] ?? '';
      if (/multipart/.test(type)) {
        const form = await new Response(new Uint8Array(body), { headers: { 'content-type': type } }).formData();
        const f = form.get('file');
        file = f && typeof f !== 'string' ? await f.text() : String(f ?? '');
      } else file = body.toString('utf8');
      const t = spoil === 'no-quotes' ? takings(file, (l) => l.split(',').map((p) => p.trim())) : takings(spoil === 'refund-added' ? file.replace(/,-(\d+),/g, ',$1,') : file);
      if (!t) return refuse(res, 'That does not look like a file from the card reader: it needs the headings date, item, quantity and price.');
      const out: Record<string, unknown> = { takings: t.total, sold: t.itemsSold, best: t.bestSeller, refunds: t.refunds, skipped: t.skipped, days: t.days.map((d) => ({ day: d.date, takings: d.takings })) };
      if (limits.average) out.averageDay = t.days.length ? Math.round((t.total / t.days.length) * 100) / 100 : 0;
      return send(res, 200, out);
    }
    if (brief === '15' && req.method === 'POST' && url.pathname === '/api/play') {
      const b = json();
      const name = typeof b?.name === 'string' ? b.name.trim() : '';
      const answers = b?.answers;
      const seconds = num(b?.seconds);
      if (!name || name.length > 20 || !Array.isArray(answers) || answers.length !== QUESTIONS.length || answers.some((a: unknown) => a !== null && !(typeof a === 'number' && Number.isInteger(a))) || seconds === null || typeof b.seconds !== 'number' || seconds < 0) return refuse(res, 'Please give your name, ten answers and the seconds you took.');
      const r = race(answers, seconds, limits.under);
      if (spoil === 'bonus-not-stacked' && r.right === 10 && seconds < limits.under) r.points -= 2;
      saved.push({ name, points: r.points, seconds });
      writeFileSync(plays, JSON.stringify(saved));
      return send(res, 200, { right: r.right, points: r.points });
    }
    if (brief === '15' && req.method === 'GET' && url.pathname === '/api/board') {
      const rows = spoil === 'board-every-play' ? [...saved].sort((a, b) => b.points - a.points || a.seconds - b.seconds).slice(0, limits.boardSize) : board(saved, limits.boardSize);
      return send(res, 200, { rows: rows.map((p) => ({ name: p.name, points: p.points, seconds: p.seconds })) });
    }
    if (brief === '16' && req.method === 'POST' && url.pathname === '/api/calendar') {
      const b = json();
      const tasks = b && typeof b.lastFrost === 'string' && Array.isArray(b.crops) && b.crops.length > 0 && b.crops.every((c: unknown) => typeof c === 'string') ? seedCalendar(b.lastFrost, b.crops, limits.pumpkins ? CROPS_WITH_PUMPKINS : undefined) : null;
      if (!tasks) return refuse(res, 'Please give a real date for the last frost and at least one of the crops on the list.');
      if (spoil === 'not-saturdays') for (const t of tasks) t.date = new Date(Date.parse(`${t.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      return send(res, 200, { jobs: tasks.map((t) => ({ crop: t.crop, what: t.task, when: t.date })) });
    }
    send(res, 404, { error: 'There is nothing here.' });
  } catch (error) {
    send(res, 500, { error: String(error) });
  }
}).listen(port, () => console.log(`listening on ${port}`));

const CROPS_WITH_PUMPKINS = [...CROPS, { crop: 'Pumpkins', steps: [{ task: 'sow indoors', weeks: -3 }, { task: 'plant out', weeks: 2 }] }];

const stop = () => process.exit(0);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
