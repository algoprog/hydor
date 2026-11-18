// The app's own pages, by their address. Where the app shows Markdown (an agent's reply, a document), a link written as
// /settings?s=memory or /guide/projects#make-a-project opens that page, and any other /… link is a file of this
// computer (web/src/components/Markdown.tsx). The guide's links are checked against it (server/guide/guide-test.ts),
// so every page the guide names, which agents hand on, is one.

/**
 * Each page's path (no ?query or #section) as precisely as the page reads it (web/src/features/layout/Shell.tsx and each
 * capability's routes), so that a file whose path starts with a page's name (/media/<you>/<drive>/…,
 * /projects/<repo>/src/app.ts, /apps/tool/run.py) stays a file.
 */
const PAGES: RegExp[] = [
  /^\/$/,
  /^\/(?:file|files|search|git|terminal|preview|system|system\/monitor|system\/experiments|inbox|usage|stats|arena|settings|customize|projects|spaces|apps|agents|knowledge|library|pages|guide|answers|browser)$/,
  /^\/(?:s|review)\/[^/]+$/,
  /^\/guide\/[a-z0-9-]+$/,
  /^\/(?:projects|spaces)\/[a-z0-9]+(?:\/(?:library|files|memory|knowledge|wiki|skills|agents|settings))?$/,
  /^\/apps\/(?:(?:runs|t)\/)?[^/.]+$/,
  /^\/apps\/[^/.]+\/edit$/,
  /^\/agents\/[^/.]+$/,
  /^\/pages\/[a-f0-9]{10}(?:\/show)?$/,
  /^\/media\/[a-f0-9]{10}$/,
  /^\/remote\/[\w-]{8,40}\/?$/,
  /^\/arena\/[a-z0-9]+$/,
  /^\/system\/experiments\/[a-z0-9]{4,32}$/,
];

/** Whether a path (`/settings`, `/guide/projects`: no query or #) is one of the app's pages. */
export function isAppPage(path: string): boolean {
  return PAGES.some((re) => re.test(path));
}

/**
 * A link written from the top of the app's address (`/settings?s=memory&find=…`, `/guide/projects#make-a-project`) as it
 * is, when it is one of the app's pages; null for any other (a file's path, `//host/…`, a file's line `/files#L12`).
 */
export function appPageLink(href: string): string | null {
  if (!href.startsWith('/') || href.startsWith('//') || /#L\d+$/.test(href)) return null;
  return isAppPage(href.split(/[?#]/)[0]) ? href : null;
}
