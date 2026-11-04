// An app's Design, in its Edit: its view (shared/app-ui.ts), seen as a run's answer would show in it (its latest
// run's, or a made-up answer when it has none), what to fix in it, and ways to change it: ask an agent to design
// it (the one the editor is beside, or a new App builder session), start from its answer, or change it as code.
import { useEffect, useMemo, useState } from 'react';
import { Code2, LayoutTemplate, Sparkles, Trash2 } from 'lucide-react';
import type { AnswerField, AppRecipe, AppRun } from '@shared/apps';
import { inputsLine } from '@shared/apps';
import type { AppUi } from '@shared/app-ui';
import { checkUi, cleanUi, defaultUi, pagesFor } from '@shared/app-ui';
import { api, enc } from '../../lib/api';
import { composeInsert } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { tr } from '../../i18n/runtime';
import { Button, cx, Segmented, useConfirm } from '../../components/ui';
import { AppView } from './View';
import { mediaKind } from '@shared/app-media';

/** A short number for a text, to draw the preview again whenever the view changes (the frame takes it once). */
const hashOf = (t: string) => {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * A made-up answer in the shape of its answer fields, to see a view with before it has run: its own files stand in
 * for pictures and videos, and columns named for a latitude and longitude get places near one another.
 */
export function sampleResult(answer: AnswerField[], assets: AppRecipe['assets'] = {}): Record<string, unknown> {
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
              : cell(f.type, f.label, 1, f.id),
    ]),
  );
}

export function DesignEditor({ recipe, appId, template, session, onChange }: { recipe: AppRecipe; appId: string | null; template?: string; session?: string; onChange: (p: Partial<AppRecipe>) => void }) {
  const ui = recipe.ui;
  const [latest, setLatest] = useState<AppRun | null>(null);
  const [source, setSource] = useState<'run' | 'sample'>('run');
  const [code, setCode] = useState<string | null>(null);
  const [codeErr, setCodeErr] = useState('');
  const [ask, confirmNode] = useConfirm();
  // Its latest finished run of the main flow with an answer: what the preview shows first.
  useEffect(() => {
    const id = appId ?? (template ? `tpl:${template}` : null);
    if (!id) return;
    api<{ runs: AppRun[] }>(`/api/apps/${enc(id)}/runs`).then((r) => setLatest(r.runs.find((x) => x.status === 'done' && !x.flow && !x.parent && x.result && Object.keys(x.result).length) ?? null), () => {});
  }, [appId, template]);
  const sample = useMemo<AppRun>(
    () => ({ id: 'sample', app: appId ?? 'test', appName: recipe.name, source: 'test', status: 'done', inputs: Object.fromEntries(recipe.fields.map((f) => [f.id, f.default || f.placeholder?.replace(/^e\.g\.\s*/i, '') || f.label])), result: sampleResult(recipe.answer, recipe.assets), createdAt: Date.now() }),
    [recipe.answer, recipe.fields, recipe.name, recipe.assets, appId],
  );
  const run = source === 'run' && latest ? latest : sample;
  const checked = useMemo(() => (ui ? checkUi(recipe) : { errors: [], warnings: [] }), [recipe]);
  const pages = ui ? pagesFor(ui, 'run') : [];
  const askAgent = () => {
    const text = ui
      ? tr(`Change the view of my app “${recipe.name}” (${appId}): `)
      : tr(`Design a view for my app “${recipe.name}” (${appId}): pages for its answer, with elements of its own that show it well, and events for what I can do there.`);
    if (session) composeInsert(text, session);
    else go(`/?assistant=app-builder&prompt=${enc(text)}`);
  };
  const openCode = () => {
    setCode(JSON.stringify(ui ?? defaultUi(recipe), null, 2));
    setCodeErr('');
  };
  const takeCode = (text: string) => {
    setCode(text);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      return setCodeErr(tr(`Not JSON yet: ${(e as Error).message}`));
    }
    const { ui: next, errors } = cleanUi(raw);
    setCodeErr(errors.slice(0, 3).join(' · '));
    if (next) onChange({ ui: next });
  };
  return (
    <div className="space-y-4">
      {!ui ? (
        <div className="rounded-2xl border border-dashed border-line px-5 py-6 text-center">
          <LayoutTemplate size={22} className="mx-auto text-fg-3" />
          <p className="mx-auto mt-2 max-w-[460px] text-[13.5px] leading-relaxed text-fg-2">
            Its answer shows as a plain card and tables. A view of its own shows it on pages, in elements made for it, with buttons that do things: go to a day, tick something off, run it again with a change, start another app.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {appId && (
              <Button variant="primary" icon={<Sparkles size={14} />} onClick={askAgent}>
                Ask an agent to design it
              </Button>
            )}
            <Button variant={appId ? 'secondary' : 'primary'} icon={<LayoutTemplate size={14} />} onClick={() => onChange({ ui: defaultUi(recipe) })}>
              Start from its answer
            </Button>
          </div>
          {!appId && <p className="mt-2 text-[12px] text-fg-3">Save it, and an agent can design it for you.</p>}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-line">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-bg-1 px-4 py-2">
              <span className="text-[12.5px] font-medium text-fg-2">Preview</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-3" translate={run === latest ? 'no' : undefined}>
                {run === latest ? inputsLine(recipe.fields, latest.inputs, 70) || tr('Its latest run') : tr('A made-up answer in its shape')}
              </span>
              {latest && (
                <Segmented
                  size="sm"
                  value={source}
                  onChange={setSource}
                  options={[
                    { value: 'run', label: 'Its latest run' },
                    { value: 'sample', label: 'Made-up answer' },
                  ]}
                />
              )}
            </div>
            <div className="bg-bg px-4 pt-4 pb-2 sm:px-6 sm:pt-5">
              {pages.length ? (
                <AppView key={`${run.id}:${hashOf(JSON.stringify(ui))}`} ui={ui} name={recipe.name} appId={appId ?? 'test'} run={run} answer={recipe.answer} can={[]} assets={recipe.assets} />
              ) : (
                <p className="py-6 text-center text-[13px] text-fg-3">Its pages show on the app’s own page, in place of its form.</p>
              )}
            </div>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-fg-3">In the preview a click opens pages and ticks things off; what reaches the app (asking its agent, running it again) works on a run’s page.</p>
        </>
      )}
      {(checked.errors.length > 0 || checked.warnings.length > 0) && (
        <ul className="space-y-1 rounded-xl border border-line bg-panel px-4 py-3 text-[12.5px] leading-snug" translate="no">
          {checked.errors.map((e) => (
            <li key={e} className="text-err">
              {e}
            </li>
          ))}
          {checked.warnings.map((w) => (
            <li key={w} className="text-warn">
              {w}
            </li>
          ))}
        </ul>
      )}
      {ui && (
        <div className="flex flex-wrap items-center gap-2">
          {appId && (
            <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} onClick={askAgent}>
              Ask an agent to change it
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<Code2 size={14} />} onClick={() => (code === null ? openCode() : setCode(null))}>
            {code === null ? 'Change it as code' : 'Hide the code'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 size={14} />}
            onClick={async () => {
              if (!(await ask({ title: tr('Remove its view?'), body: tr('Its answer shows as a plain card and tables again. Save keeps the change; until then, Versions has the view.'), confirm: tr('Remove'), danger: true }))) return;
              setCode(null);
              onChange({ ui: undefined });
            }}
          >
            Remove its view
          </Button>
          {!appId && <span className="text-[12px] text-fg-3">Save it, and an agent can change it for you.</span>}
        </div>
      )}
      {code !== null && (
        <div className="space-y-1.5">
          <textarea
            value={code}
            onChange={(e) => takeCode(e.target.value)}
            spellCheck={false}
            translate="no"
            className={cx('block h-[420px] w-full resize-y rounded-xl border border-line bg-bg-1 px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-fg outline-none focus:border-accent', codeErr && 'border-warn')}
          />
          <p className={cx('px-1 text-[12px]', codeErr ? 'text-warn' : 'text-fg-3')}>{codeErr || 'Pages, elements (HTML with {{values}}, and CSS) and events, as the guide’s API topic describes them. The preview follows what you type.'}</p>
        </div>
      )}
      {confirmNode}
    </div>
  );
}
