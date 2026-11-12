// `hydor library`: the Library page. What agents made and you kept: pages, documents, slides, spreadsheets, diagrams, LaTeX
// documents, notebooks (the pages of the API's /api/pages) and pictures, videos and sounds (/api/media). List and search them,
// show one (a document as its text; the rest as what it is), export one to a file in the format its menu offers, open it
// (the editors are visual, so that prints the address), and remove it.
import fs from 'node:fs';
import path from 'node:path';
import type { LibFolder, PageInfo } from '../../../shared/pages.ts';
import { enc } from '../client.ts';
import { tildify, timeAgo } from '../term.ts';
import { choose, fields, markdown, pickOne, str, table, UsageError, type Area, type Ctx } from './kit.ts';

const ITEM_HINT = 'hydor library lists them';
const item = { name: 'item', kind: 'page', pick: true } as const;

/** What a thing of the Library is: the kinds of pages, and the media. */
export type LibKind = 'page' | 'doc' | 'slides' | 'sheet' | 'diagram' | 'tex' | 'notebook' | 'image' | 'video' | 'audio';
const KINDS: LibKind[] = ['page', 'doc', 'slides', 'sheet', 'diagram', 'tex', 'notebook', 'image', 'video', 'audio'];
const KIND_WORDS: Record<string, LibKind> = {
  html: 'page',
  pages: 'page',
  document: 'doc',
  docs: 'doc',
  documents: 'doc',
  deck: 'slides',
  slide: 'slides',
  presentation: 'slides',
  spreadsheet: 'sheet',
  sheets: 'sheet',
  latex: 'tex',
  notebooks: 'notebook',
  diagrams: 'diagram',
  picture: 'image',
  photo: 'image',
  images: 'image',
  pictures: 'image',
  videos: 'video',
  sound: 'audio',
  music: 'audio',
  audios: 'audio',
  sounds: 'audio',
};

/** A kind as typed: its name, or a word for it (latex, deck, picture). */
export function kindOf(word: string): LibKind {
  const w = word.trim().toLowerCase();
  const k = (KINDS as string[]).includes(w) ? (w as LibKind) : KIND_WORDS[w];
  if (!k) throw new UsageError(`--kind takes one of ${KINDS.map((x) => (x === 'tex' ? 'latex' : x)).join(', ')} (it was “${word}”)`);
  return k;
}
const kindName = (k: LibKind) => (k === 'tex' ? 'latex' : k);

/** One thing of the Library, a page of any kind or a picture, video or sound. */
export interface Thing {
  id: string;
  kind: LibKind;
  title: string;
  description: string;
  bytes: number;
  updatedAt: number;
  space?: string;
  folder?: string;
  /** Its own address in the app. */
  at: string;
  info: PageInfo | Record<string, any>;
}

/** The formats each kind exports, and what a file of it is by default (the editors' Export menus). */
const EXPORTS: Record<LibKind, { formats: string[]; default: string }> = {
  page: { formats: ['pdf', 'html', 'md', 'txt'], default: 'pdf' },
  doc: { formats: ['docx', 'pdf', 'odt', 'md', 'epub', 'txt', 'html'], default: 'docx' },
  slides: { formats: ['pptx', 'pdf', 'png', 'md'], default: 'pptx' },
  sheet: { formats: ['xlsx', 'csv', 'pdf'], default: 'xlsx' },
  diagram: { formats: ['svg', 'png', 'jpg', 'drawio', 'pdf'], default: 'svg' },
  tex: { formats: ['pdf', 'tex', 'zip'], default: 'pdf' },
  notebook: { formats: ['ipynb', 'py', 'html', 'pdf'], default: 'ipynb' },
  image: { formats: [], default: 'original' },
  video: { formats: [], default: 'original' },
  audio: { formats: [], default: 'original' },
};

/** The file extension a format makes (the server's own `filename` wins when it sends one). */
const EXT: Record<string, string> = { tex: 'tex', md: 'md', original: '' };

interface Library {
  things: Thing[];
  folders: LibFolder[];
  projects: Map<string, string>;
}

/** Everything of the Library, newest change first. */
async function loadLibrary(ctx: Ctx): Promise<Library> {
  const [pages, media, projects] = await Promise.all([
    ctx.conn.api<{ pages: PageInfo[]; folders: LibFolder[] }>('GET', '/api/pages'),
    ctx.conn.api<{ items: Record<string, any>[] }>('GET', '/api/media').catch(() => ({ items: [] })),
    ctx.conn.api<{ spaces: { id: string; name: string }[] }>('GET', '/api/projects').catch(() => ({ spaces: [] })),
  ]);
  const things: Thing[] = [
    ...pages.pages
      .filter((p) => !p.app)
      .map((p): Thing => ({
        id: p.id,
        kind: (p.kind === 'doc' || p.kind === 'slides' || p.kind === 'sheet' || p.kind === 'diagram' || p.kind === 'tex' || p.kind === 'notebook' ? p.kind : 'page') as LibKind,
        title: p.title,
        description: p.description ?? '',
        bytes: p.bytes,
        updatedAt: p.updatedAt,
        space: p.space,
        folder: p.folder,
        at: `/pages/${p.id}`,
        info: p,
      })),
    ...media.items.map((m): Thing => ({
      id: m.id,
      kind: m.kind as LibKind,
      title: m.title,
      description: m.description ?? '',
      bytes: m.bytes,
      updatedAt: m.updatedAt ?? m.createdAt,
      space: m.space,
      folder: m.folder,
      at: `/media/${m.id}`,
      info: m,
    })),
  ].sort((a, b) => b.updatedAt - a.updatedAt);
  return { things, folders: pages.folders, projects: new Map(projects.spaces.map((s) => [s.id, s.name])) };
}

/** A folder's path: `Thesis/Drafts`. */
function folderPath(lib: Library, id?: string): string {
  const out: string[] = [];
  for (let f = lib.folders.find((x) => x.id === id), n = 0; f && n < 10; f = lib.folders.find((x) => x.id === f!.parent), n++) out.unshift(f.name);
  return out.join('/');
}

const size = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${Math.round(b / 1e3)} kB` : `${b} B`);

/** The thing named (its id, its title, or the start of either), or picked on a terminal. */
async function find(ctx: Ctx, given: string | undefined): Promise<{ thing: Thing; lib: Library }> {
  const lib = await loadLibrary(ctx);
  const thing = await choose(ctx, lib.things, given, { id: (t) => t.id, names: (t) => [t.title], what: 'item', hint: ITEM_HINT, label: (t) => t.title, detail: (t) => kindName(t.kind) });
  return { thing, lib };
}

/** The rows `list` and `search` print. */
function rows(ctx: Ctx, lib: Library, list: Thing[]): string[] {
  const { p } = ctx.look;
  return table(
    ctx,
    list.map((t) => [
      p.dim(kindName(t.kind)),
      p.bold(t.title),
      p.dim(t.id),
      p.dim([lib.projects.get(t.space ?? ''), folderPath(lib, t.folder)].filter(Boolean).join(' › ')),
      p.dim(timeAgo(t.updatedAt)),
      p.dim(size(t.bytes)),
    ]),
    { head: ['KIND', 'TITLE', 'ID', 'WHERE', 'CHANGED', 'SIZE'], grow: 1, fixed: [2], drop: [3, 5, 4] },
  );
}

export const library: Area = {
  name: 'library',
  aliases: ['lib'],
  summary: 'Pages, documents, slides, pictures…',
  help: 'What agents made for you and what you kept, by kind: pages, documents (doc), slides, spreadsheets (sheet), diagrams, LaTeX documents (latex), notebooks, pictures (image), videos and sounds (audio). Name one by its id or its title (or the start of either); on a terminal, leave it out to pick from a list. The editors are visual: open prints the address of an item’s page.',
  group: 'work',
  verbs: [
    {
      name: 'list',
      args: [],
      options: {
        kind: {
          type: 'string',
          value: '<kind>',
          desc: 'Only this kind (page, doc, slides, sheet, image…)',
          values: ['page', 'doc', 'slides', 'sheet', 'diagram', 'latex', 'notebook', 'image', 'video', 'audio'],
        },
        project: { type: 'string', value: '<project>', desc: 'Only what is in this project', kind: 'project' },
      },
      summary: 'Everything kept, newest change first',
      help: '30 are shown (-n for more, or --all). --json gives the pages and the pictures, videos and sounds as the API has them.',
      examples: ['hydor library', 'hydor library --kind doc', 'hydor library --project thesis -n 100'],
      async run(ctx, _a, v) {
        const lib = await loadLibrary(ctx);
        if (ctx.o.json) return ctx.json({ items: lib.things.map((t) => ({ ...t.info, kind: t.kind })), folders: lib.folders });
        let list = lib.things;
        if (str(v, 'kind')) {
          const k = kindOf(str(v, 'kind')!);
          list = list.filter((t) => t.kind === k);
        }
        if (str(v, 'project')) {
          const projects = [...lib.projects].map(([id, name]) => ({ id, name }));
          const s = pickOne(projects, str(v, 'project')!, { id: (x) => x.id, names: (x) => [x.name], what: 'project', hint: 'hydor projects lists them' });
          list = list.filter((t) => t.space === s.id);
        }
        if (!list.length) return ctx.out(str(v, 'kind') || str(v, 'project') ? 'Nothing of that kind is kept.' : 'The Library is empty: agents save what they make for you here.');
        const shown = list.slice(0, ctx.o.all ? list.length : (ctx.o.limit ?? 30));
        ctx.out(rows(ctx, lib, shown));
        if (list.length > shown.length) ctx.out(ctx.look.p.dim(`… ${list.length - shown.length} more (-n <number>, or --all)`));
      },
    },
    {
      name: 'search',
      aliases: ['find'],
      args: [{ name: 'words', kind: 'text', rest: true }],
      options: { kind: { type: 'string', value: '<kind>', desc: 'Only this kind', values: ['page', 'doc', 'slides', 'sheet', 'diagram', 'latex', 'notebook', 'image', 'video', 'audio'] } },
      summary: 'Find things by their titles and descriptions',
      help: 'Every word must be in a title or a description; with search by meaning on (Settings → Memory), what is alike in meaning follows.',
      examples: ['hydor library search budget', 'hydor library search quarterly report --kind sheet'],
      async run(ctx, words, v) {
        if (!words.length) throw new UsageError(`Say what to look for: ${ctx.usage}`);
        const lib = await loadLibrary(ctx);
        const ws = words.join(' ').toLowerCase().split(/\s+/);
        const kind = str(v, 'kind') ? kindOf(str(v, 'kind')!) : undefined;
        const by = (t: Thing) => (!kind || t.kind === kind) && ws.every((w) => `${t.title} ${t.description}`.toLowerCase().includes(w));
        let hits = lib.things.filter(by);
        const alike = await ctx.conn.api<{ alike?: { id: string }[] }>('GET', `/api/find?q=${enc(words.join(' '))}&in=pages`).then(
          (r) => r.alike ?? [],
          () => [],
        );
        const ids = new Set(hits.map((t) => t.id));
        const meaning = alike
          .map((a) => a.id.replace(/^page:/, ''))
          .map((id) => lib.things.find((t) => t.id === id))
          .filter((t): t is Thing => !!t && !ids.has(t.id) && (!kind || t.kind === kind));
        hits = [...hits, ...meaning];
        if (ctx.o.json) return ctx.json({ items: hits.map((t) => ({ ...t.info, kind: t.kind })) });
        if (!hits.length) return ctx.out(`Nothing in the Library fits “${words.join(' ')}”.`);
        ctx.out(rows(ctx, lib, hits.slice(0, ctx.o.all ? hits.length : (ctx.o.limit ?? 30))));
      },
    },
    {
      name: 'show',
      args: [item],
      summary: 'A document’s text, or what an item is',
      help: 'A document prints as its text (Markdown; piped, as it is). Everything else says what it is: its kind, size, place, when it changed, and its address. --json gives the item as the API has it.',
      examples: ['hydor library show "Q3 report"', 'hydor library show 3f9a1c2b7d | less'],
      async run(ctx, [given]) {
        const { thing: t, lib } = await find(ctx, given);
        if (ctx.o.json) return ctx.json({ ...t.info, kind: t.kind });
        const { p } = ctx.look;
        const where = [lib.projects.get(t.space ?? ''), folderPath(lib, t.folder)].filter(Boolean).join(' › ');
        const i = t.info as Record<string, any>;
        const head = fields(ctx, [
          ['Kind', kindName(t.kind)],
          ['Id', t.id],
          ['Description', t.description],
          ['Where', where || undefined],
          ['Size', size(t.bytes)],
          ['Changed', timeAgo(t.updatedAt)],
          ['Version', i.version ? `${i.version} of ${i.versions}` : undefined],
          ['Picture', i.width ? `${i.width} × ${i.height}` : undefined],
          ['Length', i.duration ? `${Math.round(i.duration)} s` : undefined],
          ['Made by', i.model],
          ['Prompt', i.prompt],
          ['Published', i.published ? 'yes, at a link' : undefined],
          ['Locked', i.locked ? 'yes' : undefined],
          ['Page', `${ctx.conn.base}${t.at}`],
        ]);
        if (t.kind !== 'doc') {
          const f = EXPORTS[t.kind];
          return ctx.out([
            p.bold(t.title),
            ...head,
            '',
            p.dim(
              `Its editor is a page: hydor library open ${t.id}. ${f.formats.length ? `hydor library export ${t.id} --to ${f.formats.join('|')} makes a file.` : `hydor library export ${t.id} saves the file.`}`,
            ),
          ]);
        }
        const text = await ctx.conn.api<unknown>('GET', `/api/pages/${enc(t.id)}/export?format=md`, undefined, { timeoutMs: 120_000 });
        const md = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
        if (!ctx.interactive) return ctx.out(md.replace(/\n$/, ''));
        ctx.out([p.bold(t.title), ...head, '', ...markdown(ctx, md)]);
      },
    },
    {
      name: 'export',
      args: [item],
      options: {
        to: { type: 'string', value: '<format>', desc: 'The format: pdf, docx, pptx, xlsx, md, csv, png, svg…' },
        output: { type: 'string', short: 'o', value: '<file>', desc: 'Where to write it (default: its title, here)', kind: 'file' },
      },
      summary: 'Save an item as a file',
      help: 'The formats are those of the editor’s Export menu: documents docx, pdf, odt, md, epub, txt, html; slides pptx, pdf, png (a zip of the slides), md; spreadsheets xlsx, csv, pdf; diagrams svg, png, jpg, drawio, pdf; LaTeX pdf, tex, zip; notebooks ipynb, py, html, pdf; pages pdf, html, md, txt. A picture, video or sound is saved as it is. Without --to, the kind’s usual one (docx, pptx, xlsx, ipynb, svg, pdf).',
      examples: ['hydor library export "Q3 report" --to pdf -o q3.pdf', 'hydor library export deck1 --to pptx', 'hydor library export 7ac3 -o photo.png'],
      async run(ctx, [given], v) {
        const { thing: t } = await find(ctx, given);
        const f = EXPORTS[t.kind];
        let format = (str(v, 'to') ?? f.default).toLowerCase().replace(/^\./, '');
        if (format === 'word') format = 'docx';
        if (format === 'powerpoint') format = 'pptx';
        if (format === 'excel') format = 'xlsx';
        if (format === 'latex') format = 'tex';
        const media = !f.formats.length;
        if (media && str(v, 'to') && format !== 'original') throw new UsageError(`A ${kindName(t.kind)} is saved as it is: leave out --to`);
        if (!media && !f.formats.includes(format)) throw new UsageError(`A ${kindName(t.kind)} exports as ${f.formats.join(', ')} (it was “${format}”)`);
        if (!ctx.conn.raw) throw new UsageError('This connection cannot fetch files');
        const got = await ctx.conn.raw(media ? `/api/media/${enc(t.id)}/file?download=1` : `/api/pages/${enc(t.id)}/export?format=${enc(format)}`, { timeoutMs: 600_000 });
        const base =
          (t.title || t.id)
            .replace(/[\\/:*?"<>|\n\r]+/g, ' ')
            .trim()
            .slice(0, 80) || t.id;
        const ext =
          path.extname(got.filename ?? '').replace(/^\./, '') || (media ? (((t.info as any).mime as string | undefined)?.split('/')[1]?.replace(/^jpeg$/, 'jpg') ?? 'bin') : (EXT[format] ?? format));
        const out = path.resolve(str(v, 'output') ?? `${base}.${ext}`);
        if (!str(v, 'output') && fs.existsSync(out)) throw new UsageError(`${path.basename(out)} exists already: name the file with -o <file>`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, got.data);
        if (ctx.o.json) return ctx.json({ id: t.id, file: out, bytes: got.data.length, format: media ? 'original' : format, ...(got.note ? { note: got.note } : {}) });
        ctx.out(`Saved “${t.title}” as ${tildify(out, ctx.look.home)} (${size(got.data.length)}).`);
        if (got.note) ctx.out(ctx.look.p.dim(got.note));
      },
    },
    {
      name: 'open',
      args: [item],
      summary: 'The address of an item’s page',
      help: 'Prints it; --browser opens it in your browser too. The editors for slides, spreadsheets, documents and diagrams are visual, so this is how to get to them.',
      examples: ['hydor library open "Q3 report"', 'hydor library open deck1 --browser'],
      async run(ctx, [given]) {
        const { thing: t } = await find(ctx, given);
        const url = `${ctx.conn.base}${t.at}`;
        if (ctx.o.json) return ctx.json({ url });
        ctx.out(url);
        if (ctx.o.browser) (await import('../commands.ts')).openBrowser(url);
      },
    },
    {
      name: 'remove',
      aliases: ['delete', 'rm'],
      args: [item],
      summary: 'Delete an item with its versions',
      help: 'A page goes with all its versions and the data it keeps; a picture, video or sound with its copy (the file it was saved from stays).',
      examples: ['hydor library remove "Old draft"', 'hydor library remove 3f9a1c2b7d -y'],
      async run(ctx, [given]) {
        const { thing: t } = await find(ctx, given);
        if (!(await ctx.confirm(`Delete the ${kindName(t.kind)} “${t.title}”?`))) return ctx.out('Not removed.');
        const r = await ctx.conn.api('DELETE', t.kind === 'image' || t.kind === 'video' || t.kind === 'audio' ? `/api/media/${enc(t.id)}` : `/api/pages/${enc(t.id)}`);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Removed “${t.title}”.`);
      },
    },
  ],
};
