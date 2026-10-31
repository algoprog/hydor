// Image generation through OpenRouter: the settings (Settings → Images) and the models to pick from.

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
}

export interface ImagesState {
  /** Agents get the generate_image tool. */
  enabled: boolean;
  /** The model picked, or '' for the app's choice. */
  model: string;
  /** The model it uses now (the one picked, or the app's choice). */
  using: string;
  usingInfo?: ImageModel;
  /** An OpenRouter key is set (Settings → Models). */
  keySet: boolean;
}
