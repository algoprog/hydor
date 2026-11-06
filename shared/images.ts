// Image generation through OpenRouter: the settings (Settings → Images, video and audio) and the models to pick from.
import type { MediaParam } from './media.ts';

/** An OpenRouter model that makes images. */
export interface ImageModel {
  /** OpenRouter's id, e.g. "google/gemini-2.5-flash-image". */
  id: string;
  label: string;
  org?: string;
  description?: string;
  /** Listed on OpenRouter (ms). */
  created?: number;
  /** About what one image costs, in US dollars (a 1-megapixel image; OpenRouter bills by image tokens). */
  perImage?: number;
  /** It writes text with its images. */
  textOut: boolean;
  /** It takes pictures to change or follow. */
  edits: boolean;
  /** How many pictures it takes to work from, when OpenRouter says. */
  maxRefs?: number;
  /** The settings it takes (shape, resolution, quality, how many…), as OpenRouter lists them. */
  params?: MediaParam[];
}

export interface ImagesState {
  /** Agents get the generate_image tool. */
  enabled: boolean;
  /** The model picked, or '' for the app's choice: the Best one, for most pictures and every change to one. */
  model: string;
  /** The model it uses now (the one picked, or the app's choice). */
  using: string;
  usingInfo?: ImageModel;
  /** The Quick model picked for simple pictures (icons, backgrounds, textures), or '' for the app's choice. */
  quick: string;
  usingQuick: string;
  usingQuickInfo?: ImageModel;
  /** An OpenRouter key is set (Settings → Models). */
  keySet: boolean;
}

// ---- pictures, drawings, plots and videos for documents, slides and pages -----------------------------------
// The editors' AI tools (web/src/features/images/studio) and the agents' tools share these shapes. Two image
// models do the work: Quick, for simple pictures (icons, backgrounds, textures, patterns), and Best, for the rest
// (scenes, photos, words inside a picture, diagrams, changes to a picture). "auto" picks one by what is asked
// (shared/image-tier.ts). Pictures made are kept by the app as the editors' uploads are ("naget-asset:<sha>").

/** How good (and dear) the model is: Quick for simple pictures, Best for the rest. */
export type ImageTier = 'quick' | 'best';
export type TierChoice = ImageTier | 'auto';

/** What a picture is for: on Auto it picks the tier, and it words what the model is asked. */
export type PictureKind = 'picture' | 'photo' | 'illustration' | 'background' | 'icon' | 'logo' | 'diagram' | 'texture';

/** A picture kept by the app. */
export interface MadePicture {
  /** "naget-asset:<sha>". */
  src: string;
  w: number;
  h: number;
  mime: string;
}

/** POST /api/images/make: new pictures from words (and pictures to follow). */
export interface MakeImageAsk {
  prompt: string;
  kind?: PictureKind;
  /** A look, in words: "watercolour", "flat vector", "3D render", "photo, soft light"… */
  style?: string;
  /** "16:9", "1:1"… (what the model takes; the nearest otherwise). */
  aspect?: string;
  tier?: TierChoice;
  /** A see-through background (icons, logos): a model that can makes it, else the background is taken out after. */
  transparent?: boolean;
  /** 1 to 4. */
  count?: number;
  /** Pictures to follow or change: kept ones ("naget-asset:<sha>") or data: addresses. */
  refs?: string[];
  /** Another OpenRouter model than the tier's. */
  model?: string;
}
export interface MakeImageAnswer {
  pictures: MadePicture[];
  model: string;
  tier: ImageTier;
  /** US dollars, when OpenRouter says. */
  cost?: number;
  /** What the model said with its pictures, if anything. */
  text?: string;
}

/** POST /api/images/edit: a picture changed as the words say; with a mask, only where it is white. */
export interface EditImageAsk {
  src: string;
  prompt: string;
  /** A PNG data: address the picture's size (or its shape): white where it may change, black where it stays. */
  mask?: string;
  tier?: TierChoice;
  model?: string;
  /** The answer with a see-through background (a model that can make one is used). */
  transparent?: boolean;
}

/** A picture made from another one (edited, its background taken out, part of it erased). */
export interface PictureAnswer extends MadePicture {
  /** On this computer (the picture tools) or by a model through OpenRouter. */
  how: 'local' | 'cloud';
  model?: string;
  cost?: number;
  /**
   * A model's whole picture, made with a mask: it is to be kept only where the mask is white, the rest of the picture
   * as it was (the editors put it in on a canvas with a softened edge, then keep the result). Not set: it is the result.
   */
  whole?: boolean;
  /** Why it went the way it did, or what to look at (on auto: "The background remover on this computer was unsure where the subject ends, so an image model did it."). */
  why?: string;
}

/** POST /api/images/cutout: the picture with its background taken out (a PNG with see-through parts). */
export interface CutoutAsk {
  src: string;
  /**
   * auto: on this computer when the picture tools are set up and the result looks right, else by an image model through
   * OpenRouter; local; ai (cloud: the same as ai).
   */
  how?: 'auto' | 'local' | 'ai' | 'cloud';
}

/** POST /api/images/erase: what is under the mask taken away, the rest of the picture as it was. */
export interface EraseAsk {
  src: string;
  /** A PNG data: address: white where to erase. */
  mask: string;
  /** auto: a small area on this computer when the picture tools are set up, a large one (or one among detailed things) by an image model; local; ai (cloud: the same as ai). */
  how?: 'auto' | 'local' | 'ai' | 'cloud';
  /** What to put there instead (through OpenRouter only): "grass", "a calm sea". */
  prompt?: string;
}

/** What a drawing (SVG) is: on Auto, simple kinds are written by a model, illustrations drawn by a vector model. */
export type DrawingKind = 'icon' | 'illustration' | 'diagram' | 'pattern' | 'logo' | 'shape';

/** POST /api/images/svg: a drawing (SVG) from words. */
export interface SvgAsk {
  prompt: string;
  kind?: DrawingKind;
  aspect?: string;
  /** quick: written as SVG by a model (Claude, or the helper model); best: drawn by a vector model through OpenRouter (Recraft). */
  tier?: TierChoice;
  /** Colours to draw with (#hex), such as the deck's theme. */
  colors?: string[];
}
export interface SvgAnswer extends MadePicture {
  /** The drawing's SVG, cleaned (no scripts, links out or styles that load anything). */
  svg: string;
  model: string;
  tier: ImageTier;
  cost?: number;
}

/** A model a tier uses, and about what a picture costs with it. */
export interface TierModel {
  id: string;
  label: string;
  perImage?: number;
}

/** The picture tools on this computer: free and private (background removal, erasing, plots), set up once. */
export interface LocalToolsState {
  /** Set up and ready to use. */
  ready: boolean;
  /** Being set up now: what it is doing. */
  installing: boolean;
  step?: string;
  /** Why the last set-up or use failed. */
  error?: string;
  /** This computer can set them up (it has a Python 3.10 or later, or uv). */
  canInstall: boolean;
  /** Why it cannot, in words. */
  why?: string;
  /** About how much the set-up downloads, in MB (the environment; each model downloads the first time its tool is used). */
  sizeMb: number;
  /** The models already downloaded (cutout: about 190 MB, erase: about 210 MB). */
  downloaded: ('cutout' | 'erase')[];
  /** The models in memory now (each loads when needed and unloads after a few idle minutes). */
  loaded: ('cutout' | 'erase')[];
}

/** GET /api/images/tiers: what the editors' AI tools would use now, for their price lines. */
export interface TiersInfo {
  /** An OpenRouter key is set (Settings → Models). */
  keySet: boolean;
  quick: TierModel;
  best: TierModel;
  /** The vector model for Best drawings. */
  vector: TierModel;
  /** The model for see-through backgrounds, when the tier's own cannot make them. */
  transparent: TierModel;
  /** Who writes drawings' SVG and plots' code: "Claude", or the helper model's name. */
  writer: string;
  /** The video model, and what a second of video costs with it. */
  video: { id: string; label: string; perSecond?: number };
  local: LocalToolsState;
}

/** POST /api/plots/make: a plot from words (and data), its code written by a model and run on this computer. */
export interface PlotAsk {
  /** What to plot: "monthly sales as bars, 2025 against 2026". */
  request: string;
  /** The data: CSV, TSV or JSON text (up to 200 KB). */
  data?: string;
  /** The colours and font to draw in (the deck's theme, the document's look). */
  theme?: { colors?: string[]; fg?: string; bg?: string; font?: string };
  /** Its size in pixels (it keeps its shape). */
  w?: number;
  h?: number;
  format?: 'svg' | 'png';
  /** To change a plot made before: the code it was made with, and what to change. */
  code?: string;
  change?: string;
  /** Also a version that moves and answers the pointer (for slides in the web format): an HTML part. */
  interactive?: boolean;
}
export interface PlotAnswer extends MadePicture {
  /** The Python (matplotlib) code it was made with. */
  code: string;
  /** The interactive version: a small page (Plotly), for a slide's custom code part. */
  html?: string;
  /** What the model said about the plot, if anything. */
  notes?: string;
  model?: string;
}

/** POST /api/videos/make: a video from words (and a picture to start on); GET /api/videos/make/:job follows it. */
export interface MakeVideoAsk {
  prompt: string;
  /** Seconds. */
  duration?: number;
  aspect?: string;
  resolution?: string;
  audio?: boolean;
  /** A kept picture to start on ("naget-asset:<sha>"). */
  first?: string;
  model?: string;
}
export interface VideoJob {
  job: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  model: string;
  /** Done: the video, kept as the slides' videos are ("naget-video:<sha>"), and its first frame ("naget-asset:<sha>"). */
  src?: string;
  poster?: string;
  w?: number;
  h?: number;
  seconds?: number;
  /** US dollars: what it cost, or about what it will. */
  cost?: number;
  error?: string;
  startedAt: number;
}
