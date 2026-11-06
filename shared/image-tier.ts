// Which image model a picture needs: Quick (cheaper, faster) for simple ones, Best for the rest. On "auto" the
// editors' AI tools and generate_image decide by what the picture is for and what is asked: backgrounds, textures,
// patterns, icons and simple flat pictures go to Quick; photos, scenes, illustrations with detail, diagrams, words
// inside a picture, and every change to a picture go to Best.
import type { DrawingKind, ImageTier, PictureKind, TierChoice } from './images.ts';

/** Kinds that are simple whatever their words say. */
const QUICK_KINDS: PictureKind[] = ['background', 'texture', 'icon'];
/** Kinds that need the better model whatever their words say. */
const BEST_KINDS: PictureKind[] = ['photo', 'diagram', 'logo'];

const SIMPLE_WORDS = /\b(background|backdrop|wallpaper|texture|pattern|gradient|abstract|minimal(ist)?|simple|flat|icon|pictogram|silhouette|shapes?|bokeh|blurred|plain|solid colou?r|soft light)\b/i;
const COMPLEX_WORDS =
  /\b(photo(real(istic)?)?|realistic|portrait|people|person|crowd|faces?|hands?|scene|detailed|intricate|infographic|poster|diagram|chart|map|labels?|labelled|labeled|text|words?|title|caption|logo|typography|letters?|sign|menu|interior|architecture|product shot|cinematic|comic|storyboard)\b/i;
/** Quoted words to appear in the picture ("…" or "…"). */
const QUOTED = /["“][^"”]{2,}["”]/;

/** The tier for a picture: the one asked for, else Quick or Best by what it is for and what is asked. */
export function tierFor(choice: TierChoice | undefined, o: { prompt: string; kind?: PictureKind; edit?: boolean; refs?: number }): ImageTier {
  if (choice === 'quick' || choice === 'best') return choice;
  if (o.edit || (o.refs ?? 0) > 0) return 'best';
  if (o.kind && BEST_KINDS.includes(o.kind)) return 'best';
  const p = o.prompt ?? '';
  if (QUOTED.test(p) || COMPLEX_WORDS.test(p)) return o.kind && QUICK_KINDS.includes(o.kind) && !QUOTED.test(p) ? 'quick' : 'best';
  if (o.kind && QUICK_KINDS.includes(o.kind)) return 'quick';
  if (SIMPLE_WORDS.test(p)) return 'quick';
  // A short ask with nothing complex in it is a simple picture.
  return p.trim().split(/\s+/).length <= 8 ? 'quick' : 'best';
}

/** Words that ask a drawing for detail a vector model draws better than written SVG. */
const DETAILED_DRAWING = /\b(illustrat(ion|ed)|scene|landscape|detailed|intricate|realistic|portrait|character|mascot|poster)\b/i;

/**
 * The tier for a drawing (SVG): the one asked for, else Best (drawn by a vector model) for illustrations and
 * detailed asks, Quick (written as SVG by a model) for icons, logos, diagrams, patterns and shapes.
 */
export function drawingTierFor(choice: TierChoice | undefined, o: { prompt: string; kind?: DrawingKind }): ImageTier {
  if (choice === 'quick' || choice === 'best') return choice;
  if (o.kind === 'illustration') return 'best';
  if (o.kind) return 'quick';
  return DETAILED_DRAWING.test(o.prompt ?? '') ? 'best' : 'quick';
}
