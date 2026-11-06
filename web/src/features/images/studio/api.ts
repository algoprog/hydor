// The routes the editors' AI tools use (server/images): what each tier would use now and costs, pictures made and
// changed through OpenRouter, the picture tools on this computer (cutouts and erasing, free and private once set up),
// drawings, plots, and videos followed as they are made.
import type { CutoutAsk, EditImageAsk, EraseAsk, LocalToolsState, MakeImageAnswer, MakeImageAsk, MakeVideoAsk, PictureAnswer, PlotAnswer, PlotAsk, SvgAnswer, SvgAsk, TiersInfo, VideoJob } from '@shared/images';
import type { VideosState } from '@shared/media';
import { api, del, enc, post } from '../../../lib/api';

export const getTiers = () => api<TiersInfo>('/api/images/tiers');
export const makeImages = (a: MakeImageAsk, signal?: AbortSignal) => api<MakeImageAnswer>('/api/images/make', { body: a, signal });
export const editImage = (a: EditImageAsk, signal?: AbortSignal) => api<PictureAnswer>('/api/images/edit', { body: a, signal });
export const cutout = (a: CutoutAsk, signal?: AbortSignal) => api<PictureAnswer>('/api/images/cutout', { body: a, signal });
export const erase = (a: EraseAsk, signal?: AbortSignal) => api<PictureAnswer>('/api/images/erase', { body: a, signal });
export const makeSvg = (a: SvgAsk, signal?: AbortSignal) => api<SvgAnswer>('/api/images/svg', { body: a, signal });
export const makePlotNow = (a: PlotAsk, signal?: AbortSignal) => api<PlotAnswer>('/api/plots/make', { body: a, signal });
export const startVideo = (a: MakeVideoAsk) => post<VideoJob>('/api/videos/make', a);
export const videoJob = (job: string) => api<VideoJob>(`/api/videos/make/${enc(job)}`);
export const videoSettings = () => api<VideosState>('/api/videos/settings');

export const localState = () => api<LocalToolsState>('/api/images/local');
export const setUpLocal = () => post<LocalToolsState | undefined>('/api/images/local/setup');
export const removeLocal = () => del<LocalToolsState | undefined>('/api/images/local');
