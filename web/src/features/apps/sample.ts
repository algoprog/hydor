// A made-up answer for an app that has not run yet: what the builder's preview and its Design show.
import type { AnswerField, AppRecipe } from '@shared/apps';
import { mediaKind } from '@shared/app-media';

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * A made-up answer in the shape of its answer fields, to see a view with before it has run: its own files stand in
 * for pictures and videos, and columns named for a latitude and longitude get places near one another. A card field
 * gets its card's example (`example`: from the catalog of cards, which the pages load only where they need it; without
 * it, a card with just a title).
 */
export function sampleResult(answer: AnswerField[], assets: AppRecipe['assets'] = {}, example?: (ui: string) => Record<string, unknown> | undefined): Record<string, unknown> {
  const day = (n: number) => isoDay(new Date(Date.now() + n * 86_400_000));
  const files = Object.entries(assets);
  const pics = files.filter(([n, a]) => mediaKind(n, a.mime) === 'image').map(([n]) => `asset:${n}`);
  const cell = (type: string, label: string, n: number, id = ''): unknown =>
    type === 'number' && /^(lat|latitude)$/i.test(id)
      ? Math.round((38.712 - n * 0.006) * 1e4) / 1e4
      : type === 'number' && /^(lng|lon|long|longitude)$/i.test(id)
        ? Math.round((-9.14 - n * 0.018) * 1e4) / 1e4
        : type === 'number'
          ? 10 * n
          : type === 'yesno'
            ? n % 2 === 1
            : type === 'date'
              ? day(n)
              : type === 'url'
                ? `https://example.com/${n}`
                : type === 'image'
                  ? (pics[(n - 1) % Math.max(1, pics.length)] ?? '')
                  : `${label} ${n}`;
  return Object.fromEntries(
    answer.map((f) => [
      f.id,
      f.type === 'table'
        ? [1, 2, 3].map((n) => Object.fromEntries((f.columns ?? []).map((c) => [c.id, cell(c.type, c.label, n, c.id)])))
        : f.type === 'list'
          ? [1, 2, 3].map((n) => `${f.label} ${n}`)
          : f.type === 'markdown'
            ? `**${f.label}**: a few sentences of it, as a run would give them.\n\n- One point\n- Another point`
            : f.type === 'media'
              ? files.slice(0, 4).map(([n, a]) => ({ src: `asset:${n}`, caption: a.caption ?? n, kind: mediaKind(n, a.mime) }))
              : f.type === 'ui'
                ? ((f.ui && example?.(f.ui)) ?? { title: f.label })
                : cell(f.type, f.label, 1, f.id),
    ]),
  );
}
