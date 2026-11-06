// Quick and Best: which OpenRouter model makes a picture. Settings → Images, video and audio keeps two picks, the
// image model (Best: most pictures, and every change to one) and the Quick model (simple pictures: icons,
// backgrounds, textures); either left empty is the app's choice, the first of its suggestions OpenRouter still
// lists (shared/model-picks.ts). A picture with a see-through background is made by the tier's model when it can make
// one; else, with the picture tools set up on this computer, it is made on a plain background and cut out here (free,
// and the model stays the one picked); else a model that can make one makes it. Drawings at Best go to a Recraft vector
// model. GET /api/images/tiers says what each would use now, and about what it costs, for the editors' price lines.
import type { ImageModel, ImageTier, LocalToolsState, TierModel, TiersInfo } from '../../shared/images.ts';
import type { VideoModel } from '../../shared/media.ts';
import { QUICK_PICKS, SEE_THROUGH_PICKS, VECTOR_PICKS } from '../../shared/model-picks.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { loadConfig } from '../models/config.ts';
import { OPENROUTER_URL } from '../models/openrouter.ts';
import { localTools } from './hooks.ts';
import { imageModels, PREFERRED } from './openrouter.ts';
import { PREFERRED_VIDEO, videoModels } from './video.ts';
import { writerName } from './writer.ts';

/** The images setting: agents' generate_image on or off, and the two models picked ('' for the app's choice). */
export interface ImagesSettings {
  enabled: boolean;
  /** Best. */
  model: string;
  quick: string;
}

export function imagesSettings(db: DB): ImagesSettings {
  try {
    const s = JSON.parse(kvGet(db, 'images') ?? '{}');
    return { enabled: s.enabled !== false, model: typeof s.model === 'string' ? s.model : '', quick: typeof s.quick === 'string' ? s.quick : '' };
  } catch {
    return { enabled: true, model: '', quick: '' };
  }
}

export const saveImagesSettings = (db: DB, s: ImagesSettings) => kvSet(db, 'images', JSON.stringify(s));

/** OpenRouter's image models (kept for an hour), or none when it cannot be reached. */
export const imageList = () => imageModels(OPENROUTER_URL).catch(() => [] as ImageModel[]);

/** The model takes background: transparent. */
export const seesThrough = (m?: ImageModel) => !!m?.params?.some((p) => p.id === 'background' && p.values?.includes('transparent'));

const firstListed = (ids: string[], list: ImageModel[]) => ids.find((id) => list.some((m) => m.id === id));

/** The model a tier uses now: the one picked in Settings, else the first of the app's choices OpenRouter still lists. */
export function tierId(s: ImagesSettings, tier: ImageTier, list: ImageModel[]): string {
  const best = s.model || firstListed(PREFERRED, list) || PREFERRED[0];
  if (tier === 'best') return best;
  // None of Quick's choices listed, while others are: the Best one makes them.
  return (
    s.quick ||
    firstListed(
      QUICK_PICKS.map((p) => p.id),
      list,
    ) ||
    (list.length ? best : QUICK_PICKS[0].id)
  );
}

/** The vector model for Best drawings. */
export const vectorId = (list: ImageModel[]) => firstListed(VECTOR_PICKS, list) ?? VECTOR_PICKS[0];

/** What makes a picture, and how a see-through background is had. */
export interface TierPick {
  id: string;
  info?: ImageModel;
  tier: ImageTier;
  /** Ask the model for a see-through background. */
  background?: 'transparent';
  /** Made on a plain background, then cut out on this computer (the picture tools). */
  cutout?: boolean;
  /** The model that would have made it (the tier's), when another does: it cannot make see-through backgrounds, or take pictures. */
  instead?: string;
  /** A see-through background was asked of a model that cannot make one, and nothing here can take its background out. */
  opaque?: boolean;
}

/**
 * The model for a picture of this tier: the one asked for (`model`), else the tier's. A Quick model that takes no
 * pictures hands a picture with some to work from to the Best one. For a see-through background (`transparent`):
 * the model itself when it makes one; else `prefer` says which comes first, the picture tools on this computer
 * (cutout, the default: free, and the model stays the one picked) or a model that makes one (a model asked for is
 * never swapped for another).
 */
export async function tierModel(db: DB, tier: ImageTier, o: { model?: string; transparent?: boolean; refs?: number; prefer?: 'cutout' | 'model' } = {}): Promise<TierPick> {
  const list = await imageList();
  const find = (id: string) => list.find((m) => m.id === id);
  const s = imagesSettings(db);
  const refs = o.refs ?? 0;
  let id = o.model || tierId(s, tier, list);
  let info = find(id);
  let instead: string | undefined;
  if (!o.model && refs > 0 && info && !info.edits && tier === 'quick') {
    const best = find(tierId(s, 'best', list));
    if (best?.edits) {
      instead = info.label;
      [id, info] = [best.id, best];
    }
  }
  const base: TierPick = { id, info, tier, ...(instead ? { instead } : {}) };
  if (!o.transparent) return base;
  // Nothing known of the models (OpenRouter's list could not be had): ask, and OpenRouter says if it cannot.
  if (seesThrough(info) || (!info && !list.length)) return { ...base, background: 'transparent' };
  const local = !!localTools()?.ready();
  const other = () => {
    if (o.model) return undefined;
    const fits = (m?: ImageModel): m is ImageModel => !!m && seesThrough(m) && (!refs || (m.edits && (!m.maxRefs || m.maxRefs >= refs)));
    return SEE_THROUGH_PICKS[tier].map(find).find(fits);
  };
  if (local && o.prefer !== 'model') return { ...base, cutout: true };
  const alt = other();
  if (alt) return { id: alt.id, info: alt, tier, background: 'transparent', instead: info?.label ?? id };
  if (local) return { ...base, cutout: true };
  return { ...base, opaque: true };
}

const NOT_HERE: LocalToolsState = { ready: false, installing: false, canInstall: false, why: 'The picture tools are not part of this copy of the app.', sizeMb: 120, downloaded: [], loaded: [] };

/** The picture tools on this computer as they are now. */
export const localState = (): LocalToolsState => localTools()?.state() ?? NOT_HERE;

/** The video model in use: the one picked in Settings, else the first of the app's choices OpenRouter still lists. */
async function videoInUse(db: DB): Promise<{ id: string; info?: VideoModel }> {
  let picked = '';
  try {
    const s = JSON.parse(kvGet(db, 'videos') ?? '{}');
    if (typeof s.model === 'string') picked = s.model;
  } catch {}
  const list = await videoModels(OPENROUTER_URL).catch(() => [] as VideoModel[]);
  const id = picked || PREFERRED_VIDEO.find((p) => list.some((m) => m.id === p)) || PREFERRED_VIDEO[0];
  return { id, info: list.find((m) => m.id === id) };
}

/** GET /api/images/tiers: what the editors' AI tools would use now, and about what a picture or a second costs. */
export async function tiersInfo(db: DB): Promise<TiersInfo> {
  const list = await imageList();
  const s = imagesSettings(db);
  const model = (id: string): TierModel => {
    const m = list.find((x) => x.id === id);
    return { id, label: m?.label ?? id, ...(m?.perImage ? { perImage: m.perImage } : {}) };
  };
  const tier = async (t: ImageTier): Promise<TierModel> => {
    const p = await tierModel(db, t, { transparent: true });
    return { ...model(tierId(s, t, list)), ...(p.opaque ? {} : { seeThrough: { ...model(p.id), ...(p.cutout ? { cutout: true } : {}) } }) };
  };
  const video = await videoInUse(db);
  return {
    keySet: !!loadConfig().openrouter.apiKey,
    quick: await tier('quick'),
    best: await tier('best'),
    vector: model(vectorId(list)),
    transparent: model(firstListed(SEE_THROUGH_PICKS.best, list) ?? SEE_THROUGH_PICKS.best[0]),
    writer: writerName(db),
    video: { id: video.id, label: video.info?.label ?? video.id, ...(video.info?.perSecond ? { perSecond: video.info.perSecond } : {}) },
    local: localState(),
  };
}
