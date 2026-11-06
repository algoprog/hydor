// Which of the editors' AI tools is open, and who is waiting for what it makes. Each tool is a dialog (a sheet on a
// phone) that the functions in index.ts open from anywhere: documents, slides, pages. StudioHost, on every page,
// shows the one asked for; when it closes, the editor that asked hears what was made, or nothing.
import { create } from 'zustand';
import type { DrawingKind, MadePicture, PictureKind, PlotAnswer, PlotAsk } from '@shared/images';

/** Make a picture with AI: what it is for, its shape, a see-through background, pictures to follow, words to start from, the colours around it. */
export interface PictureOpts {
  kind?: PictureKind;
  aspect?: string;
  transparent?: boolean;
  refs?: string[];
  prompt?: string;
  theme?: { colors: string[] };
}
/** Change a picture: its source, and the tool to open on. */
export interface EditOpts {
  src: string;
  mode?: 'change' | 'cutout' | 'erase';
}
/** A drawing (SVG): what it is, its shape, the colours to draw with. */
export interface DrawingOpts {
  kind?: DrawingKind;
  aspect?: string;
  colors?: string[];
}
/** A plot: the data the editor has (a table's cells, a chart's series), the look, its size, the version that moves, the code it was made with. */
export interface PlotOpts {
  data?: string;
  /** Where `data` came from, as the dialog says it: "From the table", "From the chart". */
  dataFrom?: string;
  theme?: PlotAsk['theme'];
  w?: number;
  h?: number;
  interactive?: boolean;
  code?: string;
}
/** A video: its shape, and a kept picture to start on. */
export interface VideoOpts {
  aspect?: string;
  first?: string;
}
/** A video made: kept as decks keep theirs ("naget-video:<sha>"), its first frame a kept picture. */
export interface MadeVideo {
  src: string;
  poster?: string;
  w?: number;
  h?: number;
}
/** What was made from words carries them: a good start for the picture's description. */
export type MadeFromWords = MadePicture & { prompt?: string };
export type MadeDrawing = MadePicture & { svg: string; prompt?: string };
export type MadePlot = PlotAnswer & { prompt?: string };

export type StudioAsk =
  | { tool: 'picture'; o: PictureOpts; done: (v: MadeFromWords | null) => void }
  | { tool: 'edit'; o: EditOpts; done: (v: MadePicture | null) => void }
  | { tool: 'drawing'; o: DrawingOpts; done: (v: MadeDrawing | null) => void }
  | { tool: 'plot'; o: PlotOpts; done: (v: MadePlot | null) => void }
  | { tool: 'video'; o: VideoOpts; done: (v: MadeVideo | null) => void };

export type Tool = StudioAsk['tool'];

/** The tool open now (`n` tells one opening from the next), or none. */
export const useStudio = create<{ ask: (StudioAsk & { n: number }) | null }>(() => ({ ask: null }));

let seq = 0;

/** Opens a tool; another one open is closed first, having made nothing. */
export function openTool<A extends StudioAsk>(tool: A['tool'], o: A['o']): Promise<Parameters<A['done']>[0]> {
  return new Promise((resolve) => {
    const prev = useStudio.getState().ask;
    useStudio.setState({ ask: { tool, o, done: resolve, n: ++seq } as StudioAsk & { n: number } });
    prev?.done(null);
  });
}

/** Closes the tool open, handing over what it made (null: nothing), once. */
export function closeTool(n: number, made: unknown) {
  const a = useStudio.getState().ask;
  if (!a || a.n !== n) return;
  useStudio.setState({ ask: null });
  (a.done as (v: unknown) => void)(made ?? null);
}

/** Closes the tool open without a word to the editor yet: a video still being made hands itself over when it is done (videoJobs.ts). */
export function letGo(n: number): ((made: MadeVideo | null) => void) | null {
  const a = useStudio.getState().ask;
  if (!a || a.n !== n || a.tool !== 'video') return null;
  useStudio.setState({ ask: null });
  return a.done;
}
