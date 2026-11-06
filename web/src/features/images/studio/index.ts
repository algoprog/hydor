// The editors' AI tools, for documents, slides and pages: make a picture with AI, change one (with AI, its background
// taken out, part of it erased), a drawing (SVG), a plot from data, a video. Each opens a dialog (a sheet on a phone),
// says what it costs before anything is spent, shows what it made before it is used, and resolves with it, or with
// null when it is closed. What they make is kept by the app as the editors' uploads are ("naget-asset:<sha>",
// videos "naget-video:<sha>"). StudioHost, on every page (Shell), shows them over everything else.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { MadePicture } from '@shared/images';
import { hostsMounted, StudioHost } from './Host';
import { openTool, type DrawingOpts, type EditOpts, type MadeDrawing, type MadeFromWords, type MadePlot, type MadeVideo, type PictureOpts, type PlotOpts, type StudioAsk, type VideoOpts } from './store';

export { StudioHost } from './Host';
export type { DrawingOpts, EditOpts, MadeDrawing, MadeFromWords, MadePlot, MadeVideo, PictureOpts, PlotOpts, VideoOpts } from './store';
export { keepPicture, pageData, shownSrc } from './pictures';
export { csvOf } from './logic';

let ownRoot = false;
/** A page without the app's frame around it (none has asked yet) gets a host of its own, once. */
function ensureHost() {
  if (hostsMounted() || ownRoot) return;
  ownRoot = true;
  const el = document.createElement('div');
  document.body.append(el);
  createRoot(el).render(createElement(StudioHost));
}

function open<A extends StudioAsk>(tool: A['tool'], o: A['o']) {
  ensureHost();
  return openTool<A>(tool, o);
}

/** Make a picture with AI: the words, what it is for, a look, its shape, Quick or Best, how many; then the one picked (with the words it was made from). */
export const makePicture = (o: PictureOpts = {}): Promise<MadeFromWords | null> => open<Extract<StudioAsk, { tool: 'picture' }>>('picture', o);

/** Change a picture: with AI (only where painted, if painted), its background taken out, or part of it erased; the result once kept. */
export const editPicture = (o: EditOpts): Promise<MadePicture | null> => open<Extract<StudioAsk, { tool: 'edit' }>>('edit', o);

/** A drawing (SVG): written by a model (Quick) or drawn by a vector model (Best), cleaned; kept, with its SVG. */
export const makeDrawing = (o: DrawingOpts = {}): Promise<MadeDrawing | null> => open<Extract<StudioAsk, { tool: 'drawing' }>>('drawing', o);

/** A plot from data: its code written by a model and run on this computer; the plot, its code, and the version that moves when asked. */
export const makePlot = (o: PlotOpts = {}): Promise<MadePlot | null> => open<Extract<StudioAsk, { tool: 'plot' }>>('plot', o);

/**
 * A video from words (and a picture to start on). It takes minutes: closed before it is done, it goes on being made,
 * and a note with Insert shows when it is; the promise then resolves when Insert is pressed.
 */
export const makeVideo = (o: VideoOpts = {}): Promise<MadeVideo | null> => open<Extract<StudioAsk, { tool: 'video' }>>('video', o);
