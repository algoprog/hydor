// The page editor's newer blocks, shared: how they look in any page (the kit carries BLOCKS_CSS, light or dark as the page
// is), and what an address shows as an Embed (a map, a Google Doc or Sheet, Figma, Spotify, CodePen, Loom… or the page
// itself, where it may be framed).

const LINE = 'color-mix(in srgb,currentColor 14%,transparent)';
const SOFT = 'color-mix(in srgb,currentColor 5%,transparent)';
const CLIP =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5'/%3E%3C/svg%3E\")";

/** The blocks' looks (part of the page kit's stylesheet). */
export const BLOCKS_CSS = `
.n-embed{display:block;margin:.8em 0}
.n-embed iframe{display:block;width:100%;aspect-ratio:16/10;border:1px solid ${LINE};border-radius:var(--n-radius,12px);background:${SOFT}}
.n-embed[data-kind=map] iframe{aspect-ratio:4/3}
.n-embed[data-kind=spotify] iframe{aspect-ratio:auto;height:352px;border:0}
.n-embed[data-kind=slides] iframe,.n-embed[data-kind=loom] iframe{aspect-ratio:16/9}
.n-page a.n-embed-link,a.n-embed-link{display:inline-block;margin-top:4px;font-size:12px;opacity:.65;color:inherit}
.n-page a.n-bookmark,a.n-bookmark{display:flex;align-items:stretch;margin:.8em 0;min-height:92px;border:1px solid ${LINE};border-radius:10px;overflow:hidden;color:inherit;text-decoration:none}
.n-bookmark:hover{background:${SOFT}}
.n-bm-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;padding:12px 14px}
.n-bm-title{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.n-bm-desc{font-size:.86em;opacity:.72;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.n-bm-url{display:flex;align-items:center;gap:6px;margin-top:auto;font-size:.8em;opacity:.65;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.n-bm-icon{width:16px;height:16px;flex:none}
.n-bm-pic{flex:none;width:30%;max-width:220px;object-fit:cover;border-left:1px solid ${LINE}}
@media (max-width:480px){.n-bm-pic{display:none}}
.n-page a.n-file,a.n-file{display:flex;align-items:center;gap:10px;margin:.5em 0;padding:8px 12px;border-radius:8px;background:${SOFT};color:inherit;text-decoration:none}
.n-file:hover{background:color-mix(in srgb,currentColor 9%,transparent)}
.n-file::before{content:"";flex:none;width:18px;height:18px;background:currentColor;opacity:.7;-webkit-mask:${CLIP} center/contain no-repeat;mask:${CLIP} center/contain no-repeat}
.n-file-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.n-file-size{margin-left:auto;flex:none;font-size:.82em;opacity:.6}
.n-audio{display:flex;flex-direction:column;gap:4px;margin:.8em 0}
.n-audio audio{display:block;width:100%}
.n-audio-name{font-size:.82em;opacity:.65}
.n-pdf{display:block;margin:.8em 0;min-height:120px}
.n-mermaid{display:block;margin:.8em 0;overflow-x:auto;text-align:center}
.n-mermaid svg{max-width:100%;height:auto}
.n-mm-dark{display:none}
html[data-n-theme=dark] .n-page .n-mermaid:has(.n-mm-dark) .n-mm-light{display:none}
html[data-n-theme=dark] .n-page .n-mm-dark{display:block}
.n-chart{display:block;margin:1em 0;min-height:60px}
.n-crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:.2em 0 .8em;font-size:.86em;opacity:.75}
.n-crumbs a{color:inherit;text-decoration:none}
.n-crumbs a:hover{text-decoration:underline}
.n-crumb-sep{opacity:.6}
.n-tabs{margin:.8em 0}
.n-tabbar{display:flex;flex-wrap:wrap;gap:2px;border-bottom:1px solid ${LINE}}
.n-tab{appearance:none;margin:0 0 -1px;padding:6px 12px;border:0;border-bottom:2px solid transparent;background:none;color:inherit;font:inherit;font-weight:500;opacity:.68;cursor:pointer}
.n-tab.n-on{border-bottom-color:currentColor;opacity:1}
.n-tabpanel{padding:10px 2px}
.n-tabpanel:not(.n-on){display:none}
@media print{.n-tabpanel:not(.n-on){display:block}.n-embed iframe{display:none}}
`;

export interface EmbedOf {
  /** What the page frames. */
  src: string;
  /** What it is (a map, a sheet, Spotify…): its look. */
  kind: string;
  provider: string;
}

/** What an address shows as an Embed: the provider's player or viewer for it, or the page itself; null for no address. */
export function embedOf(raw: string): EmbedOf | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  u.protocol = 'https:';
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname;
  const enc = encodeURIComponent;
  // Google Maps: a place, a point (@lat,lng) or a search, as Maps' own embed of it.
  if (/^(google\.[a-z.]+|maps\.google\.[a-z.]+)$/.test(host) && (path.startsWith('/maps') || host.startsWith('maps.'))) {
    if (path.startsWith('/maps/embed')) return { src: u.href, kind: 'map', provider: 'Google Maps' };
    const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(path);
    const place = /\/place\/([^/]+)/.exec(path)?.[1];
    const q = u.searchParams.get('q') ?? (place ? decodeURIComponent(place.replace(/\+/g, ' ')) : at ? `${at[1]},${at[2]}` : '');
    return q ? { src: `https://maps.google.com/maps?q=${enc(q)}&z=${at ? 14 : 13}&output=embed`, kind: 'map', provider: 'Google Maps' } : null;
  }
  if (host === 'openstreetmap.org') {
    const m = /map=(\d+)\/(-?\d+\.\d+)\/(-?\d+\.\d+)/.exec(u.hash);
    if (!m) return { src: 'https://www.openstreetmap.org/export/embed.html', kind: 'map', provider: 'OpenStreetMap' };
    const z = Number(m[1]);
    const lat = Number(m[2]);
    const lon = Number(m[3]);
    const d = 180 / 2 ** z;
    return { src: `https://www.openstreetmap.org/export/embed.html?bbox=${(lon - d * 1.6).toFixed(5)},${(lat - d).toFixed(5)},${(lon + d * 1.6).toFixed(5)},${(lat + d).toFixed(5)}&layer=mapnik&marker=${lat},${lon}`, kind: 'map', provider: 'OpenStreetMap' };
  }
  if (host === 'docs.google.com') {
    const m = /^\/(document|spreadsheets|presentation|forms)\/d\/(e\/)?([\w-]+)/.exec(path);
    if (m) {
      const [, what, pub, id] = m;
      const base = `https://docs.google.com/${what}/d/${pub ?? ''}${id}`;
      if (what === 'presentation') return { src: `${base}/embed`, kind: 'slides', provider: 'Google Slides' };
      if (what === 'forms') return { src: `${base}/viewform?embedded=true`, kind: 'page', provider: 'Google Forms' };
      return { src: pub ? `${base}/pubhtml?widget=true` : `${base}/preview`, kind: what === 'spreadsheets' ? 'sheet' : 'doc', provider: what === 'spreadsheets' ? 'Google Sheets' : 'Google Docs' };
    }
  }
  if (host === 'drive.google.com') {
    const id = /\/file\/d\/([\w-]+)/.exec(path)?.[1] ?? u.searchParams.get('id');
    if (id) return { src: `https://drive.google.com/file/d/${id}/preview`, kind: 'doc', provider: 'Google Drive' };
  }
  if (host === 'figma.com' && /^\/(file|design|proto|board|slides)\//.test(path)) return { src: `https://www.figma.com/embed?embed_host=share&url=${enc(u.href)}`, kind: 'page', provider: 'Figma' };
  if (host === 'open.spotify.com') {
    const m = /^\/(?:intl-\w+\/)?(track|album|playlist|episode|show|artist)\/(\w+)/.exec(path);
    if (m) return { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, kind: 'spotify', provider: 'Spotify' };
  }
  if (host === 'codepen.io') {
    const m = /^\/([\w-]+)\/(?:pen|full|details)\/(\w+)/.exec(path);
    if (m) return { src: `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`, kind: 'page', provider: 'CodePen' };
  }
  if (host === 'loom.com') {
    const id = /^\/(?:share|embed)\/(\w+)/.exec(path)?.[1];
    if (id) return { src: `https://www.loom.com/embed/${id}`, kind: 'loom', provider: 'Loom' };
  }
  if (host === 'miro.com') {
    const id = /^\/app\/board\/([\w=-]+)/.exec(path)?.[1];
    if (id) return { src: `https://miro.com/app/live-embed/${id}/`, kind: 'page', provider: 'Miro' };
  }
  if (host === 'airtable.com') {
    const id = /^\/(?:embed\/)?((?:shr|app)\w+(?:\/\w+)*)/.exec(path)?.[1];
    if (id) return { src: `https://airtable.com/embed/${id}`, kind: 'sheet', provider: 'Airtable' };
  }
  if (host === 'codesandbox.io') {
    const id = /^\/(?:s|p\/sandbox|embed)\/([\w-]+)/.exec(path)?.[1];
    if (id) return { src: `https://codesandbox.io/embed/${id}`, kind: 'page', provider: 'CodeSandbox' };
  }
  if (host === 'calendly.com' || host === 'typeform.com' || host.endsWith('.typeform.com') || host === 'excalidraw.com' || host === 'tldraw.com') return { src: u.href, kind: 'page', provider: host.split('.')[0][0].toUpperCase() + host.split('.')[0].slice(1) };
  return { src: u.href, kind: 'page', provider: host };
}
