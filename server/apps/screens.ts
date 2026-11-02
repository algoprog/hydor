// A template's screens: pages of its own (Pages keeps them, with versions and the visual editor; the
// library leaves them out), shown on the template's page in place of its form, with window.naget.app to
// run its flows and keep its data (server/pages/kit.ts), and the App parts written on it. A screen made
// for a template is a page of App parts: its form, its answer, a table for each collection it keeps,
// its earlier runs. Agents make and change screens with these routes (through app_api); people in
// Pages' editor.
import type { AppDef, AppRecipe } from '../../shared/apps.ts';
import { labelOf } from '../../shared/app-manifest.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { appWords, userLang } from '../language/index.ts';
import { addVersion, checkHtml, createPage, deletePage, pageInfo, pageSource } from '../pages/store.ts';
import { saveApp } from './store.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The headings a screen made from a template's parts writes (in the language the app is read in). */
const HEADINGS = { answer: { title: 'The answer' }, runs: { title: 'Earlier runs' } };

/** A screen made from a template's parts: its form and answer, a table for each collection it keeps, its earlier runs. */
export function defaultScreen(r: Pick<AppRecipe, 'name' | 'description' | 'fields' | 'answer' | 'data' | 'flow' | 'prompt'>, tr: (s: string) => string = (s) => s, lang = 'en'): string {
  const parts: string[] = [`<h1>${esc(r.name)}</h1>`];
  if (r.description) parts.push(`<p class="n-muted">${esc(r.description)}</p>`);
  if (r.prompt.trim() || r.flow) parts.push('<section>\n  <n-form flow="run"></n-form>\n</section>', `<section>\n  <h2>${esc(tr(HEADINGS.answer.title))}</h2>\n  <n-result flow="run"></n-result>\n</section>`);
  for (const name of Object.keys(r.data ?? {})) parts.push(`<section>\n  <h2>${esc(labelOf(name))}</h2>\n  <n-table data="${esc(name)}" search remove></n-table>\n</section>`);
  if (r.prompt.trim() || r.flow) parts.push(`<section>\n  <h2>${esc(tr(HEADINGS.runs.title))}</h2>\n  <n-runs flow="run" limit="5"></n-runs>\n</section>`);
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.name)}</title>
<style>
  main { max-width: 820px; margin: 0 auto; }
  section { margin-top: 28px; }
</style>
</head>
<body class="n-page">
<main>
${parts.join('\n')}
</main>
</body>
</html>
`;
}

export interface ScreenView {
  name: string;
  page: string;
  title: string;
  version: number;
}

const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;

export function screensOf(db: DB, a: AppDef): ScreenView[] {
  return Object.entries(a.screens ?? {}).flatMap(([name, s]) => {
    const p = pageInfo(db, s.page);
    return p ? [{ name, page: p.id, title: s.title ?? p.title, version: p.version }] : [];
  });
}

/** Makes a screen for a template: the HTML given, or one made from its parts. */
export function makeScreen(db: DB, a: AppDef, o: { name?: unknown; title?: unknown; html?: unknown; by: 'agent' | 'made' }): { screen: ScreenView; app: AppDef } {
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'main';
  if (!NAME.test(name)) throw new HttpError(400, 'A screen’s name is a letter, then letters, digits, - or _ (“main” opens first)');
  if (a.screens?.[name] && pageInfo(db, a.screens[name].page)) throw new HttpError(409, `It has a screen “${name}” already: change it, or remove it first`);
  if (Object.keys(a.screens ?? {}).length >= 12) throw new HttpError(409, 'A template has at most 12 screens');
  const html = o.html === undefined || o.html === null || o.html === '' ? defaultScreen(a, appWords(db), userLang(db)) : checkHtml(o.html);
  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 120) : name === 'main' ? a.name : `${a.name} · ${labelOf(name)}`;
  const page = createPage(db, { title, html, by: o.by, app: a.id });
  const app = saveApp(db, { id: a.id, recipe: { ...a, screens: { ...(a.screens ?? {}), [name]: { page: page.id, ...(name === 'main' ? {} : { title }) } } } });
  return { screen: { name, page: page.id, title, version: page.version }, app };
}

/** A screen's new version (an agent's change; people change screens in Pages' editor). */
export function changeScreen(db: DB, a: AppDef, name: string, o: { html?: unknown; title?: unknown }): ScreenView {
  const s = a.screens?.[name];
  if (!s || !pageInfo(db, s.page)) throw new HttpError(404, `It has no screen “${name}”`);
  const p = addVersion(db, s.page, { html: checkHtml(o.html), title: typeof o.title === 'string' && o.title.trim() ? o.title : undefined, by: 'agent' });
  return { name, page: p.id, title: p.title, version: p.version };
}

export function screenHtml(db: DB, a: AppDef, name: string): ScreenView & { html: string } {
  const s = a.screens?.[name];
  const src = s ? pageSource(db, s.page) : null;
  if (!s || !src) throw new HttpError(404, `It has no screen “${name}”`);
  return { name, page: s.page, title: src.title, version: src.version, html: src.text };
}

export function removeScreen(db: DB, a: AppDef, name: string): AppDef {
  const s = a.screens?.[name];
  if (!s) throw new HttpError(404, `It has no screen “${name}”`);
  deletePage(db, s.page);
  const { [name]: _gone, ...rest } = a.screens!;
  return saveApp(db, { id: a.id, recipe: { ...a, screens: Object.keys(rest).length ? rest : undefined } });
}

/** A template's screens go with it. */
export function removeScreens(db: DB, a: AppDef) {
  for (const s of Object.values(a.screens ?? {})) deletePage(db, s.page);
}

/** Its screens' HTML, for a file: name → title and HTML. */
export function screensForFile(db: DB, a: Pick<AppRecipe, 'screens'>): Record<string, { title: string; html: string }> | undefined {
  const out: Record<string, { title: string; html: string }> = {};
  for (const [name, s] of Object.entries(a.screens ?? {})) {
    const src = pageSource(db, s.page);
    if (src) out[name] = { title: s.title ?? src.title, html: src.text };
  }
  return Object.keys(out).length ? out : undefined;
}
