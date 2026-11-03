// The parts of an app's view that draw with a script (shared/app-ui.ts): maps (Leaflet, OpenStreetMap's tiles),
// plots in 2D and 3D (Plotly), videos from YouTube or Vimeo, and the view's own widgets (ES modules that import
// the libraries the view names, from jsDelivr). Each is a custom element (<n-map>, <n-plot>, <n-embed>,
// <n-widget>), so the view's drawing (ui-kit.ts) keeps it as it is while what fills it is the same, and draws it
// afresh when that changes. A template can place them too: <n-map value="{{result.stops|json}}" lat="lat" lng="lng">.
//
// The function below runs in the browser, inside the sandboxed frame: its source is sent as text, so it uses only its
// arguments (the view kit's own functions, and where the libraries are) and the browser's globals.
import { KIT_LIBS, LIB_CDN } from '../../shared/app-media.ts';

/** Where the view's own elements load their libraries from. */
export const KIT_LIB_URLS = {
  leafletJs: `${LIB_CDN}${KIT_LIBS.leaflet.pkg}@${KIT_LIBS.leaflet.version}/${KIT_LIBS.leaflet.js}`,
  leafletCss: `${LIB_CDN}${KIT_LIBS.leaflet.pkg}@${KIT_LIBS.leaflet.version}/${KIT_LIBS.leaflet.css}`,
  plotlyJs: `${LIB_CDN}${KIT_LIBS.plotly.pkg}@${KIT_LIBS.plotly.version}/${KIT_LIBS.plotly.js}`,
};

/** What the media parts are given by the view's kit. */
export interface MediaKitApi {
  libs: typeof KIT_LIB_URLS;
  esc: (s: unknown) => string;
  L: (k: string, d: string) => string;
  /** An address as it shows (an app's file by its name; '' for one that may not show). */
  url: (src: string) => string;
  /** A view event, with what the click says (event.*) and the element it came from. */
  fire: (name: string, el: Element, event: Record<string, unknown>) => void;
  /** Plays a video from YouTube or Vimeo over the page (their players cannot run in the sandbox). */
  play: (src: string, title: string) => void;
  setAt: (name: string, value: unknown) => void;
  draw: () => void;
  state: () => Record<string, unknown>;
  lang: string;
  widgets: Record<string, { code: string; height?: string }>;
}

/**
 * The custom elements. A frame keeps its elements when its page is written again (a view changed while designing
 * it), so they are defined once, and always reach the latest view's functions.
 */
function mediaKit(latest: MediaKitApi) {
  const W = window as any;
  W.__nMedia = latest;
  if (customElements.get('n-map')) return;
  const K = new Proxy({} as MediaKitApi, { get: (_t, p) => W.__nMedia?.[p] });
  const isObj = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);
  const loaded = new Map<string, Promise<void>>();
  const script = (src: string) => {
    if (!loaded.has(src))
      loaded.set(
        src,
        new Promise<void>((ok, fail) => {
          const s = document.createElement('script');
          s.src = src;
          s.async = true;
          s.crossOrigin = 'anonymous';
          s.onload = () => ok();
          s.onerror = () => {
            loaded.delete(src);
            fail(new Error(K.L('libFailed', 'Its library could not be loaded: is this device online?')));
          };
          document.head.appendChild(s);
        }),
      );
    return loaded.get(src)!;
  };
  const sheet = (href: string) => {
    if (document.querySelector(`link[data-n-lib="${CSS.escape(href)}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.setAttribute('data-n-lib', href);
    document.head.appendChild(l);
  };
  /**
   * The page kit's colours, as the app shows them now (the dark theme's are set on the page's body), each as rgb():
   * the map and plot libraries read no other way of writing a colour.
   */
  const theme = () => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    (document.body ?? document.documentElement).appendChild(probe);
    const v = (n: string, d: string) => {
      probe.style.color = d;
      probe.style.color = `var(${n}, ${d})`;
      return getComputedStyle(probe).color || d;
    };
    const out = { accent: v('--n-accent', '#3b82f6'), fg: v('--n-fg', '#1f2328'), muted: v('--n-muted', '#6b7280'), line: v('--n-line', '#e5e7eb'), card: v('--n-card', '#ffffff'), soft: v('--n-soft', '#f3f4f6'), bg: v('--n-bg', '#ffffff') };
    probe.remove();
    const rgb = /(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/.exec(out.fg) ?? ['', '31', '35', '40'];
    const dark = (Number(rgb[1]) * 299 + Number(rgb[2]) * 587 + Number(rgb[3]) * 114) / 1000 > 140;
    return { ...out, dark };
  };
  const PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#76b7b2', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];
  const num = (v: unknown): number => {
    if (typeof v === 'number') return v;
    const s = String(v ?? '').trim().replace(/^[$€£¥]\s*/, '').replace(/(\d)[,_ ](?=\d{3}\b)/g, '$1');
    return s === '' ? NaN : Number(s);
  };
  /** What fills an element: its value and settings (data-n-v from a block; value and its other attributes from a template). */
  const config = (el: Element): { v: unknown; w: Record<string, any> } => {
    const raw = el.getAttribute('data-n-v');
    if (raw)
      try {
        const o = JSON.parse(raw);
        return { v: o?.v, w: isObj(o?.w) ? o.w : {} };
      } catch {}
    let v: unknown = null;
    const val = el.getAttribute('value');
    if (val !== null)
      try {
        v = JSON.parse(val);
      } catch {
        v = val;
      }
    const w: Record<string, any> = {};
    for (const a of [...el.attributes]) {
      if (a.name === 'value' || a.name === 'name' || a.name.startsWith('data-n-') || a.name === 'class' || a.name === 'style') continue;
      const k = a.name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
      w[k] = a.value === '' ? true : /^-?\d+(\.\d+)?$/.test(a.value) ? Number(a.value) : a.value;
    }
    return { v, w };
  };
  const height = (w: Record<string, any>, d: number) => {
    const h = w.height;
    if (typeof h === 'number' && h > 40 && h < 4000) return `${h}px`;
    if (typeof h === 'string' && /^\d{2,4}(\.\d+)?(px|vh|em|rem)$/.test(h)) return h;
    return `${d}px`;
  };
  const fail = (el: HTMLElement, e: unknown) => {
    el.innerHTML = `<div class="n-ui-err">${K.esc(String((e as Error)?.message ?? e))}</div>`;
  };

  abstract class Part extends HTMLElement {
    off: (() => void) | null = null;
    live = false;
    abstract render(): Promise<void>;
    connectedCallback() {
      if (this.live) return;
      this.live = true;
      this.render().catch((e) => this.live && fail(this, e));
    }
    disconnectedCallback() {
      this.live = false;
      try {
        this.off?.();
      } catch {}
      this.off = null;
    }
  }

  // ---- a map -------------------------------------------------------------------------------------------------------

  /** Places from what fills a map: rows with a latitude and longitude (named, or found by their names), pairs, or "lat,lng". */
  const places = (v: unknown, w: Record<string, any>) => {
    const rows: any[] = Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v];
    const first = rows.find(isObj) ?? {};
    const find = (re: RegExp) => Object.keys(first).find((k) => re.test(k));
    const latK = typeof w.lat === 'string' ? w.lat : find(/^(lat|latitude)$/i);
    const lngK = typeof w.lng === 'string' ? w.lng : find(/^(lng|lon|long|longitude)$/i);
    const out: { lat: number; lng: number; row: any }[] = [];
    for (const r of rows) {
      let lat = NaN;
      let lng = NaN;
      if (Array.isArray(r)) [lat, lng] = [num(r[0]), num(r[1])];
      else if (typeof r === 'string') [lat, lng] = r.split(/[,\s]+/).map(num);
      else if (isObj(r)) {
        const at = isObj(r.location) ? r.location : isObj(r.coords) ? r.coords : r;
        lat = num(latK ? r[latK] : (at.lat ?? at.latitude));
        lng = num(lngK ? r[lngK] : (at.lng ?? at.lon ?? at.longitude));
      }
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) out.push({ lat, lng, row: r });
    }
    return out;
  };
  const textOf = (row: any, k: unknown, fallback: string[]) => {
    if (!isObj(row)) return '';
    if (typeof k === 'string' && k) return row[k] === undefined || row[k] === null ? '' : String(row[k]);
    const f = fallback.find((x) => typeof row[x] === 'string' && row[x]);
    return f ? String(row[f]) : '';
  };

  customElements.define(
    'n-map',
    class extends Part {
      async render() {
        const { v, w } = config(this);
        const pts = places(v, w);
        this.style.display = 'block';
        const box = document.createElement('div');
        box.className = 'n-map-box';
        box.style.height = height(w, 340);
        this.replaceChildren(box);
        if (!pts.length && !(Array.isArray(w.center) && w.center.length === 2)) {
          box.outerHTML = `<div class="n-ui-empty">${K.esc(typeof w.empty === 'string' ? w.empty : K.L('noPlaces', 'No places to show on the map.'))}</div>`;
          return;
        }
        sheet(K.libs.leafletCss);
        // Tiles placed in 2D: with 3D transforms Chrome leaves hairlines between them.
        (window as any).L_DISABLE_3D = true;
        await script(K.libs.leafletJs);
        if (!this.live) return;
        const Lf = (window as any).L;
        const t = theme();
        const map = Lf.map(box, { scrollWheelZoom: false, zoomControl: true, attributionControl: true, tap: true });
        const tiles = typeof w.tiles === 'string' && /^https:\/\/[^\s"'<>]+\{z\}[^\s"'<>]*$/.test(w.tiles) ? w.tiles : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
        Lf.tileLayer(tiles, {
          maxZoom: 19,
          referrerPolicy: 'strict-origin-when-cross-origin',
          attribution: typeof w.attribution === 'string' ? K.esc(w.attribution) : '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
          className: t.dark && !w.tiles ? 'n-map-dark' : '',
        }).addTo(map);
        const latlngs = pts.map((p) => [p.lat, p.lng]);
        if (w.line && latlngs.length > 1) Lf.polyline(latlngs, { color: t.accent, weight: 3, opacity: 0.75, dashArray: w.line === 'dashed' ? '6 8' : undefined }).addTo(map);
        pts.forEach((p, i) => {
          const label = textOf(p.row, w.label, ['name', 'title', 'label', 'place']);
          const note = textOf(p.row, w.popup, ['description', 'note', 'address', 'summary']);
          const marker = w.numbered
            ? Lf.marker([p.lat, p.lng], { icon: Lf.divIcon({ className: 'n-map-num', html: `<span>${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }), title: label })
            : Lf.circleMarker([p.lat, p.lng], { radius: 8, color: t.card, weight: 2.5, fillColor: t.accent, fillOpacity: 1 });
          if (label || note) marker.bindPopup(`${label ? `<strong>${K.esc(label)}</strong>` : ''}${label && note ? '<br>' : ''}${note ? K.esc(note) : ''}`);
          if (label && !w.numbered) marker.bindTooltip(K.esc(label), { direction: 'top', offset: [0, -6] });
          if (typeof w.event === 'string' && w.event) marker.on('click', () => K.fire(w.event, this, isObj(p.row) ? { ...p.row } : { value: p.row }));
          marker.addTo(map);
        });
        const zoom = typeof w.zoom === 'number' ? Math.max(1, Math.min(19, w.zoom)) : 13;
        if (latlngs.length > 1) map.fitBounds(latlngs, { padding: [28, 28], maxZoom: typeof w.zoom === 'number' ? zoom : 15 });
        else map.setView(latlngs[0] ?? w.center, zoom);
        // The frame changes size with the page around it: the map follows.
        const ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(box);
        this.off = () => {
          ro.disconnect();
          map.remove();
        };
      }
    },
  );

  // ---- a plot ------------------------------------------------------------------------------------------------------

  const KINDS = ['line', 'bar', 'hbar', 'scatter', 'area', 'pie', 'donut', 'histogram', 'box', 'heatmap', 'scatter3d', 'line3d', 'surface'];
  /** A Plotly figure from rows (or a grid of numbers), as the block's settings say. */
  const figure = (v: unknown, w: Record<string, any>): { data: any[]; layout: any } => {
    if (isObj(v) && Array.isArray(v.data)) return { data: v.data, layout: isObj(v.layout) ? v.layout : {} };
    if (Array.isArray(v) && v.length && v.every((r) => Array.isArray(r) && r.every((x) => typeof x === 'number'))) return { data: [{ type: w.kind === 'heatmap' ? 'heatmap' : 'surface', z: v }], layout: {} };
    const rows = (Array.isArray(v) ? v : []).filter(isObj);
    if (!rows.length) return { data: [], layout: {} };
    const keys = Object.keys(rows[0]);
    const numeric = (k: string) => rows.some((r) => Number.isFinite(num(r[k])));
    const kind: string = KINDS.includes(w.kind) ? w.kind : typeof w.z === 'string' ? 'scatter3d' : 'line';
    const xK: string = typeof w.x === 'string' ? w.x : (keys.find((k) => !numeric(k)) ?? keys[0]);
    const yKs: string[] = Array.isArray(w.y) ? w.y.map(String) : typeof w.y === 'string' ? [w.y] : keys.filter((k) => k !== xK && k !== w.z && k !== w.series && numeric(k)).slice(0, kind === 'pie' || kind === 'donut' ? 1 : 6);
    const zK: string | undefined = typeof w.z === 'string' ? w.z : undefined;
    const col = (rs: any[], k: string, n = false) => rs.map((r) => (n ? num(r[k]) : r[k]));
    const bySeries = new Map<string, any[]>();
    if (typeof w.series === 'string') for (const r of rows) bySeries.set(String(r[w.series] ?? ''), [...(bySeries.get(String(r[w.series] ?? '')) ?? []), r]);
    const groups: [string, any[]][] = bySeries.size ? [...bySeries] : [['', rows]];
    const data: any[] = [];
    if (kind === 'pie' || kind === 'donut') data.push({ type: 'pie', labels: col(rows, xK), values: col(rows, yKs[0], true), hole: kind === 'donut' ? 0.55 : 0, sort: false });
    else if (kind === 'heatmap' && zK) {
      const xs = [...new Set(col(rows, xK))];
      const ys = [...new Set(col(rows, yKs[0]))];
      const z = ys.map((y) => xs.map((x) => num(rows.find((r) => r[xK] === x && r[yKs[0]] === y)?.[zK])));
      data.push({ type: 'heatmap', x: xs, y: ys, z, colorscale: 'Viridis' });
    } else if (kind === 'surface' && zK) {
      const xs = [...new Set(col(rows, xK, true))].sort((a, b) => a - b);
      const ys = [...new Set(col(rows, yKs[0], true))].sort((a, b) => a - b);
      const z = ys.map((y) => xs.map((x) => num(rows.find((r) => num(r[xK]) === x && num(r[yKs[0]]) === y)?.[zK])));
      data.push({ type: 'surface', x: xs, y: ys, z, colorscale: 'Viridis' });
    } else
      for (const [g, rs] of groups)
        for (const y of kind === 'histogram' || kind === 'box' ? [yKs[0] ?? xK] : yKs) {
          const name = g && yKs.length > 1 ? `${g} · ${y}` : g || y;
          if (kind === 'histogram') data.push({ type: 'histogram', x: col(rs, y, true), name });
          else if (kind === 'box') data.push({ type: 'box', y: col(rs, y, true), name: g || y });
          else if (kind === 'scatter3d' || kind === 'line3d') data.push({ type: 'scatter3d', mode: kind === 'line3d' ? 'lines+markers' : 'markers', x: col(rs, xK, true), y: col(rs, y, true), z: col(rs, zK ?? y, true), name, marker: { size: 4 } });
          else if (kind === 'bar' || kind === 'hbar') data.push(kind === 'hbar' ? { type: 'bar', orientation: 'h', y: col(rs, xK), x: col(rs, y, true), name } : { type: 'bar', x: col(rs, xK), y: col(rs, y, true), name });
          else data.push({ type: 'scatter', mode: kind === 'scatter' ? 'markers' : 'lines+markers', fill: kind === 'area' ? 'tozeroy' : undefined, x: col(rs, xK), y: col(rs, y, true), name, customdata: rs.map((_r, i) => i) });
        }
    const layout: any = {};
    if (typeof w.xLabel === 'string') layout.xaxis = { title: { text: w.xLabel } };
    if (typeof w.yLabel === 'string') layout.yaxis = { title: { text: w.yLabel } };
    if (kind === 'scatter3d' || kind === 'line3d' || kind === 'surface') layout.scene = { xaxis: { title: { text: w.xLabel ?? xK } }, yaxis: { title: { text: w.yLabel ?? yKs[0] } }, zaxis: { title: { text: w.zLabel ?? zK ?? '' } } };
    if (kind === 'bar' && w.stacked) layout.barmode = 'stack';
    return { data, layout };
  };

  customElements.define(
    'n-plot',
    class extends Part {
      async render() {
        const { v, w } = config(this);
        const fig = figure(v, w);
        this.style.display = 'block';
        if (!fig.data.length) {
          this.innerHTML = `<div class="n-ui-empty">${K.esc(typeof w.empty === 'string' ? w.empty : K.L('noData', 'Nothing to draw yet.'))}</div>`;
          return;
        }
        const box = document.createElement('div');
        box.className = 'n-plot-box';
        box.style.height = height(w, 360);
        this.replaceChildren(box);
        await script(K.libs.plotlyJs);
        if (!this.live) return;
        const P = (window as any).Plotly;
        const t = theme();
        const axis = { gridcolor: t.line, zerolinecolor: t.line, linecolor: t.line, tickfont: { color: t.muted }, title: { font: { color: t.muted } } };
        const own = fig.layout;
        const layout = {
          ...own,
          title: typeof w.title === 'string' ? { text: w.title, font: { size: 15 } } : own.title,
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          font: { family: getComputedStyle(document.body ?? document.documentElement).fontFamily, color: t.fg, size: 12, ...(own.font ?? {}) },
          colorway: own.colorway ?? [t.accent, ...PALETTE],
          margin: { l: 48, r: 16, t: w.title || own.title ? 44 : 16, b: 40, ...(own.margin ?? {}) },
          xaxis: { ...axis, ...(own.xaxis ?? {}) },
          yaxis: { ...axis, ...(own.yaxis ?? {}) },
          legend: { orientation: 'h', y: -0.18, ...(own.legend ?? {}) },
          hoverlabel: { bgcolor: t.card, bordercolor: t.line, font: { color: t.fg } },
          autosize: true,
        };
        if (own.scene || fig.data.some((d) => d.type === 'scatter3d' || d.type === 'surface' || d.type === 'mesh3d'))
          layout.scene = { ...(own.scene ?? {}), xaxis: { ...axis, ...(own.scene?.xaxis ?? {}) }, yaxis: { ...axis, ...(own.scene?.yaxis ?? {}) }, zaxis: { ...axis, ...(own.scene?.zaxis ?? {}) } };
        (layout as any).modebar = { bgcolor: 'rgba(0,0,0,0)', color: t.muted, activecolor: t.fg, ...(own.modebar ?? {}) };
        await P.newPlot(box, fig.data, layout, { responsive: true, displaylogo: false, displayModeBar: 'hover', modeBarButtonsToRemove: ['sendDataToCloud', 'lasso2d', 'select2d'] });
        if (typeof w.event === 'string' && w.event) {
          const rows = Array.isArray(v) ? v : [];
          (box as any).on('plotly_click', (d: any) => {
            const p = d?.points?.[0];
            const row = typeof p?.customdata === 'number' ? rows[p.customdata] : null;
            K.fire(w.event, this, isObj(row) ? { ...row } : { x: p?.x, y: p?.y, z: p?.z, label: p?.label, value: p?.value });
          });
        }
        this.off = () => P.purge(box);
      }
    },
  );

  // ---- a video from YouTube or Vimeo -------------------------------------------------------------------------------

  // Their players need what a sandboxed page lacks (storage of their own), so the view shows the video's still with a
  // play button, and the page around it plays it.
  customElements.define(
    'n-embed',
    class extends Part {
      async render() {
        const src = this.getAttribute('src') ?? '';
        if (!/^https:\/\/(www\.youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)[\w-]+(\?[\w=&]*)?$/.test(src)) throw new Error(K.L('noVideo', 'This video cannot be shown here.'));
        const title = this.getAttribute('title') ?? 'Video';
        const yt = /\/embed\/([\w-]{6,20})/.exec(src)?.[1];
        this.style.display = 'block';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'n-embed-frame n-embed-still';
        b.setAttribute('aria-label', `${K.L('play', 'Play')}: ${title}`);
        if (yt) b.style.backgroundImage = `url("https://i.ytimg.com/vi/${yt}/hqdefault.jpg")`;
        b.innerHTML = `<span class="n-embed-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg></span><span class="n-embed-from">${yt ? 'YouTube' : 'Vimeo'}</span>`;
        b.addEventListener('click', () => K.play(src, title));
        this.replaceChildren(b);
      }
    },
  );

  // ---- the view's own widgets --------------------------------------------------------------------------------------

  // Each widget's module, by its code (a changed widget loads afresh).
  const modules = new Map<string, Promise<any>>();
  const moduleOf = (name: string, code: string) => {
    const key = `${name}\n${code}`;
    if (!modules.has(key)) {
      const url = URL.createObjectURL(new Blob([`${code}\n//# sourceURL=widget-${name}.js`], { type: 'text/javascript' }));
      modules.set(key, import(/* @vite-ignore */ url));
    }
    return modules.get(key)!;
  };

  customElements.define(
    'n-widget',
    class extends Part {
      async render() {
        const name = this.getAttribute('name') ?? '';
        const def = K.widgets?.[name];
        if (!def) throw new Error(`${K.L('noWidget', 'No widget')}: ${name}`);
        const { v, w } = config(this);
        this.style.display = 'block';
        const host = document.createElement('div');
        host.className = `n-widget-${name}`;
        host.style.minHeight = def.height ?? height(w, 320);
        this.replaceChildren(host);
        const mod = await moduleOf(name, def.code);
        if (!this.live) return;
        const draw = typeof mod?.default === 'function' ? mod.default : typeof mod?.render === 'function' ? mod.render : null;
        if (!draw) throw new Error(`${name}: its code exports no function (export default function (el, value, view) { … })`);
        const view = {
          with: w,
          theme: theme(),
          lang: K.lang,
          asset: (n: string) => K.url(`asset:${n}`),
          media: (src: string) => K.url(String(src ?? '')),
          event: (ev: string, item?: unknown) => K.fire(String(ev), this, isObj(item) ? { ...item } : item === undefined ? {} : { value: item }),
          set: (k: string, value: unknown) => {
            K.setAt(String(k), value);
            K.draw();
          },
          get state() {
            return JSON.parse(JSON.stringify(K.state()));
          },
          resize: () => window.dispatchEvent(new Event('resize')),
        };
        // Once it has drawn, its own height wins.
        const off = await draw(host, v, view);
        if (this.live && host.childElementCount) host.style.minHeight = '';
        if (typeof off === 'function') this.off = off;
      }
    },
  );
}

const scriptSafe = (src: string) => src.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
export const MEDIA_SRC = scriptSafe(mediaKit.toString());

/** The look of the parts it draws, in the page kit's colours. */
export const MEDIA_CSS = `
.n-ui-images{display:grid;grid-template-columns:repeat(var(--n-cols,1),minmax(0,1fr));gap:10px}
.n-ui-images.n-ui-auto{grid-template-columns:repeat(auto-fill,minmax(min(100%,200px),1fr))}
.n-ui-fig{margin:0;min-width:0}
.n-ui-fig img{display:block;width:100%;height:var(--n-h,auto);max-height:70vh;object-fit:var(--n-fit,cover);border-radius:var(--n-radius);background:var(--n-soft);cursor:zoom-in}
.n-ui-fig figcaption,.n-ui-cap{margin-top:6px;color:var(--n-muted);font-size:13px;line-height:1.4}
.n-ui-video video,.n-ui-video .n-embed-frame{display:block;width:100%;aspect-ratio:16/9;height:auto;border:0;border-radius:var(--n-radius);background:#000}
.n-embed-still{position:relative;padding:0;cursor:pointer;background-size:cover;background-position:center}
.n-embed-play{position:absolute;left:50%;top:50%;display:grid;place-items:center;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(0,0,0,.62);color:#fff;transition:transform .15s,background .15s}
.n-embed-still:hover .n-embed-play{transform:scale(1.06);background:rgba(0,0,0,.78)}
.n-embed-from{position:absolute;left:10px;bottom:8px;padding:2px 8px;border-radius:6px;background:rgba(0,0,0,.6);color:#fff;font-size:12px}
.n-ui-video+.n-ui-video{margin-top:14px}
.n-ui-audio audio{display:block;width:100%}
.n-ui-audio+.n-ui-audio{margin-top:10px}
.n-ui-file{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--n-line);border-radius:var(--n-radius);color:var(--n-fg);text-decoration:none;font-size:14px}
.n-ui-file:hover{border-color:var(--n-accent)}
n-map,n-plot,n-widget,n-embed{display:block;min-width:0}
.n-map-box{width:100%;border-radius:var(--n-radius);overflow:hidden;border:1px solid var(--n-line);z-index:0}
.n-map-box .leaflet-container{font:inherit}
.n-map-box.leaflet-container{background:var(--n-soft)}
.n-map-dark img.leaflet-tile{filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.9)}
.n-map-num span{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--n-accent);color:#fff;font-weight:600;font-size:12px;border:2px solid var(--n-card);box-shadow:0 1px 3px rgba(0,0,0,.3)}
.n-plot-box{width:100%}
`.trim();
