// Two parts of an app's Edit: the keys it needs (Settings: each by its name in the vault, what it is, where it may
// go and where to get one; values are never part of the app), and its own files (Design: pictures, videos, sounds and
// data its view shows as asset:<name>, which travel in its .hydor-app). A file is kept as soon as it is picked; the app
// names it once Edit saves.
import { useRef, useState } from 'react';
import { Copy, FileAudio, FileText, FileVideo, Plus, Trash2, Upload } from 'lucide-react';
import type { AppRecipe } from '@shared/apps';
import { assetPath, ASSET_NAME, MEDIA_LIMITS, mediaKind, type AppAsset } from '@shared/app-media';
import type { AppSecret } from '@shared/app-secrets';
import { cleanDomains, secretName } from '@shared/connections';
import { post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { openLightbox } from '../../components/Lightbox';
import { Button, cx, IconButton, inputCls, Switch, Throbber } from '../../components/ui';
import { fileToBase64 } from './api';

const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** The keys an app needs, as rows to change. */
export function SecretsEditor({ recipe, onChange }: { recipe: AppRecipe; onChange: (p: Partial<AppRecipe>) => void }) {
  const list = recipe.secrets ?? [];
  const put = (i: number, s: Partial<AppSecret>) => onChange({ secrets: list.map((x, j) => (j === i ? { ...x, ...s } : x)) });
  const add = () => onChange({ secrets: [...list, { name: '', label: '', domains: [] }] });
  return (
    <div className="space-y-2">
      <p className="text-[12.5px] leading-snug text-fg-3">Each by its name in your vault (Apps → Connected apps → Keys). Whoever installs the app gives them on its install card, or before its first run.</p>
      {list.map((s, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={cx(inputCls, 'h-8.5 min-w-[180px] flex-1 font-mono text-[12.5px]')}
              placeholder="NAME_IN_THE_VAULT"
              value={s.name}
              onChange={(e) => put(i, { name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
              onBlur={(e) => put(i, { name: secretName(e.target.value) })}
              aria-label="Its name in the vault"
            />
            <input className={cx(inputCls, 'h-8.5 min-w-[180px] flex-[2] text-[13px]')} placeholder="What it is, e.g. OpenWeather API key" value={s.label} onChange={(e) => put(i, { label: e.target.value })} aria-label="What it is" />
            <IconButton label="Remove" size="sm" onClick={() => onChange({ secrets: list.filter((_, j) => j !== i).length ? list.filter((_, j) => j !== i) : undefined })}>
              <Trash2 size={14} />
            </IconButton>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] text-fg-3">Where it may go (hosts)</span>
              <input
                className={cx(inputCls, 'h-8.5 text-[13px]')}
                placeholder="api.openweathermap.org"
                defaultValue={(s.domains ?? []).join(', ')}
                onBlur={(e) => put(i, { domains: cleanDomains(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] text-fg-3">Where to get one</span>
              <input className={cx(inputCls, 'h-8.5 text-[13px]')} placeholder="https://…" value={s.url ?? ''} onChange={(e) => put(i, { url: e.target.value || undefined })} />
            </label>
          </div>
          <input className={cx(inputCls, 'h-8.5 text-[13px]')} placeholder="A line on how to get it (optional)" value={s.help ?? ''} onChange={(e) => put(i, { help: e.target.value || undefined })} />
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-fg-2">
            <label className="flex items-center gap-2">
              <Switch on={!!s.optional} onChange={(on) => put(i, { optional: on || undefined })} label="It can run without it" />
              It can run without it
            </label>
            <label className="flex items-center gap-2">
              <Switch on={!!s.commands} onChange={(on) => put(i, { commands: on || undefined })} label="Commands use it" />
              Commands on this computer use it
            </label>
          </div>
        </div>
      ))}
      <Button size="sm" variant="subtle" icon={<Plus size={14} />} onClick={add}>
        Add a key it needs
      </Button>
    </div>
  );
}

/** An app's own files: a tile each (a picture shows itself), its name to use as asset:<name>, and Remove. */
export function FilesEditor({ recipe, onChange }: { recipe: AppRecipe; onChange: (p: Partial<AppRecipe>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const assets = recipe.assets ?? {};
  const names = Object.keys(assets);
  const total = Object.values(assets).reduce((n, a) => n + a.bytes, 0);
  const add = async (files: FileList | null) => {
    const list = [...(files ?? [])];
    if (!list.length) return;
    const next: Record<string, AppAsset> = { ...assets };
    setBusy(list.length);
    try {
      for (const f of list) {
        if (f.size > MEDIA_LIMITS.asset) {
          toast(`${f.name} is over ${MEDIA_LIMITS.asset >> 20} MB`, 'error');
          continue;
        }
        let name = f.name.replace(/[^\w.\- ()]+/g, '_').replace(/^[^A-Za-z0-9]+/, '').slice(0, 100) || 'file';
        if (!ASSET_NAME.test(name)) name = `file-${names.length + 1}`;
        const r = await post<{ asset: AppAsset }>('/api/apps/assets', { name, data: await fileToBase64(f) });
        next[name] = r.asset;
        setBusy((n) => n - 1);
      }
      if (Object.values(next).reduce((n, a) => n + a.bytes, 0) > MEDIA_LIMITS.assets) return toast(`An app's files are at most ${MEDIA_LIMITS.assets >> 20} MB together`, 'error');
      onChange({ assets: next });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(0);
    }
  };
  const remove = (name: string) => {
    const { [name]: _gone, ...rest } = assets;
    onChange({ assets: Object.keys(rest).length ? rest : undefined });
  };
  const pics = names.filter((n) => mediaKind(n, assets[n].mime) === 'image');
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] leading-snug text-fg-3">
        Its view shows one as <code className="rounded bg-bg-2 px-1 font-mono text-[11.5px]">asset:name</code> (in an image, video or audio block, or a template’s src). They travel in its .hydor-app.
      </p>
      {names.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {names.map((n) => {
            const a = assets[n];
            const kind = mediaKind(n, a.mime);
            const url = assetPath(n, a);
            return (
              <div key={n} className="group overflow-hidden rounded-xl border border-line bg-panel">
                <div className="relative aspect-[4/3] overflow-hidden bg-bg-2">
                  {kind === 'image' ? (
                    <button type="button" className="absolute inset-0 cursor-zoom-in" onClick={() => openLightbox(pics.map((p) => ({ src: assetPath(p, assets[p]), name: p })), pics.indexOf(n))}>
                      <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-fg-3">{kind === 'video' ? <FileVideo size={26} /> : kind === 'audio' ? <FileAudio size={26} /> : <FileText size={26} />}</span>
                  )}
                  <IconButton label="Remove" size="sm" onClick={() => remove(n)} className="absolute top-1.5 right-1.5 bg-panel/85 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                    <Trash2 size={13} />
                  </IconButton>
                </div>
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[11.5px]" translate="no" title={n}>
                      {n}
                    </span>
                    <span className="block text-[11px] text-fg-3">{size(a.bytes)}</span>
                  </span>
                  <IconButton
                    label="Copy its name for the view"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(`asset:${n}`);
                      toast('Copied', 'ok');
                    }}
                  >
                    <Copy size={13} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="subtle" icon={busy ? <Throbber /> : <Upload size={14} />} disabled={!!busy} onClick={() => input.current?.click()}>
          {busy ? 'Adding…' : 'Add files'}
        </Button>
        {names.length > 0 && <span className="text-[12px] text-fg-3">{`${names.length} ${names.length === 1 ? 'file' : 'files'}, ${size(total)} of ${MEDIA_LIMITS.assets >> 20} MB`}</span>}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
