// The parts of answer UIs that draw with a library: maps (Leaflet, OpenStreetMap's tiles) and Plotly figures. They are
// drawn as apps' views draw theirs, in the pages' sandboxed frame by the view kit (server/pages/ui-kit.ts and
// media-kit.ts), with a view of one block: its map or plot element, filled with the UI's points or figure. This app's own
// pages load nothing from other sites; the frame may.
import { useMemo, useState } from 'react';
import { LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';
import { memoryStore, PageFrame, type UiBridge } from '../../features/pages/frame';
import type { MapPoint } from './kit';

const shell = (title: string, lang: string) =>
  `<!doctype html><html lang="${lang.replace(/[^\w-]/g, '')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title.replace(/[<&]/g, '')}</title><style>body.n-page{padding:0;background:transparent}</style></head><body class="n-page" data-n-fit><div id="n-ui" class="n-ui"></div></body></html>`;

/** A view of one block drawn with `result` as its values: what the frame shows. */
function OneBlock({ block, result, title, height }: { block: Record<string, unknown>; result: Record<string, unknown>; title: string; height: number }) {
  const lang = LOCALE ?? navigator.language ?? 'en';
  const html = useMemo(() => shell(title, lang), [title, lang]);
  const store = useMemo(() => memoryStore(), []);
  const [h, setH] = useState(height);
  const bridge = useMemo<UiBridge>(
    () => ({
      def: { pages: [{ id: 'main', title, blocks: [block] }] },
      ctx: { on: 'run', result, inputs: {}, run: {}, app: { name: title, description: '', id: 'answer' }, last: {}, view: {}, answer: [], assets: {} },
      can: [],
      lang,
      onOp: async () => null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawn again only when what it shows changes
    [JSON.stringify(block), JSON.stringify(result), title, lang],
  );
  return (
    <div style={{ height: Math.max(h, height) }} className="relative">
      <PageFrame html={html} title={title} store={store} onHeight={setH} ui={bridge} className="!bg-transparent" />
    </div>
  );
}

export function MapFrame({ points, route, numbered = true, ends, height = 320 }: { points: MapPoint[]; route?: boolean; numbered?: boolean; ends?: boolean; height?: number }) {
  const block = useMemo(() => ({ element: 'map', data: 'result.points', with: { lat: 'lat', lng: 'lng', label: 'name', popup: 'note', numbered, line: !!route, ends: !!ends, height } }), [numbered, route, ends, height]);
  const result = useMemo(() => ({ points }), [points]);
  return <OneBlock block={block} result={result} title={tr('Map')} height={height} />;
}

export function PlotFrame({ figure, height = 380 }: { figure: Record<string, unknown>; height?: number }) {
  const block = useMemo(() => ({ element: 'plot', data: 'result.figure', with: { height } }), [height]);
  const result = useMemo(() => ({ figure }), [figure]);
  return <OneBlock block={block} result={result} title={tr('Plot')} height={height} />;
}
