// New in the Library, for a diagram: the templates to start from (a blank page, a flowchart, an org chart, a mind map,
// swimlanes…), each drawn small as it will open. Loaded when Diagram is picked in New, with what draws them.
import { useEffect, useState } from 'react';
import { DARK, LIGHT } from '@shared/diagram';
import { pageSvg } from '@shared/diagram-render';
import { DIAGRAM_TEMPLATES, diagramTemplate } from '@shared/diagram-templates';
import type { Diagram } from '@shared/diagram';
import { cx } from '../../../components/ui';
import { loadIcons } from './ShapePanel';

const previews = new Map<string, string>();

/** A template's diagram, made now (its icons from Lucide's). */
export async function diagramFrom(id: string): Promise<Diagram> {
  const m = await loadIcons();
  return (diagramTemplate(id) ?? DIAGRAM_TEMPLATES[0]).build({ icon: m.iconPaths });
}

export default function NewDiagram({ value, onPick, dark }: { value: string; onPick: (id: string) => void; dark: boolean }) {
  const [ready, setReady] = useState(previews.size > 0);
  useEffect(() => {
    if (ready) return;
    let alive = true;
    void loadIcons().then((m) => {
      for (const t of DIAGRAM_TEMPLATES) {
        if (t.id === 'blank') continue;
        try {
          const d = t.build({ icon: m.iconPaths });
          previews.set(`${t.id}:light`, pageSvg(d, d.pages[0], { theme: LIGHT, margin: 16 }).svg);
          previews.set(`${t.id}:dark`, pageSvg(d, d.pages[0], { theme: DARK, margin: 16 }).svg);
        } catch {}
      }
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [ready]);
  return (
    <div data-i18n="diagram" className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto pr-0.5 sm:grid-cols-4">
      {DIAGRAM_TEMPLATES.map((t) => {
        const svg = previews.get(`${t.id}:${dark ? 'dark' : 'light'}`);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            className={cx('flex flex-col overflow-hidden rounded-xl border text-left transition-colors', value === t.id ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-2')}
          >
            {t.id === 'blank' ? (
              <span className="flex aspect-[4/3] items-center justify-center bg-bg-1">
                <span className="flex h-1/2 w-1/2 items-center justify-center rounded-md border-2 border-dashed border-line-2 text-[22px] text-fg-3">+</span>
              </span>
            ) : (
              <span
                translate="no"
                className="relative block aspect-[4/3] overflow-hidden bg-bg-1 [&>svg]:absolute [&>svg]:inset-1.5 [&>svg]:h-[calc(100%-12px)] [&>svg]:w-[calc(100%-12px)]"
                dangerouslySetInnerHTML={{ __html: svg ? svg.replace(/ width="\d+" height="\d+"/, '') : '' }}
              />
            )}
            <span className="block border-t border-line px-2 py-1.5">
              <span className="block truncate text-[12.5px] font-medium text-fg">{t.label}</span>
              <span className="block truncate text-[11.5px] text-fg-3">{t.blurb}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
