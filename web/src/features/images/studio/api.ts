// The routes the editors' AI tools use (server/images): what each tier would use now and costs, pictures made and
// changed through OpenRouter, the picture tools on this computer (cutouts and erasing, free and private once set up),
// drawings, plots, and videos followed as they are made.
import type { CutoutAsk, EditImageAsk, EraseAsk, LocalToolsState, MakeImageAnswer, MakeImageAsk, MakeVideoAsk, PictureAnswer, PlotAnswer, PlotAsk, SvgAnswer, SvgAsk, TiersInfo, UpscaleAsk, VideoJob } from '@shared/images';
import type { VideosState } from '@shared/media';
import { api, del, enc, post } from '../../../lib/api';
import { mu } from '../../../lib/machine';

export const getTiers = () => api<TiersInfo>('/api/images/tiers');
export const makeImages = (a: MakeImageAsk, signal?: AbortSignal) => api<MakeImageAnswer>('/api/images/make', { body: a, signal });
export const editImage = (a: EditImageAsk, signal?: AbortSignal) => api<PictureAnswer>('/api/images/edit', { body: a, signal });
export const cutout = (a: CutoutAsk, signal?: AbortSignal) => api<PictureAnswer>('/api/images/cutout', { body: a, signal });
export const erase = (a: EraseAsk, signal?: AbortSignal) => api<PictureAnswer>('/api/images/erase', { body: a, signal });
/** The picture made 2× or 4× larger on this computer: the PNG itself, and its size. */
export async function upscale(a: UpscaleAsk, signal?: AbortSignal): Promise<{ blob: Blob; w: number; h: number; model: string }> {
  const r = await fetch(mu('/api/images/upscale'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(a), signal, credentials: 'same-origin' });
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error || `The picture could not be made larger (${r.status})`);
  return { blob: await r.blob(), w: Number(r.headers.get('x-width')) || 0, h: Number(r.headers.get('x-height')) || 0, model: r.headers.get('x-model') || 'Real-ESRGAN' };
}
export const makeSvg = (a: SvgAsk, signal?: AbortSignal) => api<SvgAnswer>('/api/images/svg', { body: a, signal });
export const makePlotNow = (a: PlotAsk, signal?: AbortSignal) => api<PlotAnswer>('/api/plots/make', { body: a, signal });
export const startVideo = (a: MakeVideoAsk) => post<VideoJob>('/api/videos/make', a);
export const videoJob = (job: string) => api<VideoJob>(`/api/videos/make/${enc(job)}`);
export const videoSettings = () => api<VideosState>('/api/videos/settings');

export const localState = () => api<LocalToolsState>('/api/images/local');
export const setUpLocal = () => post<LocalToolsState | undefined>('/api/images/local/setup');
export const removeLocal = () => del<LocalToolsState | undefined>('/api/images/local');
